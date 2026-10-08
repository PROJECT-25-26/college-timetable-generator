"""
Generate router — timetable generation endpoint.

Endpoints:
  GET  /generate-timetable/health    — verify the solver library is importable
  GET  /generate-timetable/payload   — assemble & return a ready-to-submit TimetableRequest
  POST /generate-timetable           — run solver, save result, return TimetableResponse

Solver phases (all implemented):
  ✅  Phase 1 — Schema contract locked (TimetableRequest / TimetableResponse)
  ✅  Phase 2 — CP-SAT variables created (NonLabKey / LabKey via build_variables)
  ✅  Phase 3 — Hard constraints (coverage, no double-booking, unavailability, cap)
  ✅  Phase 4 — Soft objectives (O1 even spread + O2 preference scoring)
  ✅  Phase 5 — Solution extraction → TimetableSlot list + DB persistence
"""

from __future__ import annotations

import importlib.metadata
import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from ortools.sat.python import cp_model
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.orm import (
    ClassSection,
    ClassSectionSubject,
    Floor,
    Room,
    Subject,
    Teacher,
    TeacherSubject,
    TeacherUnavailableSlot,
    Timetable,
    TimetableSlot as TimetableSlotORM,
)
from models.schemas import TimetableOut
from models.solver_schemas import (
    SolverClassSection,
    LockedSlot,  # noqa: F401 — re-exported for router typing
    SolverRoom,
    SolverSectionSubjectLink,
    SolverSubject,
    SolverTeacher,
    SolverTeacherSubjectLink,
    SolverUnavailableSlot,
    TimeGrid,
    TimetableRequest,
    TimetableResponse,
    TimetableSlot,
)
from solver import (
    apply_locked_slots,
    build_constraints,
    build_objectives,
    build_variables,
    extract_solution,
)
from solver.floor_graph import (
    compute_room_distances,
    compute_building_distances,
    compute_campus_distances,
    GLOBAL_CAMPUS_MATRIX_CACHE,
    FloorData,
    StairConnection,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/generate-timetable", tags=["Generate"])

# Maximum wall-clock seconds the solver is allowed to run.
_SOLVER_TIMEOUT_SECONDS = 60.0

# SQLAlchemy eager-load options for the payload query.
_TEACHER_LOAD = [
    selectinload(Teacher.subject_links),
    selectinload(Teacher.unavailable_slots),
]
_SECTION_LOAD = [
    selectinload(ClassSection.subject_links),
]


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
class GenerateHealthResponse(BaseModel):
    status: str
    ortools_version: str


@router.get("/health", response_model=GenerateHealthResponse, summary="Solver health check")
@router.get("/health/", response_model=GenerateHealthResponse, include_in_schema=False)
async def generate_health():
    """Returns HTTP 200 with the installed OR-Tools version."""
    try:
        version = importlib.metadata.version("ortools")
    except importlib.metadata.PackageNotFoundError:
        version = "not-installed"
    return GenerateHealthResponse(status="ok", ortools_version=version)


# ---------------------------------------------------------------------------
# Payload assembly (Option B) — GET /generate-timetable/payload
# ---------------------------------------------------------------------------
@router.get(
    "/payload",
    response_model=TimetableRequest,
    summary="Assemble solver payload from current DB state",
)
@router.get("/payload/", response_model=TimetableRequest, include_in_schema=False)
async def get_payload(
    periods_per_day: int = 8,
    working_days: str = "0,1,2,3,4",
    db: AsyncSession = Depends(get_db),
):
    """
    Query all teachers, subjects, rooms, and class sections from the database
    and return a fully-formed ``TimetableRequest`` ready for the solver.

    **Query parameters** (time grid — the only runtime config):
    - `periods_per_day` (default 8)
    - `working_days`    (default \"0,1,2,3,4\" = Mon–Fri, comma-separated 0-based ints)

    Returns HTTP 422 if any critical cross-reference issues are detected
    (e.g. a section has no homeroom, or no teacher is eligible for a subject).
    """
    try:
        days = [int(d.strip()) for d in working_days.split(",") if d.strip()]
    except ValueError:
        raise HTTPException(status_code=422, detail="working_days must be comma-separated integers")

    if not days:
        raise HTTPException(status_code=422, detail="working_days must not be empty")

    req = await _assemble_payload(db, periods_per_day=periods_per_day, working_days=days)
    return req


# ---------------------------------------------------------------------------
# Pre-solve validation helper
# ---------------------------------------------------------------------------
def _validate_request(req: TimetableRequest) -> None:
    """
    Validate that all required resources exist before starting the solve.
    Surfaces data-quality errors (e.g. missing matching lab rooms) upfront as 422.
    """
    subject_map = {s.id: s for s in req.subjects}
    lab_rooms = [r for r in req.rooms if r.room_type == "lab"]

    # Check that for every section-assigned subject requiring a lab_type, at least one matching room exists
    assigned_subject_ids = {
        sl.subject_id
        for sec in req.class_sections
        for sl in sec.subject_links
    }

    for subj_id in assigned_subject_ids:
        subj = subject_map.get(subj_id)
        if subj and subj.lab and subj.required_lab_type:
            req_type = subj.required_lab_type
            matching_rooms = [r for r in lab_rooms if r.lab_type == req_type]
            if not matching_rooms:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Subject '{subj.name}' ({subj.code}) requires lab category '{req_type}', "
                        f"but no lab room with lab_type '{req_type}' exists in the system."
                    ),
                )


