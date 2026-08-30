"""
Phase 5 — Solution extraction: CP-SAT solution → TimetableSlot list.

After CpSolver.solve() returns OPTIMAL or FEASIBLE, this module reads
every decision variable whose solution value is 1 and converts it into
one or more TimetableSlot records.

Non-lab variables
─────────────────
  Each NonLabKey BoolVar that is 1 produces exactly ONE TimetableSlot.
  The room is the section's fixed homeroom (teachers travel to the section).
  Sections without a homeroom_id are skipped with a warning.

Lab-block variables
───────────────────
  Each LabKey BoolVar that is 1 produces  lab_consecutive_periods  slots —
  one per period the block occupies — all sharing the same lab room.
  The caller receives one slot per individual period, which is what the
  frontend timetable grid expects.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from ortools.sat.python import cp_model

from models.solver_schemas import TimetableSlot
from solver.variables import VariableSets

if TYPE_CHECKING:
    from models.solver_schemas import TimetableRequest

logger = logging.getLogger(__name__)


def extract_solution(
    solver: cp_model.CpSolver,
    req: "TimetableRequest",
    var_sets: VariableSets,
) -> list[TimetableSlot]:
    """
    Convert a CP-SAT solution into a flat list of ``TimetableSlot`` objects.

    Must be called only when the solver status is OPTIMAL or FEASIBLE.

    Parameters
    ----------
    solver   : CpSolver instance that has already completed a solve() call.
    req      : The original timetable request (used to look up homeroom IDs).
    var_sets : Variable sets produced by build_variables().

    Returns
    -------
    list[TimetableSlot]
        All scheduled periods, sorted by (day_of_week, period_index,
        section_id) for a predictable, human-readable ordering.
    """
    subject_by_id = {s.id: s for s in req.subjects}
    section_by_id = {s.id: s for s in req.class_sections}

    slots: list[TimetableSlot] = []
    n_non_lab_placed = 0
    n_lab_placed     = 0

    # ── Non-lab slots ─────────────────────────────────────────────────────────
    for key, var in var_sets.non_lab.items():
        if solver.value(var) != 1:
            continue

        section = section_by_id.get(key.section_id)
        if section is None or section.homeroom_id is None:
            logger.warning(
                "extract_solution: section %s has no homeroom_id — "
                "non-lab slot (subject=%s day=%d period=%d) skipped.",
                key.section_id, key.subject_id, key.day, key.period,
            )
            continue

        slots.append(TimetableSlot(
            section_id=key.section_id,
            subject_id=key.subject_id,
            teacher_id=key.teacher_id,
            room_id=section.homeroom_id,
            day_of_week=key.day,
            period_index=key.period,
        ))
        n_non_lab_placed += 1

    # ── Lab-block slots (one TimetableSlot per period in the block) ───────────
    for key, var in var_sets.lab.items():
        if solver.value(var) != 1:
            continue

        subj = subject_by_id.get(key.subject_id)
        block_size = (subj.lab_consecutive_periods or 1) if subj else 1

        for offset in range(block_size):
            slots.append(TimetableSlot(
                section_id=key.section_id,
                subject_id=key.subject_id,
                teacher_id=key.teacher_id,
                room_id=key.lab_room_id,
                day_of_week=key.day,
                period_index=key.start_period + offset,
            ))
        n_lab_placed += 1

    # Sort for deterministic output: by day, then period, then section
    slots.sort(key=lambda s: (s.day_of_week, s.period_index, s.section_id))

    logger.info(
        "extract_solution: %d total slots "
        "(%d non-lab periods + %d lab-block placements, each expanded to %d lab periods).",
        len(slots),
        n_non_lab_placed,
        n_lab_placed,
        len(slots) - n_non_lab_placed,
    )
    return slots
