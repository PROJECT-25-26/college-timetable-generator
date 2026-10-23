"""
Pydantic v2 models for the timetable constraint-solver.

These are intentionally separate from the REST CRUD schemas in models/schemas.py:
  - They carry only the fields the solver actually needs (no timestamps, etc.)
  - They can be imported freely by solver modules without touching ORM/DB code
  - The shape is locked in here so solver logic can be written against a stable contract

Request  →  TimetableRequest
Response →  TimetableResponse
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Literals / enums
# ---------------------------------------------------------------------------
PreferenceType = Literal["preferred", "willing", "avoid"]
RoomType       = Literal["classroom", "lab", "seminar"]
SolverStatus   = Literal["ok", "infeasible", "timeout"]


# ===========================================================================
# INPUT  models
# ===========================================================================

# ---------------------------------------------------------------------------
# Subject
# ---------------------------------------------------------------------------
class SolverSubject(BaseModel):
    """A schedulable subject as seen by the solver."""

    id: str
    name: str
    code: str
    lab: bool = False
    # Total periods the solver must place per week
    weekly_periods: int = Field(..., ge=1, le=60)
    # For lab subjects: how many consecutive periods form one lab block
    lab_consecutive_periods: int | None = Field(None, ge=1, le=10)
    # For lab subjects: how many separate lab blocks per week
    weekly_lab_sessions: int | None = Field(None, ge=1, le=30)
    # Optional lab category filter (e.g. "programming", "electronics")
    required_lab_type: str | None = None

    @model_validator(mode="after")
    def _validate_lab_fields(self) -> "SolverSubject":
        if self.lab:
            if self.lab_consecutive_periods is None:
                raise ValueError("lab_consecutive_periods is required for lab subjects")
            if self.weekly_lab_sessions is None:
                raise ValueError("weekly_lab_sessions is required for lab subjects")
        else:
            self.required_lab_type = None
        return self


# ---------------------------------------------------------------------------
# Teacher
# ---------------------------------------------------------------------------
class SolverTeacherSubjectLink(BaseModel):
    """A teacher's relationship to one subject, with preference metadata."""

    subject_id: str
    preference_rank: int = Field(1, ge=1)
    preference_type: PreferenceType = "willing"


class SolverUnavailableSlot(BaseModel):
    """A (day, period) slot where a teacher cannot be scheduled."""

    day_of_week: int  = Field(..., ge=0, le=6)   # 0=Monday … 6=Sunday
    period_index: int = Field(..., ge=0)          # 0-based within the day


class SolverTeacher(BaseModel):
    id: str
    name: str
    max_periods_per_week: int = Field(25, ge=1)
    # Subjects this teacher can teach, with preference levels
    subject_links: list[SolverTeacherSubjectLink] = []
    # Slots where this teacher is not available (e.g. admin duties)
    unavailable_slots: list[SolverUnavailableSlot] = []
    # ID of the staffroom (StaffRoom.id) this teacher starts and ends their day from.
    # Used by objective O3 to penalise labs that are far from the teacher's home base
    # on the first period of each working day.
    # None when the teacher's department has no staffroom painted on the floor grid.
    staffroom_id: str | None = None


# ---------------------------------------------------------------------------
# Room
# ---------------------------------------------------------------------------
class SolverRoom(BaseModel):
    id: str
    name: str
    code: str
    room_type: RoomType = "classroom"
    lab_type: str | None = None
    capacity: int = Field(60, ge=1)


# ---------------------------------------------------------------------------
# ClassSection
# ---------------------------------------------------------------------------
class SolverSectionSubjectLink(BaseModel):
    """Binds a subject to a section, with an optional period-count override."""

    subject_id: str
    # If set, overrides the subject's default weekly_periods for this section only
    weekly_periods_override: int | None = Field(None, ge=1, le=60)


class SolverClassSection(BaseModel):
    id: str
    name: str
    code: str
    strength: int = Field(60, ge=1)
    # The fixed classroom for all non-lab periods (teachers travel here)
    homeroom_id: str | None = None
    subject_links: list[SolverSectionSubjectLink] = []


