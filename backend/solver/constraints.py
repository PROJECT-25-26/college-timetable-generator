"""
Phase 3 — Hard constraints for the CP-SAT timetable solver.

Constraint catalogue
═══════════════════════════════════════════════════════════════════════════════

  C1  Coverage
        For each (section, subject) pair:
          • non-lab → exactly  weekly_periods  period-slots scheduled per week
          • lab     → exactly  weekly_lab_sessions  block-start vars active
            (each block-start var already represents lab_consecutive_periods
             consecutive periods, so the total period count is implicitly
             correct without a separate counting constraint)

  C2  Teacher no-double-booking
        At any (teacher, day, period) at most ONE assignment may be active.
        Lab-block vars are expanded: a block starting at period S of size K
        contributes to all periods S … S+K-1.

  C3  Section no-double-booking
        At any (section, day, period) at most ONE assignment may be active.
        Same lab-block expansion as C2.

  C4  Lab-room no-double-booking
        At any (lab_room, day, period) at most ONE lab block may be active.

  C5  Teacher unavailability
        For every declared unavailable (day, period) of a teacher, every
        variable that would place that teacher in that slot is forced to 0.

  C6  Teacher weekly-period cap
        Weighted sum of all periods a teacher teaches per week
        ≤ teacher.max_periods_per_week.
        Non-lab vars contribute weight 1; a lab-block var contributes
        weight == lab_consecutive_periods (its block size).

Implementation notes
────────────────────
• All index maps are built in a single O(|vars|) pass before constraints
  are added, keeping the overall complexity linear in the variable count.
• Constraints with only a single variable in the slot are still emitted
  (sum <= 1 on a single BoolVar is a tautology but harmless; CP-SAT
  simplifies it away during pre-processing).
• When a coverage pair has no candidate variables (e.g. no eligible teacher,
  no lab room) the constraint is skipped and a WARNING is logged — the solve
  will be infeasible for that reason, which the caller can surface to the user.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import TYPE_CHECKING

from ortools.sat.python import cp_model

from solver.variables import VariableSets

if TYPE_CHECKING:
    from models.solver_schemas import TimetableRequest

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Public entry point
# ═══════════════════════════════════════════════════════════════════════════

def build_constraints(
    model: cp_model.CpModel,
    req: "TimetableRequest",
    var_sets: VariableSets,
) -> None:
    """
    Add all Phase 3 hard constraints to *model*.

    Must be called **after** ``build_variables()`` and **before**
    ``CpSolver.solve()``.

    Parameters
    ----------
    model    : The CP-SAT model populated with variables by build_variables().
    req      : Fully-validated timetable request.
    var_sets : Variable sets + pre-computed maps returned by build_variables().
    """
    subject_by_id = {s.id: s for s in req.subjects}

    # ── Single-pass index construction ───────────────────────────────────────
    # (teacher_id, day, period)  → [vars active at that slot]
    teacher_slot: dict[tuple, list] = defaultdict(list)
    # (section_id, day, period)  → [vars active at that slot]
    section_slot: dict[tuple, list] = defaultdict(list)
    # (lab_room_id, day, period) → [lab-block vars active at that period]
    room_slot:    dict[tuple, list] = defaultdict(list)

    # teacher_id → [(var, period_weight)]   (used for C6 cap)
    teacher_weights: dict[str, list[tuple]] = defaultdict(list)

    # (section_id, subject_id) → [non-lab period vars]
    cov_non_lab: dict[tuple[str, str], list] = defaultdict(list)
    # (section_id, subject_id) → [lab block-start vars]
    cov_lab:     dict[tuple[str, str], list] = defaultdict(list)

    # --- Index non-lab variables ---
    for key, var in var_sets.non_lab.items():
        teacher_slot[(key.teacher_id, key.day, key.period)].append(var)
        section_slot[(key.section_id, key.day, key.period)].append(var)
        cov_non_lab[(key.section_id, key.subject_id)].append(var)
        teacher_weights[key.teacher_id].append((var, 1))

    # --- Index lab-block variables (expand each block across its periods) ---
    for key, var in var_sets.lab.items():
        subj = subject_by_id.get(key.subject_id)
        block_size = (subj.lab_consecutive_periods or 1) if subj else 1

        for offset in range(block_size):
            p = key.start_period + offset
            teacher_slot[(key.teacher_id, key.day, p)].append(var)
            section_slot[(key.section_id,  key.day, p)].append(var)
            room_slot[(key.lab_room_id,    key.day, p)].append(var)

        cov_lab[(key.section_id, key.subject_id)].append(var)
        teacher_weights[key.teacher_id].append((var, block_size))

    # ── C1: Coverage ─────────────────────────────────────────────────────────
    n_c1 = _add_coverage(model, req, var_sets, subject_by_id, cov_non_lab, cov_lab)

    # ── C2: Teacher no-double-booking ────────────────────────────────────────
    n_c2 = 0
    for vars_list in teacher_slot.values():
        model.add(cp_model.LinearExpr.sum(vars_list) <= 1)
        n_c2 += 1

    # ── C3: Section no-double-booking ────────────────────────────────────────
    n_c3 = 0
    for vars_list in section_slot.values():
        model.add(cp_model.LinearExpr.sum(vars_list) <= 1)
        n_c3 += 1

    # ── C4: Lab-room no-double-booking ───────────────────────────────────────
    n_c4 = 0
    for vars_list in room_slot.values():
        model.add(cp_model.LinearExpr.sum(vars_list) <= 1)
        n_c4 += 1

    # ── C5: Teacher unavailability ───────────────────────────────────────────
    n_c5 = _add_unavailability(model, req, teacher_slot)

    # ── C6: Teacher weekly-period cap ────────────────────────────────────────
    n_c6 = _add_weekly_cap(model, req, teacher_weights)

    logger.info(
        "build_constraints: "
        "C1=%d coverage | C2=%d teacher-nodup | C3=%d section-nodup | "
        "C4=%d room-nodup | C5=%d unavail-forced | C6=%d weekly-cap",
        n_c1, n_c2, n_c3, n_c4, n_c5, n_c6,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Private helpers
# ═══════════════════════════════════════════════════════════════════════════

def _add_coverage(
    model: cp_model.CpModel,
    req: "TimetableRequest",
    var_sets: VariableSets,
    subject_by_id: dict,
    cov_non_lab: dict[tuple[str, str], list],
    cov_lab: dict[tuple[str, str], list],
) -> int:
    """
    C1 — For every (section, subject) pair that appears in the request,
    add an equality constraint so the solver places exactly the right number
    of periods / sessions.

    Returns the number of constraints added.
    """
    n = 0
    for sec in req.class_sections:
        for sl in sec.subject_links:
            subj = subject_by_id.get(sl.subject_id)
            if subj is None:
                continue

            pair = (sec.id, subj.id)

            if not subj.lab:
                # ── Non-lab: count individual period-slots ────────────────
                target = var_sets.subject_weekly_periods.get(pair, subj.weekly_periods)
                candidate_vars = cov_non_lab.get(pair, [])
                if not candidate_vars:
                    logger.warning(
                        "C1 non-lab: no variables for section=%s subject=%s "
                        "(no eligible teacher?). Timetable will be infeasible.",
                        sec.id, subj.id,
                    )
                    continue
                model.add(cp_model.LinearExpr.sum(candidate_vars) == target)
                n += 1

            else:
                # ── Lab: count block-start variables ─────────────────────
                # Each block-start var represents one complete session.
                # Desired session count = total_periods / block_size.
                total_periods = var_sets.subject_weekly_periods.get(pair)
                block_size    = subj.lab_consecutive_periods or 1

                if total_periods is not None:
                    n_sessions = total_periods // block_size
                else:
                    n_sessions = subj.weekly_lab_sessions or 1

                if n_sessions <= 0:
                    logger.warning(
                        "C1 lab: computed n_sessions=%d for section=%s subject=%s "
                        "— skipping coverage constraint.",
                        n_sessions, sec.id, subj.id,
                    )
                    continue

                candidate_vars = cov_lab.get(pair, [])
                if not candidate_vars:
                    logger.warning(
                        "C1 lab: no variables for section=%s subject=%s "
                        "(no lab room? block too long for day?). "
                        "Timetable will be infeasible.",
                        sec.id, subj.id,
                    )
                    continue
                model.add(cp_model.LinearExpr.sum(candidate_vars) == n_sessions)
                n += 1

    return n


def _add_unavailability(
    model: cp_model.CpModel,
    req: "TimetableRequest",
    teacher_slot: dict[tuple, list],
) -> int:
    """
    C5 — Force every variable that places a teacher in one of their declared
    unavailable slots to 0.

    Returns the total number of individual variable-level zero-forcing constraints
    added (one per variable per blocked slot).
    """
    n = 0
    for teacher in req.teachers:
        if not teacher.unavailable_slots:
            continue
        for slot in teacher.unavailable_slots:
            slot_key = (teacher.id, slot.day_of_week, slot.period_index)
            for var in teacher_slot.get(slot_key, []):
                model.add(var == 0)
                n += 1
    return n


def _add_weekly_cap(
    model: cp_model.CpModel,
    req: "TimetableRequest",
    teacher_weights: dict[str, list[tuple]],
) -> int:
    """
    C6 — Each teacher's total scheduled periods must not exceed
    their max_periods_per_week.

    Non-lab vars contribute weight 1.
    Lab-block vars contribute weight == block_size (lab_consecutive_periods).

    Returns the number of constraints added (one per teacher with variables).
    """
    n = 0
    for teacher in req.teachers:
        entries = teacher_weights.get(teacher.id)
        if not entries:
            continue
        vars_list   = [e[0] for e in entries]
        weights     = [e[1] for e in entries]
        model.add(
            cp_model.LinearExpr.weighted_sum(vars_list, weights)
            <= teacher.max_periods_per_week
        )
        n += 1
    return n
