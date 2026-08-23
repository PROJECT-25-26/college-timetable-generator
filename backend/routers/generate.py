"""
Generate router — timetable generation endpoint.

Endpoint:
  POST /generate-timetable        – submit a full dataset, get a timetable back
  GET  /generate-timetable/health – verify the solver library is importable

Solver phases:
  ✅  Phase 1 — Schema contract locked (TimetableRequest / TimetableResponse)
  ✅  Phase 2 — CP-SAT variables created (NonLabKey / LabKey via build_variables)
  🔲  Phase 3 — Hard constraints (coverage, no double-booking, lab blocks)
  🔲  Phase 4 — Soft objectives (preference weights, even spread)
  🔲  Phase 5 — Solution extraction → TimetableSlot list
"""

from __future__ import annotations

import importlib.metadata
import logging
import time

from fastapi import APIRouter
from ortools.sat.python import cp_model
from pydantic import BaseModel

from models.solver_schemas import TimetableRequest, TimetableResponse
from solver import build_variables

logger = logging.getLogger(__name__)
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

    > ⚠️ **Phase 2 / placeholder**: Variables are created and counted;
    > constraint solving and slot extraction are not yet implemented.
    """
    result = _run_solver(payload)
    return result


# ---------------------------------------------------------------------------
# Solver — currently Phase 2: variable creation only
# ---------------------------------------------------------------------------
def _run_solver(req: TimetableRequest) -> TimetableResponse:
    """
    Build CP-SAT model, create all decision variables, return placeholder.

    Phase 2 behaviour:
    - Creates the CP-SAT model and calls build_variables() to instantiate all
      structurally valid BoolVars (NonLabKey and LabKey).
    - Does NOT add constraints or call model.solve() yet.
    - Returns status="ok", slots=[] with a message reporting variable counts.

    Contract upheld by every phase:
    - Returns TimetableResponse with status ∈ {"ok", "infeasible", "timeout"}
    - slots is [] when status != "ok"
    - solver_wall_time_ms reflects real elapsed time
    """
    t0 = time.perf_counter()

    # ── Phase 2: Build CP-SAT model and variables ────────────────────────────
    model = cp_model.CpModel()
    var_sets = build_variables(model, req)

    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    n_non_lab = len(var_sets.non_lab)
    n_lab     = len(var_sets.lab)
    n_total   = n_non_lab + n_lab

    logger.info(
        "generate_timetable: %d non-lab + %d lab-block = %d vars created in %dms",
        n_non_lab, n_lab, n_total, elapsed_ms,
    )

    # ── Phases 3-5 placeholder ───────────────────────────────────────────────
    # TODO Phase 3: add hard constraints (constraints.py)
    # TODO Phase 4: add soft objectives (objectives.py)
    # TODO Phase 5: solve + extract slots (extractor.py)

    return TimetableResponse(
        status="ok",
        slots=[],
        solver_wall_time_ms=elapsed_ms,
        message=(
            f"[Phase 2 — variables only] "
            f"{n_non_lab} non-lab vars + {n_lab} lab-block vars = {n_total} total. "
            f"Input: {len(req.class_sections)} section(s), "
            f"{len(req.teachers)} teacher(s), "
            f"{len(req.subjects)} subject(s), "
            f"{len(req.rooms)} room(s), "
            f"{req.time_grid.periods_per_day} periods/day × "
            f"{len(req.time_grid.working_days)} days. "
            f"Constraint solving not yet implemented."
        ),
    )