# ---------------------------------------------------------------------------
# TimeGrid  — the weekly schedule skeleton
# ---------------------------------------------------------------------------
class TimeGrid(BaseModel):
    """Defines the overall time structure the solver works within."""

    # How many teaching periods exist in each school day
    periods_per_day: int = Field(8, ge=1, le=16)
    # Which days of the week are working days (0=Mon … 6=Sun)
    working_days: list[int] = Field(
        default=[0, 1, 2, 3, 4],
        description="0=Monday … 6=Sunday",
    )

    @model_validator(mode="after")
    def _validate_working_days(self) -> "TimeGrid":
        if not self.working_days:
            raise ValueError("working_days must contain at least one day")
        for d in self.working_days:
            if not (0 <= d <= 6):
                raise ValueError(f"day_of_week {d} is out of range (0–6)")
        if len(set(self.working_days)) != len(self.working_days):
            raise ValueError("working_days must not contain duplicates")
        return self

    @property
    def total_slots(self) -> int:
        """Total available (day, period) slots per week."""
        return len(self.working_days) * self.periods_per_day


# ---------------------------------------------------------------------------
# Locked slot  — a pinned assignment the solver must preserve unchanged
# ---------------------------------------------------------------------------
class LockedSlot(BaseModel):
    """
    One assignment that must appear unchanged in the regenerated timetable.

    The solver finds the matching BoolVar and forces it to 1.
    All competing BoolVars at the same (section, day, period) are forced to 0.
    """
    section_id:   str
    subject_id:   str
    teacher_id:   str
    room_id:      str
    day_of_week:  int = Field(..., ge=0, le=6)
    period_index: int = Field(..., ge=0)


# ---------------------------------------------------------------------------
# Top-level request
# ---------------------------------------------------------------------------
class TimetableRequest(BaseModel):
    """
    Complete dataset snapshot the solver needs to generate a timetable.

    The caller is responsible for sending a consistent snapshot (e.g. all
    subject_ids referenced in teacher_links / section_links must be present
    in the subjects list).  The endpoint validates shape only; cross-reference
    integrity checks happen inside the solver layer.
    """

    subjects:       list[SolverSubject]      = Field(..., min_length=1)
    teachers:       list[SolverTeacher]      = Field(..., min_length=1)
    rooms:          list[SolverRoom]         = Field(..., min_length=1)
    class_sections: list[SolverClassSection] = Field(..., min_length=1)
    time_grid:      TimeGrid
    # Optional list of slots to pin before solving — empty means a fresh solve
    locked_slots:   list[LockedSlot]         = []
    # BFS shortest-path distances between rooms on the same floor (in cells).
    # Populated by the generate endpoint from painted floor grids.
    # Format: room_id → { other_room_id → distance_cells }
    # An empty dict means no layout data is available — O3 is silently skipped.
    room_distances: dict[str, dict[str, int]] = {}
    # BFS distances FROM staffrooms TO every reachable room/lab.
    # Format: staffroom_id → { room_id → distance_cells }
    # Used by O3 to penalise the teacher's walk from their staffroom to the
    # first assigned room/lab of each working day.
    # Populated from GLOBAL_CAMPUS_MATRIX_CACHE.staff_room_distance.
    staffroom_distances: dict[str, dict[str, int]] = {}
    # O3 soft penalty per cell of walking distance (0 disables travel penalty)
    travel_weight: int = Field(2, ge=0, description="O3 soft penalty per cell of walking distance (0 disables travel penalty)")


# ===========================================================================
# OUTPUT  models
# ===========================================================================

class TimetableSlot(BaseModel):
    """
    One scheduled teaching period.

    Constraints guaranteed by the solver:
    - No teacher double-booked at the same (day, period)
    - No room double-booked at the same (day, period)
    - No section double-booked at the same (day, period)
    - Lab subjects appear in consecutive period blocks
    """

    section_id:   str
    subject_id:   str
    teacher_id:   str
    room_id:      str
    day_of_week:  int  # 0=Monday … 6=Sunday
    period_index: int  # 0-based within the day


class TimetableResponse(BaseModel):
    """
    Solver output.

    status:
      "ok"         – a feasible timetable was found; slots are populated
      "infeasible"  – the constraints cannot be simultaneously satisfied
      "timeout"    – solver exceeded the time limit; partial result may be present

    solver_wall_time_ms: actual wall-clock time the solver used (0 for placeholder)
    """

    status:              SolverStatus
    slots:               list[TimetableSlot] = []
    solver_wall_time_ms: int = 0
    message:             str | None = None
