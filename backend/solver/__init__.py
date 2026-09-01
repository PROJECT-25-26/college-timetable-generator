"""
OR-Tools CP-SAT timetable solver package.

Package layout
──────────────
  solver/
    __init__.py    ← this file, public re-exports
    variables.py   ← CP-SAT BoolVar creation (NonLabKey / LabKey)       [Phase 2 ✅]
    constraints.py ← hard constraints (coverage, no double-booking, …)  [Phase 3 ✅]
    objectives.py  ← soft objectives (even spread, preferences)         [Phase 4 ✅]
    extractor.py   ← solution → TimetableSlot list                      [Phase 5 ✅]
"""

from solver.variables import (
    NonLabKey,
    LabKey,
    VariableSets,
    build_variables,
)
from solver.constraints import build_constraints
from solver.objectives import build_objectives
from solver.extractor import extract_solution

__all__ = [
    "NonLabKey",
    "LabKey",
    "VariableSets",
    "build_variables",
    "build_constraints",
    "build_objectives",
    "extract_solution",
]
