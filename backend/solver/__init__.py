"""
OR-Tools CP-SAT timetable solver package.

Package layout
──────────────
  solver/
    __init__.py   ← this file, public re-exports
    variables.py  ← CP-SAT BoolVar creation (NonLabKey / LabKey)

Upcoming modules (added as solver phases are implemented):
    constraints.py  ← hard constraints (no double-booking, coverage, lab blocks)
    objectives.py   ← soft objectives (preference weights, even spread)
    extractor.py    ← solution → TimetableSlot list
"""

from solver.variables import (
    NonLabKey,
    LabKey,
    VariableSets,
    build_variables,
)

__all__ = [
    "NonLabKey",
    "LabKey",
    "VariableSets",
    "build_variables",
]
