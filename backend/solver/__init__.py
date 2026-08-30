"""
OR-Tools CP-SAT timetable solver package.

Package layout
──────────────
  solver/
    __init__.py    ← this file, public re-exports
    variables.py   ← CP-SAT BoolVar creation (NonLabKey / LabKey)       [Phase 2 ✅]
    constraints.py ← hard constraints (coverage, no double-booking, …)  [Phase 3 ✅]
    extractor.py   ← solution → TimetableSlot list                      [Phase 5 ✅]

Upcoming modules:
    objectives.py  ← soft objectives (preference weights, even spread)  [Phase 4 🔲]
"""

from solver.variables import (
    NonLabKey,
    LabKey,
    VariableSets,
    build_variables,
)
from solver.constraints import build_constraints
from solver.extractor import extract_solution

__all__ = [
    "NonLabKey",
    "LabKey",
    "VariableSets",
    "build_variables",
    "build_constraints",
    "extract_solution",
]
