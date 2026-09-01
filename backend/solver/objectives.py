"""
Phase 4 — Soft objectives for the CP-SAT timetable solver.

Objective catalogue
═══════════════════════════════════════════════════════════════════════════════

  O1  Even weekly spread
        For each (section, subject), penalise placing more than the
        "fair share" of that subject's periods on a single working day.

        Fair share per day  = ⌈ weekly_periods  / num_working_days ⌉  (non-lab)
                            = ⌈ weekly_lab_sessions / num_working_days ⌉  (lab)

        Excess on day d     = max(0,  load_on_day_d  −  fair_share)

        The solver minimises  Σ (excess × SPREAD_WEIGHT)  over all
        (section, subject, day) triples.

        For lab subjects the unit of load is *blocks* (block-start vars),
        not individual periods.  A single lab block spanning multiple
        consecutive periods is an indivisible chunk and is counted as one unit.

  O2  Teacher preference scoring
        The solver is rewarded for assigning teachers to subjects they
        prefer and penalised for using teachers who want to avoid a subject.

        preference_type = 'preferred'
          → subtract PREFER_BONUS from objective per scheduled period
            (negative cost incentivises the solver to use preferred teachers)
          → bonus is scaled by preference_rank: rank-1 teachers get the full
            bonus; higher-ranked teachers get bonus // rank (always ≥ 1)

        preference_type = 'willing'
          → no term added (neutral baseline)

        preference_type = 'avoid'
          → add AVOID_PENALTY per scheduled period
          → penalty is flat (independent of rank) to strongly discourage

        Non-lab vars contribute weight = 1 period per activation.
        Lab-block vars contribute weight = block_size periods per activation,
        matching the actual teaching load of each decision variable.

Combined objective (single model.minimize() call)
──────────────────────────────────────────────────
  minimize:
    Σ  (spread_excess_var  ×  SPREAD_WEIGHT)          [O1 — IntVars, coeff > 0]
  + Σ  (avoid_bool_var     ×  AVOID_PENALTY × load)   [O2 — BoolVars, coeff > 0]
  − Σ  (prefer_bool_var    ×  bonus         × load)   [O2 — BoolVars, coeff < 0]

All three categories are passed as (var, weight) pairs to
cp_model.LinearExpr.weighted_sum(), which handles mixed-sign coefficients
over a mix of IntVars and BoolVars without issue.

Weight calibration
──────────────────
  SPREAD_WEIGHT  =  5   — penalty per excess period on one day
  PREFER_BONUS   = 10   — bonus per period taught by a preferred teacher (rank 1)
  AVOID_PENALTY  = 25   — penalty per period taught by an avoid teacher

  Rule of thumb: AVOID_PENALTY > PREFER_BONUS > SPREAD_WEIGHT.
  This means the solver first avoids "avoid" teachers, then rewards
  preferred teachers, then tries to spread periods evenly.
  Adjust ratios here without touching constraint code.
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict
from typing import TYPE_CHECKING

from ortools.sat.python import cp_model

from solver.variables import VariableSets

if TYPE_CHECKING:
    from models.solver_schemas import TimetableRequest

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tuning constants  (all positive integers; sign is applied at call site)
# ---------------------------------------------------------------------------
SPREAD_WEIGHT:  int = 5    # O1 — penalty per unit excess on one day
PREFER_BONUS:   int = 10   # O2 — bonus  per period for a preferred teacher (rank 1)
AVOID_PENALTY:  int = 25   # O2 — penalty per period for an avoided teacher


# ═══════════════════════════════════════════════════════════════════════════
# Public entry point
# ═══════════════════════════════════════════════════════════════════════════

def build_objectives(
    model: cp_model.CpModel,
    req: "TimetableRequest",
    var_sets: VariableSets,
) -> None:
    """
    Add the combined Phase 4 soft objective to *model* via a single
    ``model.minimize()`` call.

    Must be called **after** ``build_constraints()`` and **before**
    ``CpSolver.solve()``.  Call at most once per model.

    Parameters
    ----------
    model    : CP-SAT model with variables and hard constraints already added.
    req      : Fully-validated timetable request.
    var_sets : Variable sets produced by build_variables().
    """
    subject_by_id = {s.id: s for s in req.subjects}
    working_days  = req.time_grid.working_days
    num_days      = len(working_days)

    # Shared (var, weight) accumulators — passed to a single weighted_sum
    all_vars:    list = []
    all_weights: list[int] = []

    # ── O1: Even weekly spread ───────────────────────────────────────────────
    non_lab_day: dict[tuple, list] = defaultdict(list)
    lab_day:     dict[tuple, list] = defaultdict(list)

    for key, var in var_sets.non_lab.items():
        non_lab_day[(key.section_id, key.subject_id, key.day)].append(var)
    for key, var in var_sets.lab.items():
        lab_day[(key.section_id, key.subject_id, key.day)].append(var)

    n_spread = 0
    for sec in req.class_sections:
        for sl in sec.subject_links:
            subj = subject_by_id.get(sl.subject_id)
            if subj is None:
                continue
            if not subj.lab:
                n_spread += _spread_non_lab(
                    model, sec.id, subj, var_sets, working_days, num_days,
                    non_lab_day, all_vars, all_weights,
                )
            else:
                n_spread += _spread_lab(
                    model, sec.id, subj, var_sets, working_days, num_days,
                    lab_day, all_vars, all_weights,
                )

    # ── O2: Teacher preference scoring ───────────────────────────────────────
    # Build (teacher_id, subject_id) → (preference_type, preference_rank)
    teacher_pref: dict[tuple[str, str], tuple[str, int]] = {}
    for teacher in req.teachers:
        for link in teacher.subject_links:
            teacher_pref[(teacher.id, link.subject_id)] = (
                link.preference_type,
                link.preference_rank,
            )

    n_prefer = n_avoid = 0

    # Non-lab preference terms — each var represents 1 period
    for key, var in var_sets.non_lab.items():
        pref = teacher_pref.get((key.teacher_id, key.subject_id))
        if pref is None:
            continue
        pref_type, pref_rank = pref
        added = _preference_term(
            pref_type, pref_rank,
            period_weight=1,
            var=var,
            all_vars=all_vars,
            all_weights=all_weights,
        )
        if added == "prefer":
            n_prefer += 1
        elif added == "avoid":
            n_avoid += 1

    # Lab preference terms — each block var represents block_size periods
    for key, var in var_sets.lab.items():
        subj = subject_by_id.get(key.subject_id)
        block_size = (subj.lab_consecutive_periods or 1) if subj else 1

        pref = teacher_pref.get((key.teacher_id, key.subject_id))
        if pref is None:
            continue
        pref_type, pref_rank = pref
        added = _preference_term(
            pref_type, pref_rank,
            period_weight=block_size,
            var=var,
            all_vars=all_vars,
            all_weights=all_weights,
        )
        if added == "prefer":
            n_prefer += 1
        elif added == "avoid":
            n_avoid += 1

    # ── Register the single combined minimize() call ──────────────────────────
    if all_vars:
        model.minimize(cp_model.LinearExpr.weighted_sum(all_vars, all_weights))
    # If no terms at all, CP-SAT finds any feasible solution (unconstrained obj).

    logger.info(
        "build_objectives: "
        "O1 spread=%d aux-vars (weight=%d) | "
        "O2 prefer=%d bonus-terms (weight=-%d…) | "
        "O2 avoid=%d penalty-terms (weight=+%d)",
        n_spread, SPREAD_WEIGHT,
        n_prefer, PREFER_BONUS,
        n_avoid,  AVOID_PENALTY,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Private helpers
# ═══════════════════════════════════════════════════════════════════════════

def _preference_term(
    pref_type:      str,
    pref_rank:      int,
    period_weight:  int,          # 1 for non-lab, block_size for lab
    var,                          # CP-SAT BoolVar
    all_vars:       list,
    all_weights:    list[int],
) -> str:
    """
    Append one preference objective term to all_vars / all_weights.

    Returns 'prefer', 'avoid', or 'neutral' to let the caller count terms.

    Weight sign convention (we are minimising):
      preferred → negative coefficient → solver is rewarded for var=1
      avoid     → positive coefficient → solver is penalised for var=1
      willing   → no term (neutral)
    """
    if pref_type == "preferred":
        # Rank 1 = most preferred → full bonus.
        # Higher ranks get a proportionally smaller (but still positive) bonus.
        bonus = max(1, PREFER_BONUS // max(1, pref_rank))
        all_vars.append(var)
        all_weights.append(-(bonus * period_weight))   # negative = bonus
        return "prefer"

    elif pref_type == "avoid":
        all_vars.append(var)
        all_weights.append(AVOID_PENALTY * period_weight)   # positive = penalty
        return "avoid"

    # pref_type == 'willing' → neutral, no term
    return "neutral"


def _spread_non_lab(
    model:        cp_model.CpModel,
    section_id:   str,
    subj,                           # SolverSubject
    var_sets:     VariableSets,
    working_days: list[int],
    num_days:     int,
    non_lab_day:  dict[tuple, list],
    all_vars:     list,
    all_weights:  list[int],
) -> int:
    """
    Add O1 excess variables for a single non-lab (section, subject) pair.

    Returns the number of auxiliary variables created.
    """
    total_periods = var_sets.subject_weekly_periods.get(
        (section_id, subj.id), subj.weekly_periods
    )
    fair_per_day: int = math.ceil(total_periods / num_days)
    excess_ub:    int = total_periods - fair_per_day

    if excess_ub <= 0:
        return 0   # perfect distribution is already achievable for free

    n = 0
    for day in working_days:
        day_vars = non_lab_day.get((section_id, subj.id, day), [])
        if not day_vars:
            continue
        excess = model.new_int_var(
            0, excess_ub, f"spr_nl_{section_id[:8]}_{subj.id[:8]}_d{day}"
        )
        model.add(excess >= cp_model.LinearExpr.sum(day_vars) - fair_per_day)
        all_vars.append(excess)
        all_weights.append(SPREAD_WEIGHT)
        n += 1

    return n


def _spread_lab(
    model:        cp_model.CpModel,
    section_id:   str,
    subj,                           # SolverSubject
    var_sets:     VariableSets,
    working_days: list[int],
    num_days:     int,
    lab_day:      dict[tuple, list],
    all_vars:     list,
    all_weights:  list[int],
) -> int:
    """
    Add O1 excess variables for a single lab (section, subject) pair.

    Spread is measured in *blocks* (block-start variables), not individual
    periods, because lab blocks are indivisible consecutive-period chunks.

    Returns the number of auxiliary variables created.
    """
    block_size    = subj.lab_consecutive_periods or 1
    total_periods = var_sets.subject_weekly_periods.get((section_id, subj.id))

    n_sessions: int = (
        total_periods // block_size if total_periods is not None
        else (subj.weekly_lab_sessions or 1)
    )

    if n_sessions <= 0:
        return 0

    fair_per_day: int = math.ceil(n_sessions / num_days)
    excess_ub:    int = n_sessions - fair_per_day

    if excess_ub <= 0:
        return 0

    n = 0
    for day in working_days:
        day_vars = lab_day.get((section_id, subj.id, day), [])
        if not day_vars:
            continue
        excess = model.new_int_var(
            0, excess_ub, f"spr_lb_{section_id[:8]}_{subj.id[:8]}_d{day}"
        )
        model.add(excess >= cp_model.LinearExpr.sum(day_vars) - fair_per_day)
        all_vars.append(excess)
        all_weights.append(SPREAD_WEIGHT)
        n += 1

    return n
