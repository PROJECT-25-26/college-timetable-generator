"""
CP-SAT decision variable creation for the timetable solver.

Variable Taxonomy
═════════════════════════════════════════════════════════════════════════════

NON-LAB subjects  (SolverSubject.lab is False)
──────────────────────────────────────────────
  BoolVar key:  NonLabKey(teacher_id, day, period, section_id, subject_id)

  Represents: "teacher teaches this subject to this section
               during period `period` on day `day`."

  Room dimension:  ABSENT.
    The classroom is fixed to section.homeroom_id — teachers travel to the
    section, so no scheduling decision is needed for room.

  Variable is created only when ALL of:
    • teacher has subject_id in their subject_links (any preference level)
    • day ∈ time_grid.working_days
    • 0 ≤ period < time_grid.periods_per_day

NON-BLOCK labs  (SolverSubject.lab is True, lab_consecutive_periods == 1)
─────────────────────────────────────────────────────────────────────────
  BoolVar key:  LabKey(teacher_id, day, start_period, section_id, subject_id, lab_room_id)

  Represents: "teacher runs this one-period lab for this section
               during period `start_period` on day `day` in `lab_room`."

  Room dimension:  PRESENT — lab rooms are a shared resource.

  Variable is created only when ALL of:
    • teacher has subject_id in their subject_links (any preference level)
    • day ∈ time_grid.working_days
    • 0 ≤ start_period < time_grid.periods_per_day   (block_size=1 → all periods valid)
    • lab_room.room_type == "lab"

BLOCK labs  (SolverSubject.lab is True, lab_consecutive_periods > 1)
────────────────────────────────────────────────────────────────────
  BoolVar key:  LabKey(teacher_id, day, start_period, section_id, subject_id, lab_room_id)

  Represents: "this entire lab block STARTS at `start_period`."
    The block occupies the half-open interval
      [start_period, start_period + lab_consecutive_periods)
    Individual per-period slots are DERIVED from the block variable and are
    never modeled as independent BoolVars.

  Room dimension:  PRESENT — same rationale as non-block labs.

  Variable is created only when ALL of:
    • teacher has subject_id in their subject_links (any preference level)
    • day ∈ time_grid.working_days
    • 0 ≤ start_period ≤ periods_per_day − lab_consecutive_periods
      (the whole block fits within the day)
    • lab_room.room_type == "lab"

  Note: non-block labs (block_size=1) satisfy the same start_period bound
  automatically (0 ≤ start_period ≤ periods_per_day − 1), so both cases
  are handled by the single LabKey type without special-casing.

Naming strategy
───────────────
  Variable names are "{prefix}_{counter}" where counter is a monotonically
  increasing integer. Readable uniqueness is preferred over embedded IDs,
  which would balloon names and slow CP-SAT's internal bookkeeping.
  The counter resets per build_variables() call (one counter per solve run).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from ortools.sat.python import cp_model

if TYPE_CHECKING:
    # Only imported by type-checkers; not evaluated at runtime.
    from models.solver_schemas import TimetableRequest

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Variable key types
# ═══════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class NonLabKey:
    """
    Composite key identifying one non-lab assignment candidate.

    Used as the dict key in VariableSets.non_lab.
    All fields together uniquely identify the BoolVar that answers:
    "Does teacher `teacher_id` teach subject `subject_id` to section
     `section_id` during period `period` on day `day`?"

    Attributes
    ----------
    teacher_id  : str
        ID of the teacher being considered.
    day         : int
        Day index drawn from time_grid.working_days (e.g. 0=Monday).
    period      : int
        0-based period index within the day (0 … periods_per_day-1).
    section_id  : str
        ID of the class section being taught.
    subject_id  : str
        ID of the subject being taught.
    """
    teacher_id: str
    day:        int
    period:     int
    section_id: str
    subject_id: str


@dataclass(frozen=True)
class LabKey:
    """
    Composite key identifying one lab block assignment candidate.

    Used as the dict key in VariableSets.lab.
    The variable answers:
    "Does teacher `teacher_id` run a lab block for subject `subject_id`
     with section `section_id` in room `lab_room_id`, starting at period
     `start_period` on day `day`?"

    The block spans periods [start_period … start_period + block_size − 1]
    where block_size = subject.lab_consecutive_periods.
    For single-period labs (block_size=1) start_period == end_period.

    Attributes
    ----------
    teacher_id   : str
    day          : int
        Day index from time_grid.working_days.
    start_period : int
        First period of the block (0-based).  The block is valid only when
        start_period + block_size ≤ periods_per_day.
    section_id   : str
    subject_id   : str
    lab_room_id  : str
        ID of the lab room allocated to this block.
        Only rooms with room_type == "lab" produce LabKey variables.
    """
    teacher_id:   str
    day:          int
    start_period: int
    section_id:   str
    subject_id:   str
    lab_room_id:  str


# ═══════════════════════════════════════════════════════════════════════════
# Container returned by build_variables()
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class VariableSets:
    """
    All CP-SAT BoolVars for one solve run, plus pre-computed lookup maps.

    Attributes
    ----------
    non_lab : dict[NonLabKey, cp_model.IntVar]
        One BoolVar per valid (teacher, day, period, section, subject) tuple
        for non-lab subjects.  Room is implied by section.homeroom_id.

    lab : dict[LabKey, cp_model.IntVar]
        One BoolVar per valid (teacher, day, start_period, section, subject,
        lab_room) tuple for lab subjects.  Each variable represents an entire
        block; individual per-period coverage is derived, not modeled.

    teacher_subjects : dict[str, frozenset[str]]
        teacher_id → frozenset of subject_ids the teacher can teach
        (union of all preference levels: preferred + willing + avoid).
        Pre-computed here once; cheap to share with constraint builders.

    section_subjects : dict[str, list[str]]
        section_id → ordered list of subject_ids assigned to the section
        (order matches section.subject_links order in the request).

    subject_weekly_periods : dict[tuple[str, str], int]
        (section_id, subject_id) → effective weekly period count.
        Uses weekly_periods_override when set, otherwise subject.weekly_periods.
        For lab subjects this equals lab_consecutive_periods * weekly_lab_sessions.
    """
    non_lab:                 dict[NonLabKey, cp_model.IntVar]
    lab:                     dict[LabKey,    cp_model.IntVar]
    teacher_subjects:        dict[str, frozenset[str]]
    section_subjects:        dict[str, list[str]]
    subject_weekly_periods:  dict[tuple[str, str], int]


# ═══════════════════════════════════════════════════════════════════════════
# Variable builder
# ═══════════════════════════════════════════════════════════════════════════

def build_variables(
    model: cp_model.CpModel,
    req: TimetableRequest,
) -> VariableSets:
    """
    Create all CP-SAT BoolVars for the timetable problem.

    Only structurally possible combinations produce variables:
    - Teachers with no preference for a subject never get variables for it.
    - Lab blocks that would overflow the day boundary are never created.
    - Non-lab subjects produce no room variable (room is fixed by homeroom).
    This keeps the model compact, which is critical for CP-SAT solve time.

    Parameters
    ----------
    model : cp_model.CpModel
        The CP-SAT model to register variables into.  Must be a freshly
        created model; this function only adds variables, not constraints.
    req   : TimetableRequest
        Fully validated solver request.  Cross-reference integrity (e.g. all
        subject_ids exist) is the caller's responsibility.

    Returns
    -------
    VariableSets
        All variables plus pre-computed lookup maps needed by constraint
        builders.

    Notes
    -----
    Variable naming uses a monotonically increasing integer counter so that
    names remain short ("nl_1", "lb_42") without risk of collision.
    """
    # ── Pre-compute lookup structures ────────────────────────────────────────

    subject_by_id = {s.id: s for s in req.subjects}

    # Lab rooms only — the pool that lab blocks draw from
    lab_rooms = [r for r in req.rooms if r.room_type == "lab"]

    # teacher_id → frozenset of all subject_ids the teacher has any preference for
    teacher_subjects: dict[str, frozenset[str]] = {
        t.id: frozenset(sl.subject_id for sl in t.subject_links)
        for t in req.teachers
    }

    # section_id → ordered list of subject_ids (preserves section.subject_links order)
    section_subjects: dict[str, list[str]] = {
        sec.id: [sl.subject_id for sl in sec.subject_links]
        for sec in req.class_sections
    }

    # (section_id, subject_id) → effective weekly period target
    # Uses the per-section override when present; falls back to subject default.
    subject_weekly_periods: dict[tuple[str, str], int] = {}
    for sec in req.class_sections:
        for sl in sec.subject_links:
            subj = subject_by_id.get(sl.subject_id)
            if subj is None:
                continue
            if sl.weekly_periods_override is not None:
                target = sl.weekly_periods_override
            else:
                target = subj.weekly_periods
            subject_weekly_periods[(sec.id, sl.subject_id)] = target

    periods_per_day = req.time_grid.periods_per_day
    working_days    = req.time_grid.working_days

    # ── Variable containers ──────────────────────────────────────────────────
    non_lab: dict[NonLabKey, cp_model.IntVar] = {}
    lab:     dict[LabKey,    cp_model.IntVar] = {}

    # Monotonic name counter — reset per solve run, unique within this call
    _counter = 0

    def _name(prefix: str) -> str:
        nonlocal _counter
        _counter += 1
        return f"{prefix}_{_counter}"

    # ── Main variable creation loop ──────────────────────────────────────────
    for section in req.class_sections:
        for sec_link in section.subject_links:

            subject = subject_by_id.get(sec_link.subject_id)
            if subject is None:
                # Subject referenced by section not present in req.subjects.
                # Skip defensively — cross-reference validation is caller's job.
                logger.warning(
                    "Section %s references unknown subject_id %s — skipped.",
                    section.id, sec_link.subject_id,
                )
                continue

            # Teachers eligible for this subject:
            # only those with an explicit preference entry (any level).
            eligible_teachers = [
                t for t in req.teachers
                if subject.id in teacher_subjects[t.id]
            ]

            if not subject.lab:
                # ────────────────────────────────────────────────────────────
                # NON-LAB  subject
                # BoolVar per (teacher, day, period, section, subject)
                # No room dimension — classroom = section.homeroom_id
                # ────────────────────────────────────────────────────────────
                for teacher in eligible_teachers:
                    for day in working_days:
                        for period in range(periods_per_day):
                            key = NonLabKey(
                                teacher_id=teacher.id,
                                day=day,
                                period=period,
                                section_id=section.id,
                                subject_id=subject.id,
                            )
                            non_lab[key] = model.new_bool_var(_name("nl"))

            else:
                # ────────────────────────────────────────────────────────────
                # LAB subject (block_size == 1 OR block_size > 1)
                # BoolVar per (teacher, day, start_period, section, subject, lab_room)
                # The variable means "block starts at start_period in this lab room".
                # Individual period coverage is DERIVED, never separately modeled.
                # ────────────────────────────────────────────────────────────
                block_size = subject.lab_consecutive_periods  # ≥ 1, guaranteed by schema

                # Maximum valid start period inclusive:
                #   start_period + block_size ≤ periods_per_day
                #   → start_period ≤ periods_per_day − block_size
                max_start = periods_per_day - block_size

                if max_start < 0:
                    # block_size > periods_per_day: physically impossible.
                    logger.warning(
                        "Subject %s has lab_consecutive_periods=%d which exceeds "
                        "periods_per_day=%d — no lab variables created.",
                        subject.id, block_size, periods_per_day,
                    )
                    continue

                # Filter lab rooms matching the subject's required_lab_type (if specified).
                # Structurally omits mismatched room-subject combinations to shrink search space.
                eligible_lab_rooms = [
                    r for r in lab_rooms
                    if subject.required_lab_type is None or r.lab_type == subject.required_lab_type
                ]

                for teacher in eligible_teachers:
                    for day in working_days:
                        for start_period in range(max_start + 1):
                            for lab_room in eligible_lab_rooms:
                                key = LabKey(
                                    teacher_id=teacher.id,
                                    day=day,
                                    start_period=start_period,
                                    section_id=section.id,
                                    subject_id=subject.id,
                                    lab_room_id=lab_room.id,
                                )
                                lab[key] = model.new_bool_var(_name("lb"))

    # ── Summary ──────────────────────────────────────────────────────────────
    logger.info(
        "build_variables: %d non-lab vars | %d lab-block vars | %d total  "
        "(%d sections, %d teachers, %d subjects, %d lab_rooms, "
        "%d working_days × %d periods/day)",
        len(non_lab), len(lab), len(non_lab) + len(lab),
        len(req.class_sections), len(req.teachers), len(req.subjects),
        len(lab_rooms), len(working_days), periods_per_day,
    )

    return VariableSets(
        non_lab=non_lab,
        lab=lab,
        teacher_subjects=teacher_subjects,
        section_subjects=section_subjects,
        subject_weekly_periods=subject_weekly_periods,
    )
