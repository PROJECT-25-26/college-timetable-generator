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

  O3  Teacher travel penalty  (requires painted floor grids)
        When a teacher has two *consecutive* periods on the same day
        assigned to rooms on the same floor, the BFS walking distance
        between those rooms is added to the objective.

        For each (teacher, day, consecutive period pair (p, p+1)):
          For each variable pair (var_p with room A, var_p1 with room B)
          where A ≠ B and BFS distance(A, B) is known:
            • Create auxiliary BoolVar  aux  encoding  (var_p ∧ var_p1)
            • Penalise:  aux × distance(A, B) × TRAVEL_WEIGHT

        Silently skipped when room_distances is empty (no floor layout defined).

        Room-id lookup:
          Non-lab slot  → room = section.homeroom_id
          Lab slot      → room = key.lab_room_id

Combined objective (single model.minimize() call)
──────────────────────────────────────────────────
  minimize:
    Σ  (spread_excess_var  ×  SPREAD_WEIGHT)          [O1 — IntVars, coeff > 0]
  + Σ  (avoid_bool_var     ×  AVOID_PENALTY × load)   [O2 — BoolVars, coeff > 0]
  − Σ  (prefer_bool_var    ×  bonus         × load)   [O2 — BoolVars, coeff < 0]
  + Σ  (travel_aux_bool    ×  dist × TRAVEL_WEIGHT)  [O3 — BoolVars, coeff > 0]

All categories are passed as (var, weight) pairs to
cp_model.LinearExpr.weighted_sum(), which handles mixed-sign coefficients
over a mix of IntVars and BoolVars without issue.