# ---------------------------------------------------------------------------
# Generate endpoint — POST /generate-timetable
# ---------------------------------------------------------------------------
@router.post("", response_model=TimetableOut, summary="Generate and persist a timetable")
@router.post("/", response_model=TimetableOut, include_in_schema=False)
async def generate_timetable(
    payload: TimetableRequest,
    db: AsyncSession = Depends(get_db),
) -> TimetableOut:
    """
    Run the CP-SAT solver on the provided ``TimetableRequest``, persist the
    result to the database, and return the saved ``TimetableOut``.
    """
    _validate_request(payload)
    timetable_response = _run_solver(payload)
    saved = await _persist(db, timetable_response)
    return saved


# ---------------------------------------------------------------------------
# Payload assembly helper
# ---------------------------------------------------------------------------
async def _assemble_payload(
    db: AsyncSession,
    *,
    periods_per_day: int,
    working_days: list[int],
) -> TimetableRequest:
    """Query all entities and map ORM rows to solver schema objects."""

    # ── Subjects ──────────────────────────────────────────────────────────────
    subj_rows = (await db.execute(select(Subject).order_by(Subject.code))).scalars().all()
    solver_subjects = [
        SolverSubject(
            id=s.id,
            name=s.name,
            code=s.code,
            weekly_periods=s.weekly_periods,
            lab=s.lab,
            lab_consecutive_periods=s.lab_consecutive_periods,
            weekly_lab_sessions=s.weekly_lab_sessions,
            required_lab_type=s.required_lab_type,
        )
        for s in subj_rows
    ]

    # ── Rooms ─────────────────────────────────────────────────────────────────
    room_rows = (await db.execute(select(Room).order_by(Room.code))).scalars().all()
    solver_rooms = [
        SolverRoom(
            id=r.id,
            name=r.name,
            code=r.code,
            room_type=r.room_type,
            lab_type=r.lab_type,
            capacity=r.capacity,
        )
        for r in room_rows
    ]

    # ── Teachers (with subject_links + unavailable_slots) ────────────────────
    teacher_rows = (
        await db.execute(select(Teacher).options(*_TEACHER_LOAD).order_by(Teacher.name))
    ).scalars().all()

    solver_teachers = []
    for t in teacher_rows:
        subject_links = [
            SolverTeacherSubjectLink(
                subject_id=sl.subject_id,
                preference_type=sl.preference_type or "willing",
                preference_rank=sl.preference_rank or 1,
            )
            for sl in t.subject_links
        ]
        unavailable = [
            SolverUnavailableSlot(
                day_of_week=u.day_of_week,
                period_index=u.period_index,
            )
            for u in t.unavailable_slots
        ]
        solver_teachers.append(
            SolverTeacher(
                id=t.id,
                name=t.name,
                max_periods_per_week=t.max_periods_per_week,
                subject_links=subject_links,
                unavailable_slots=unavailable,
            )
        )

    # ── Class sections (with subject_links) ───────────────────────────────────
    section_rows = (
        await db.execute(select(ClassSection).options(*_SECTION_LOAD).order_by(ClassSection.name))
    ).scalars().all()

    solver_sections = []
    for sec in section_rows:
        subject_links = [
            SolverSectionSubjectLink(
                subject_id=sl.subject_id,
                weekly_periods_override=sl.weekly_periods_override,
            )
            for sl in sec.subject_links
        ]
        solver_sections.append(
            SolverClassSection(
                id=sec.id,
                name=sec.name,
                code=sec.code,
                strength=sec.strength,
                homeroom_id=sec.homeroom_id,
                subject_links=subject_links,
            )
        )

    # ── BFS / Dijkstra campus room distances (from precomputed cache) ──────────────
    from routers.campus import recompute_campus_matrices

    if GLOBAL_CAMPUS_MATRIX_CACHE.is_valid():
        room_distances = GLOBAL_CAMPUS_MATRIX_CACHE.all_distances
    else:
        res = await recompute_campus_matrices(db)
        room_distances = res.get("allDistances", {})

    logger.info(
        "_assemble_payload: campus distance engine provided %d source rooms with distance data.",
        len(room_distances),
    )


    req = TimetableRequest(
        subjects=solver_subjects,
        teachers=solver_teachers,
        rooms=solver_rooms,
        class_sections=solver_sections,
        time_grid=TimeGrid(
            periods_per_day=periods_per_day,
            working_days=working_days,
        ),
        room_distances=room_distances,
    )
    _validate_request(req)
    return req


