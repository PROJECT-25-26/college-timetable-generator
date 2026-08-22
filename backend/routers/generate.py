"""
Generate router — timetable generation endpoint.

Endpoint:
  POST /generate-timetable        – submit a full dataset, get a timetable back
  GET  /generate-timetable/health – verify the solver library is importable

The solver logic is a placeholder (returns an empty slot list).
Real constraint-solving using OR-Tools CP-SAT will replace the body
of _run_solver() in a subsequent phase.
"""

from __future__ import annotations

import importlib.metadata

from fastapi import APIRouter
from pydantic import BaseModel

from models.solver_schemas import TimetableRequest, TimetableResponse

router = APIRouter(prefix="/generate-timetable", tags=["Generate"])


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
    - `slots`                – list of `TimetableSlot` objects (empty until solver is implemented)
    - `solver_wall_time_ms`  – actual wall-clock time used by the solver (ms)
    - `message`              – optional human-readable note

    > ⚠️ **Placeholder**: The solver body is not yet implemented.
    > The endpoint validates the full request payload and returns an empty slot list.
    """
    result = _run_solver(payload)
    return result


# ---------------------------------------------------------------------------
# Solver stub — replace this function body in the next phase
# ---------------------------------------------------------------------------
def _run_solver(req: TimetableRequest) -> TimetableResponse:
    """
    Placeholder solver.  Will be replaced with an OR-Tools CP-SAT implementation.

    Contract (guaranteed by this stub and the real solver alike):
    - Returns TimetableResponse with status in {"ok", "infeasible", "timeout"}
    - slots is [] when status != "ok"
    - solver_wall_time_ms reflects actual CPU time (0 here)
    """
    # ── Future implementation outline ─────────────────────────────────────
    # 1. Build CP-SAT model variables:
    #      assignment[section, subject, teacher, room, day, period] ∈ {0,1}
    # 2. Add hard constraints:
    #      - Each (section, subject) pair gets exactly weekly_periods slots
    #      - No teacher double-booked in the same (day, period)
    #      - No room double-booked in the same (day, period)
    #      - No section double-booked in the same (day, period)
    #      - Lab subjects use consecutive-period blocks of lab_consecutive_periods
    #      - Teacher unavailable_slots are blocked
    #      - Lab subjects are assigned to lab rooms only
    # 3. Add soft objectives:
    #      - Maximise preferred-subject assignments
    #      - Minimise avoid-subject assignments
    #      - Spread periods evenly across the week
    # 4. Solve with a wall-clock time limit
    # 5. Extract solution into TimetableSlot list
    # ──────────────────────────────────────────────────────────────────────

    return TimetableResponse(
        status="ok",
        slots=[],
        solver_wall_time_ms=0,
        message=(
            f"Solver not yet implemented — placeholder response. "
            f"Received {len(req.class_sections)} section(s), "
            f"{len(req.teachers)} teacher(s), "
            f"{len(req.subjects)} subject(s), "
            f"{len(req.rooms)} room(s) over a "
            f"{req.time_grid.periods_per_day}-period × "
            f"{len(req.time_grid.working_days)}-day grid."
        ),
    )