Weight calibration
──────────────────
  SPREAD_WEIGHT  =  5   — penalty per excess period on one day
  PREFER_BONUS   = 10   — bonus per period taught by a preferred teacher (rank 1)
  AVOID_PENALTY  = 25   — penalty per period taught by an avoid teacher
  TRAVEL_WEIGHT  =  2   — penalty per cell of BFS walking distance
                           between consecutive-period rooms for the same teacher

  Rule of thumb: AVOID_PENALTY > PREFER_BONUS > SPREAD_WEIGHT > TRAVEL_WEIGHT.
  Travel is a soft nudge; it should not override preference or spread balance.
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
TRAVEL_WEIGHT:  int = 2    # O3 — penalty per BFS cell of walking distance
                            #        between rooms for consecutive teacher periods


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

    # ── O3: Teacher travel penalty ─────────────────────────────────────────
    n_travel = _travel_penalty(
        model, req, var_sets, all_vars, all_weights,
    )

    # ── Register the single combined minimize() call ───────────────────────
    if all_vars:
        model.minimize(cp_model.LinearExpr.weighted_sum(all_vars, all_weights))
    # If no terms at all, CP-SAT finds any feasible solution (unconstrained obj).

    logger.info(
        "build_objectives: "
        "O1 spread=%d aux-vars (weight=%d) | "
        "O2 prefer=%d bonus-terms (weight=-%d…) | "
        "O2 avoid=%d penalty-terms (weight=+%d) | "
        "O3 travel=%d aux-vars (weight=+%d×dist)",
        n_spread, SPREAD_WEIGHT,
        n_prefer, PREFER_BONUS,
        n_avoid,  AVOID_PENALTY,
        n_travel, TRAVEL_WEIGHT,
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


# ═══════════════════════════════════════════════════════════════════════════
# O3 — Teacher travel penalty
# ═══════════════════════════════════════════════════════════════════════════

def _travel_penalty(
    model:       cp_model.CpModel,
    req:         "TimetableRequest",
    var_sets:    VariableSets,
    all_vars:    list,
    all_weights: list[int],
) -> int:
    """
    O3 — Penalise a teacher who must move between far-apart rooms on
    consecutive periods of the same day.

    Strategy
    --------
    1. Build an index:  (teacher_id, day, period) → list[(var, room_id)]
       - Non-lab variable → room is section.homeroom_id
       - Lab variable     → room is key.lab_room_id
       Entries with no room_id are skipped.

    2. For every teacher T and day D, iterate over consecutive period
       pairs (p, p+1). For each cross-product (var_p, room_A) ×
       (var_p1, room_B) where A ≠ B and dist(A, B) is known:
         • Create  aux = new_bool_var("tv_...")
         • Encode  aux ↔ (var_p ∧ var_p1)  using CP-SAT implication:
             add_implication(aux,      var_p)   ← aux=1 ⇒ var_p=1
             add_implication(aux,      var_p1)  ← aux=1 ⇒ var_p1=1
             add(var_p + var_p1 - 1 ≤ aux)     ← (var_p=1 ∧ var_p1=1) ⇒ aux=1
         • Penalise: weight = dist(A, B) × TRAVEL_WEIGHT

    3. Silently returns 0 when req.room_distances is empty.

    Returns the number of auxiliary travel BoolVars created.
    """
    room_distances = req.room_distances
    if not room_distances:
        return 0

    # ─ Build room look-up for sections (homeroom) ────────────────────────────
    homeroom: dict[str, str | None] = {
        sec.id: sec.homeroom_id for sec in req.class_sections
    }

    # ─ Build slot index  (teacher_id, day, period) → [(var, room_id)] ─────
    from collections import defaultdict
    slot_index: dict[tuple[str, int, int], list[tuple]] = defaultdict(list)

    # Non-lab variables
    for key, var in var_sets.non_lab.items():
        room_id = homeroom.get(key.section_id)
        if room_id is None:
            continue
        slot_index[(key.teacher_id, key.day, key.period)].append((var, room_id))

    # Lab variables — a block-start at start_period occupies multiple periods.
    # We register the lab var at every period in its block so consecutive-period
    # pairs that span into a lab block are correctly penalised.
    subject_by_id = {s.id: s for s in req.subjects}
    for key, var in var_sets.lab.items():
        subj = subject_by_id.get(key.subject_id)
        block_size = (subj.lab_consecutive_periods or 1) if subj else 1
        for offset in range(block_size):
            p = key.start_period + offset
            slot_index[(key.teacher_id, key.day, p)].append((var, key.lab_room_id))

    # ─ Collect all (teacher_id, day) pairs to iterate ──────────────────────
    teacher_days: set[tuple[str, int]] = {
        (tid, day) for tid, day, _ in slot_index.keys()
    }

    periods_per_day = req.time_grid.periods_per_day
    n_aux = 0
    aux_counter = 0

    for teacher_id, day in teacher_days:
        for p in range(periods_per_day - 1):  # pairs: p and p+1
            entries_p  = slot_index.get((teacher_id, day, p),     [])
            entries_p1 = slot_index.get((teacher_id, day, p + 1), [])

            if not entries_p or not entries_p1:
                continue

            for var_p, room_a in entries_p:
                dist_from_a = room_distances.get(room_a)
                if dist_from_a is None:
                    continue

                for var_p1, room_b in entries_p1:
                    if room_a == room_b:
                        continue  # same room — no walking

                    dist_cells = dist_from_a.get(room_b)
                    if dist_cells is None or dist_cells == 0:
                        continue  # not on same floor or trivially adjacent

                    weight = dist_cells * TRAVEL_WEIGHT

                    # aux = var_p AND var_p1
                    aux = model.new_bool_var(f"tv_{aux_counter}")
                    aux_counter += 1

                    # aux=1  ⇒  var_p=1
                    model.add_implication(aux, var_p)
                    # aux=1  ⇒  var_p1=1
                    model.add_implication(aux, var_p1)
                    # (var_p=1 ∧ var_p1=1)  ⇒  aux=1
                    model.add(var_p + var_p1 <= aux + 1)

                    all_vars.append(aux)
                    all_weights.append(weight)
                    n_aux += 1

    return n_aux