# ---------------------------------------------------------------------------
# Persistence helper
# ---------------------------------------------------------------------------
async def _persist(
    db: AsyncSession,
    resp: TimetableResponse,
) -> TimetableOut:
    """Save the solver result to the database and return the ORM-backed record."""
    timetable = Timetable(
        status=resp.status,
        solver_wall_ms=resp.solver_wall_time_ms,
        message=resp.message,
    )
    db.add(timetable)
    await db.flush()   # assigns timetable.id

    if resp.slots:
        for slot in resp.slots:
            db.add(TimetableSlotORM(
                timetable_id=timetable.id,
                section_id=slot.section_id,
                subject_id=slot.subject_id,
                teacher_id=slot.teacher_id,
                room_id=slot.room_id,
                day_of_week=slot.day_of_week,
                period_index=slot.period_index,
            ))

    await db.flush()

    # Reload with slots for response
    result = await db.execute(
        select(Timetable)
        .where(Timetable.id == timetable.id)
        .options(selectinload(Timetable.slots))
    )
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Solver orchestration
# ---------------------------------------------------------------------------
def _run_solver(req: TimetableRequest) -> TimetableResponse:
    """
    Phase 2 → 3 → 4 → 5 solver pipeline.
    Returns a TimetableResponse (not yet persisted).
    """
    t0 = time.perf_counter()

    model    = cp_model.CpModel()
    var_sets = build_variables(model, req)

    logger.info(
        "_run_solver: %d non-lab + %d lab-block = %d vars",
        len(var_sets.non_lab), len(var_sets.lab),
        len(var_sets.non_lab) + len(var_sets.lab),
    )

    # Phase 2.5 — pin locked slots BEFORE constraints so pinned vars are
    # already fixed when coverage / no-double-booking constraints run.
    apply_locked_slots(model, req, var_sets)

    build_constraints(model, req, var_sets)
    build_objectives(model, req, var_sets)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = _SOLVER_TIMEOUT_SECONDS
    solver.parameters.log_search_progress = False

    status_code = solver.solve(model)
    elapsed_ms  = int((time.perf_counter() - t0) * 1000)
    status_name = solver.status_name(status_code)
    logger.info("_run_solver: %s in %dms", status_name, elapsed_ms)

    if status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        slots = extract_solution(solver, req, var_sets)
        return TimetableResponse(
            status="ok",
            slots=slots,
            solver_wall_time_ms=elapsed_ms,
            message=(
                f"Timetable generated ({status_name}). "
                f"{len(slots)} slot(s) across "
                f"{len(req.class_sections)} section(s)."
            ),
        )

    if status_code == cp_model.INFEASIBLE:
        return TimetableResponse(
            status="infeasible",
            slots=[],
            solver_wall_time_ms=elapsed_ms,
            message=(
                "No feasible timetable exists. "
                "Common causes: not enough teachers for a subject, "
                "no lab rooms available, or weekly periods exceed the time grid."
            ),
        )

    return TimetableResponse(
        status="timeout",
        slots=[],
        solver_wall_time_ms=elapsed_ms,
        message=(
            f"Solver found no solution within {_SOLVER_TIMEOUT_SECONDS:.0f}s "
            f"(status: {status_name})."
        ),
    )
