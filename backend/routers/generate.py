"""
Generate router — timetable generation endpoint.

Endpoint:
  POST /generate-timetable        – submit a full dataset, get a timetable back
  GET  /generate-timetable/health – verify the solver library is importable

Solver phases:
  ✅  Phase 1 — Schema contract locked (TimetableRequest / TimetableResponse)
  ✅  Phase 2 — CP-SAT variables created (NonLabKey / LabKey via build_variables)
  ✅  Phase 3 — Hard constraints (coverage, no double-booking, unavailability, cap)
  🔲  Phase 4 — Soft objectives (preference weights, even spread)
  ✅  Phase 5 — Solution extraction → TimetableSlot list
"""

from __future__ import annotations

import importlib.metadata
import logging
import time

from fastapi import APIRouter
from ortools.sat.python import cp_model
from pydantic import BaseModel

from models.solver_schemas import TimetableRequest, TimetableResponse
from solver import build_variables, build_constraints, extract_solution

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/generate-timetable", tags=["Generate"])

# Maximum wall-clock seconds the solver is allowed to run.
# Increase for very large problems; decrease for tighter SLA requirements.
_SOLVER_TIMEOUT_SECONDS = 60.0


# ---------------------------------------------------------------------------
# Health check — confirms OR-Tools is installed and importable
# ---------------------------------------------------------------------------
class GenerateHealthResponse(BaseModel):
    status: str
    ortools_version: str


@router.get(
    "/health",
    response_model=GenerateHealthResponse,
    summary="Solver health check",
)
@router.get(
    "/health/",
    response_model=GenerateHealthResponse,
    include_in_schema=False,
)
async def generate_health():
    """
    Returns HTTP 200 with the installed OR-Tools version.
    If OR-Tools is missing this endpoint itself will fail to load,
    surfacing the misconfiguration at startup rather than at solve time.
    """
    try:
        version = importlib.metadata.version("ortools")
    except importlib.metadata.PackageNotFoundError:
        version = "not-installed"

    return GenerateHealthResponse(status="ok", ortools_version=version)


# ---------------------------------------------------------------------------
# Main generation endpoint
# ---------------------------------------------------------------------------
@router.post(
    "",
    response_model=TimetableResponse,
    summary="Generate a weekly timetable",
)
@router.post(
    "/",
    response_model=TimetableResponse,
    include_in_schema=False,
)
async def generate_timetable(payload: TimetableRequest) -> TimetableResponse:
    """
    Accepts the complete scheduling dataset and returns a timetable.

    **Request body** (`TimetableRequest`):
    - `subjects`       – full list of subjects (id, code, weekly_periods, lab flags)
    - `teachers`       – full list of teachers with subject preferences and unavailability
    - `rooms`          – full list of rooms (classroom / lab / seminar)
    - `class_sections` – full list of sections with homeroom and subject assignments
    - `time_grid`      – periods per day + list of working day indices (0=Mon … 6=Sun)

    **Response** (`TimetableResponse`):
    - `status`               – `ok` | `infeasible` | `timeout`
    - `slots`                – list of `TimetableSlot` objects
    - `solver_wall_time_ms`  – actual wall-clock time used by the solver (ms)
    - `message`              – optional human-readable note

    **Solver status meanings**:
    - `ok`         — a valid timetable was found; `slots` is fully populated
    - `infeasible` — the hard constraints cannot be simultaneously satisfied
                     (e.g. not enough teachers, lab rooms, or time slots)
    - `timeout`    — solver exceeded the time limit without finding a solution
    """
    result = _run_solver(payload)
    return result


# ---------------------------------------------------------------------------
# Solver — Phases 2 + 3 + 5
# ---------------------------------------------------------------------------
def _run_solver(req: TimetableRequest) -> TimetableResponse:
    """
    Orchestrate all implemented solver phases and return a TimetableResponse.

    Phase 2  — Build CP-SAT variables (build_variables)
    Phase 3  — Add hard constraints   (build_constraints)
    Phase 4  — Soft objectives        (TODO: objectives.py)
    Phase 5  — Solve + extract slots  (CpSolver.solve + extract_solution)

    Contract upheld by every phase:
    - Returns TimetableResponse with status ∈ {"ok", "infeasible", "timeout"}
    - slots is [] when status != "ok"
    - solver_wall_time_ms reflects real elapsed wall-clock time
    """
    t0 = time.perf_counter()

    # ── Phase 2: Build CP-SAT model and variables ────────────────────────────
    model    = cp_model.CpModel()
    var_sets = build_variables(model, req)

    n_non_lab = len(var_sets.non_lab)
    n_lab     = len(var_sets.lab)
    logger.info(
        "_run_solver: %d non-lab + %d lab-block = %d vars",
        n_non_lab, n_lab, n_non_lab + n_lab,
    )

    # ── Phase 3: Add hard constraints ────────────────────────────────────────
    build_constraints(model, req, var_sets)

    # ── Phase 4: Soft objectives (TODO) ─────────────────────────────────────
    # TODO: call build_objectives(model, req, var_sets) once objectives.py exists.

    # ── Phase 5: Solve ───────────────────────────────────────────────────────
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = _SOLVER_TIMEOUT_SECONDS
    # Log search progress at INFO level for operational visibility
    solver.parameters.log_search_progress = False

    status_code = solver.solve(model)
    elapsed_ms  = int((time.perf_counter() - t0) * 1000)

    status_name = solver.status_name(status_code)
    logger.info("_run_solver: solver finished in %dms — status=%s", elapsed_ms, status_name)

    # ── Phase 5: Extract solution ────────────────────────────────────────────
    if status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        slots = extract_solution(solver, req, var_sets)
        return TimetableResponse(
            status="ok",
            slots=slots,
            solver_wall_time_ms=elapsed_ms,
            message=(
                f"Timetable generated ({status_name}). "
                f"{len(slots)} slot(s) scheduled across "
                f"{len(req.class_sections)} section(s), "
                f"{len(req.teachers)} teacher(s), "
                f"{len(req.subjects)} subject(s)."
            ),
        )

    if status_code == cp_model.INFEASIBLE:
        return TimetableResponse(
            status="infeasible",
            slots=[],
            solver_wall_time_ms=elapsed_ms,
            message=(
                "No feasible timetable exists for the given constraints. "
                "Common causes: not enough teachers for a subject, "
                "no lab rooms available, or the weekly period total exceeds "
                "the available slots in the time grid."
            ),
        )

    # UNKNOWN or MODEL_INVALID — typically a timeout with no partial solution
    return TimetableResponse(
        status="timeout",
        slots=[],
        solver_wall_time_ms=elapsed_ms,
        message=(
            f"Solver did not find a solution within {_SOLVER_TIMEOUT_SECONDS:.0f}s "
            f"(solver status: {status_name}). "
            "Try reducing the problem size or increasing the timeout."
        ),
    )
