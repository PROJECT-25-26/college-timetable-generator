"""
OR-Tools CP-SAT timetable solver package.

Package layout
──────────────
  solver/
    __init__.py    ← this file, public re-exports
    variables.py   ← CP-SAT BoolVar creation (NonLabKey / LabKey)       [Phase 2 ✅]
    locks.py       ← locked-slot pinning for partial regeneration        [Phase 2.5 ✅]
    constraints.py ← hard constraints (coverage, no double-booking, …)  [Phase 3 ✅]
    objectives.py  ← soft objectives (even spread, preferences, travel)  [Phase 4 ✅]
    extractor.py   ← solution → TimetableSlot list                      [Phase 5 ✅]
    floor_graph.py ← BFS/Dijkstra inter-room distance on single/multi-floor grids [Phase 4 ✅]
"""

from solver.variables import (
    NonLabKey,
    LabKey,
    VariableSets,
    build_variables,
)
from solver.locks import apply_locked_slots
from solver.constraints import build_constraints
from solver.objectives import build_objectives
from solver.extractor import extract_solution
from solver.floor_graph import (
    compute_room_distances,
    compute_building_distances,
    FloorData,
    StairConnection,
    DEFAULT_FLOOR_DISTANCE_PENALTY,
)

__all__ = [
    "NonLabKey",
    "LabKey",
    "VariableSets",
    "build_variables",
    "apply_locked_slots",
    "build_constraints",
    "build_objectives",
    "extract_solution",
    "compute_room_distances",
    "compute_building_distances",
    "FloorData",
    "StairConnection",
    "DEFAULT_FLOOR_DISTANCE_PENALTY",
]
