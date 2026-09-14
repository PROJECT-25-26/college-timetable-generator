"""
Phase 2.5 — Locked-slot pinning for partial regeneration.

Must be called after build_variables() and before build_constraints().

Algorithm
─────────
For each slot in req.locked_slots:
  1. Locate the matching BoolVar (NonLabKey for non-lab, LabKey for lab subjects)
     in var_sets using all 6 identifying fields.
  2. Force that var to 1 via  model.add(var == 1).
  3. Force every *competing* var at the same (section, day, period) to 0,
     so the coverage constraint C1 is trivially satisfied for locked slots
     and the solver cannot assign anything else to that slot.

Non-lab locking
───────────────
Competing vars = all NonLabKeys for the same (section, day, period).

Lab block locking
─────────────────
A locked lab slot identifies the block ANCHOR (period_index == start_period).
Competing vars = all other LabKeys for the same (section, subject, day)
plus any non-lab vars that would overlap with the block's period range.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from ortools.sat.python import cp_model

from solver.variables import LabKey, NonLabKey, VariableSets

if TYPE_CHECKING:
    from models.solver_schemas import LockedSlot, TimetableRequest

logger = logging.getLogger(__name__)


def apply_locked_slots(
    model: cp_model.CpModel,
    req: "TimetableRequest",
    var_sets: VariableSets,
) -> None:
    """
    Pin every locked slot's decision variable to 1 and block competitors.

    Parameters
    ----------
    model    : The CP-SAT model (variables already created, constraints not yet).
    req      : Full solver request including the locked_slots list.
    var_sets : Variables produced by build_variables().
    """
    if not req.locked_slots:
        return

    subject_by_id = {s.id: s for s in req.subjects}
    n_pinned = 0
    n_skipped = 0

    for lock in req.locked_slots:
        subj = subject_by_id.get(lock.subject_id)
        if subj is None:
            logger.warning(
                "apply_locked_slots: unknown subject_id=%s in locked slot "
                "(section=%s day=%d period=%d) — skipped.",
                lock.subject_id, lock.section_id,
                lock.day_of_week, lock.period_index,
            )
            n_skipped += 1
            continue

        if subj.lab:
            ok = _pin_lab(model, var_sets, lock, subj)
        else:
            ok = _pin_non_lab(model, var_sets, lock)

        if ok:
            n_pinned += 1
        else:
            n_skipped += 1

    logger.info(
        "apply_locked_slots: %d pinned, %d skipped (stale/unknown entity).",
        n_pinned, n_skipped,
    )


# ---------------------------------------------------------------------------
# Non-lab
# ---------------------------------------------------------------------------
def _pin_non_lab(
    model: cp_model.CpModel,
    var_sets: VariableSets,
    lock: "LockedSlot",
) -> bool:
    target_key = NonLabKey(
        teacher_id=lock.teacher_id,
        day=lock.day_of_week,
        period=lock.period_index,
        section_id=lock.section_id,
        subject_id=lock.subject_id,
    )
    target_var = var_sets.non_lab.get(target_key)
    if target_var is None:
        logger.warning(
            "apply_locked_slots: no NonLabKey for lock "
            "(teacher=%s section=%s subject=%s day=%d period=%d) — "
            "may be stale after entity edits.",
            lock.teacher_id, lock.section_id, lock.subject_id,
            lock.day_of_week, lock.period_index,
        )
        return False

    # Pin target to True
    model.add(target_var == 1)

    # Block all other non-lab vars at (section, day, period)
    for key, var in var_sets.non_lab.items():
        if (
            key.section_id == lock.section_id
            and key.day    == lock.day_of_week
            and key.period == lock.period_index
            and key != target_key
        ):
            model.add(var == 0)

    logger.debug(
        "Pinned non-lab: section=%s subject=%s teacher=%s day=%d period=%d",
        lock.section_id, lock.subject_id, lock.teacher_id,
        lock.day_of_week, lock.period_index,
    )
    return True


# ---------------------------------------------------------------------------
# Lab block
# ---------------------------------------------------------------------------
def _pin_lab(
    model: cp_model.CpModel,
    var_sets: VariableSets,
    lock: "LockedSlot",
    subj,
) -> bool:
    """
    Pin the lab block whose start_period == lock.period_index.

    The frontend always passes the ANCHOR (first) period when locking a lab
    block, so period_index here is already the LabKey.start_period.
    """
    target_key = LabKey(
        teacher_id=lock.teacher_id,
        day=lock.day_of_week,
        start_period=lock.period_index,
        section_id=lock.section_id,
        subject_id=lock.subject_id,
        lab_room_id=lock.room_id,
    )
    target_var = var_sets.lab.get(target_key)
    if target_var is None:
        logger.warning(
            "apply_locked_slots: no LabKey for lock "
            "(teacher=%s section=%s subject=%s day=%d start=%d room=%s) — "
            "may be stale after entity edits.",
            lock.teacher_id, lock.section_id, lock.subject_id,
            lock.day_of_week, lock.period_index, lock.room_id,
        )
        return False

    # Pin target lab block to True
    model.add(target_var == 1)

    # Block all OTHER lab vars for (section, subject, day)
    for key, var in var_sets.lab.items():
        if (
            key.section_id == lock.section_id
            and key.subject_id == lock.subject_id
            and key.day        == lock.day_of_week
            and key != target_key
        ):
            model.add(var == 0)

    # Block non-lab vars that overlap with this block's period range
    block_size = subj.lab_consecutive_periods or 1
    locked_periods = set(range(lock.period_index, lock.period_index + block_size))
    for key, var in var_sets.non_lab.items():
        if (
            key.section_id == lock.section_id
            and key.day    == lock.day_of_week
            and key.period in locked_periods
        ):
            model.add(var == 0)

    logger.debug(
        "Pinned lab block: section=%s subject=%s teacher=%s day=%d "
        "start=%d size=%d room=%s",
        lock.section_id, lock.subject_id, lock.teacher_id,
        lock.day_of_week, lock.period_index, block_size, lock.room_id,
    )
    return True
