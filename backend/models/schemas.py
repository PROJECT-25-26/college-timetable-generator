"""
Pydantic v2 request/response schemas.
These mirror the ORM models but are decoupled so the API surface
can evolve independently of the database schema.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

# ---------------------------------------------------------------------------
# Subject preference type
# ---------------------------------------------------------------------------
PreferenceType = Literal["preferred", "willing", "avoid"]

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


# ---------------------------------------------------------------------------
# Shared base
# ---------------------------------------------------------------------------
class _TimestampMixin(BaseModel):
    created_at: datetime
    updated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Department
# ---------------------------------------------------------------------------
class DepartmentCreate(BaseModel):
    name: str = Field(..., max_length=120)
    code: str = Field(..., max_length=20)


class DepartmentUpdate(BaseModel):
    name: str | None = Field(None, max_length=120)
    code: str | None = Field(None, max_length=20)


class DepartmentOut(_TimestampMixin):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str


# ---------------------------------------------------------------------------
# StaffRoom
# ---------------------------------------------------------------------------
class StaffRoomCreate(BaseModel):
    department_id: str
    label: str = Field(..., max_length=120)


class StaffRoomUpdate(BaseModel):
    label: str | None = Field(None, max_length=120)


class StaffRoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    department_id: str
    label: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Subject
# ---------------------------------------------------------------------------
class SubjectCreate(BaseModel):
    name: str = Field(..., max_length=120)
    code: str = Field(..., max_length=20)
    lab: bool = False
    weekly_periods: int | None = Field(None, ge=1, le=30)
    lab_consecutive_periods: int | None = Field(None, ge=1, le=10)
    weekly_lab_sessions: int | None = Field(None, ge=1, le=30)
    required_lab_type: str | None = Field(None, max_length=50)

    @model_validator(mode="after")
    def validate_scheduling_fields(self) -> "SubjectCreate":
        if self.required_lab_type is not None:
            self.required_lab_type = self.required_lab_type.strip() or None
        if self.lab:
            if self.lab_consecutive_periods is None:
                raise ValueError("lab_consecutive_periods is required for lab subjects")
            if self.weekly_lab_sessions is None:
                raise ValueError("weekly_lab_sessions is required for lab subjects")
            self.weekly_periods = (
                self.lab_consecutive_periods * self.weekly_lab_sessions
            )
        else:
            if self.weekly_periods is None:
                self.weekly_periods = 3
            self.lab_consecutive_periods = None
            self.weekly_lab_sessions = None
            self.required_lab_type = None
        return self


class SubjectUpdate(BaseModel):
    name: str | None = Field(None, max_length=120)
    code: str | None = Field(None, max_length=20)
    lab: bool | None = None
    weekly_periods: int | None = Field(None, ge=1, le=30)
    lab_consecutive_periods: int | None = Field(None, ge=1, le=10)
    weekly_lab_sessions: int | None = Field(None, ge=1, le=30)
    required_lab_type: str | None = Field(None, max_length=50)

    @model_validator(mode="after")
    def validate_scheduling_fields(self) -> "SubjectUpdate":
        if self.required_lab_type is not None:
            self.required_lab_type = self.required_lab_type.strip() or None
        if self.lab is None:
            return self
        if self.lab:
            if self.lab_consecutive_periods is None:
                raise ValueError("lab_consecutive_periods is required for lab subjects")
            if self.weekly_lab_sessions is None:
                raise ValueError("weekly_lab_sessions is required for lab subjects")
            self.weekly_periods = (
                self.lab_consecutive_periods * self.weekly_lab_sessions
            )
        else:
            if self.weekly_periods is None:
                raise ValueError("weekly_periods is required for non-lab subjects")
            self.lab_consecutive_periods = None
            self.weekly_lab_sessions = None
            self.required_lab_type = None
        return self


class SubjectOut(_TimestampMixin):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str
    lab: bool
    weekly_periods: int
    lab_consecutive_periods: int | None
    weekly_lab_sessions: int | None
    required_lab_type: str | None = None


# ---------------------------------------------------------------------------
# TeacherSubject (nested in Teacher responses)
# ---------------------------------------------------------------------------
class TeacherSubjectIn(BaseModel):
    subject_id: str
    preference_rank: int = Field(1, ge=1)
    preference_type: PreferenceType = "willing"


class TeacherSubjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    subject_id: str
    preference_rank: int
    preference_type: str
    subject: SubjectOut | None = None


class SubjectPreferencesUpdate(BaseModel):
    """Payload for PATCH /teachers/{id}/subject-preferences"""
    subject_links: list[TeacherSubjectIn]


# ---------------------------------------------------------------------------
# TeacherUnavailableSlot (nested in Teacher responses)
# ---------------------------------------------------------------------------
class UnavailableSlotIn(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)   # 0=Mon … 6=Sun
    period_index: int = Field(..., ge=0)


class UnavailableSlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    day_of_week: int
    period_index: int


# ---------------------------------------------------------------------------
# Teacher
# ---------------------------------------------------------------------------
class TeacherCreate(BaseModel):
    department_id: str | None = None
    name: str = Field(..., max_length=120)
    email: str | None = Field(None, max_length=200)
    max_periods_per_week: int = Field(25, ge=1)
    subject_links: list[TeacherSubjectIn] = []
    unavailable_slots: list[UnavailableSlotIn] = []


class TeacherUpdate(BaseModel):
    department_id: str | None = None
    name: str | None = Field(None, max_length=120)
    email: str | None = Field(None, max_length=200)
    max_periods_per_week: int | None = Field(None, ge=1)
    subject_links: list[TeacherSubjectIn] | None = None
    unavailable_slots: list[UnavailableSlotIn] | None = None


class TeacherOut(_TimestampMixin):
    model_config = ConfigDict(from_attributes=True)

    id: str
    department_id: str | None
    department: DepartmentOut | None = None
    name: str
    email: str | None
    max_periods_per_week: int
    subject_links: list[TeacherSubjectOut] = []
    unavailable_slots: list[UnavailableSlotOut] = []


# ---------------------------------------------------------------------------
# Room
# ---------------------------------------------------------------------------
RoomType = Literal["classroom", "lab", "seminar"]


class RoomCreate(BaseModel):
    name: str = Field(..., max_length=120)
    code: str = Field(..., max_length=20)
    room_type: RoomType = "classroom"
    lab_type: str | None = Field(None, max_length=50)
    capacity: int = Field(60, ge=1)

    @model_validator(mode="after")
    def validate_lab_type(self) -> "RoomCreate":
        if self.lab_type is not None:
            self.lab_type = self.lab_type.strip() or None
        if self.room_type != "lab":
            self.lab_type = None
        return self


class RoomUpdate(BaseModel):
    name: str | None = Field(None, max_length=120)
    code: str | None = Field(None, max_length=20)
    room_type: RoomType | None = None
    lab_type: str | None = Field(None, max_length=50)
    capacity: int | None = Field(None, ge=1)

    @model_validator(mode="after")
    def validate_lab_type(self) -> "RoomUpdate":
        if self.lab_type is not None:
            self.lab_type = self.lab_type.strip() or None
        if self.room_type is not None and self.room_type != "lab":
            self.lab_type = None
        return self


class RoomOut(_TimestampMixin):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str
    room_type: str
    lab_type: str | None = None
    capacity: int


# ---------------------------------------------------------------------------
# ClassSectionSubject (nested in ClassSection responses)
# ---------------------------------------------------------------------------
class SectionSubjectIn(BaseModel):
    subject_id: str
    weekly_periods_override: int | None = Field(None, ge=1, le=30)


class SectionSubjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    subject_id: str
    weekly_periods_override: int | None
    subject: SubjectOut | None = None


# ---------------------------------------------------------------------------
# ClassSection
# ---------------------------------------------------------------------------
class ClassSectionCreate(BaseModel):
    name: str = Field(..., max_length=120)
    code: str = Field(..., max_length=20)
    strength: int = Field(60, ge=1)
    homeroom_id: str | None = None
    subject_links: list[SectionSubjectIn] = []


class ClassSectionUpdate(BaseModel):
    name: str | None = Field(None, max_length=120)
    code: str | None = Field(None, max_length=20)
    strength: int | None = Field(None, ge=1)
    homeroom_id: str | None = None
    subject_links: list[SectionSubjectIn] | None = None


class ClassSectionOut(_TimestampMixin):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str
    strength: int
    homeroom_id: str | None = None
    homeroom: RoomOut | None = None
    subject_links: list[SectionSubjectOut] = []


# ---------------------------------------------------------------------------
# Generic responses
# ---------------------------------------------------------------------------
class MessageResponse(BaseModel):
    message: str


class HealthResponse(BaseModel):
    status: str
    version: str


# ---------------------------------------------------------------------------
# Timetable schemas
# ---------------------------------------------------------------------------
class TimetableSlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:           str
    section_id:   str | None = None
    subject_id:   str | None = None
    teacher_id:   str | None = None
    room_id:      str | None = None
    day_of_week:  int
    period_index: int


class TimetableOut(BaseModel):
    """Full timetable run including all slots."""
    model_config = ConfigDict(from_attributes=True)

    id:             str
    label:          str | None = None
    status:         str
    solver_wall_ms: int | None = None
    message:        str | None = None
    created_at:     datetime
    slots:          list[TimetableSlotOut] = []


class TimetableSummaryOut(BaseModel):
    """Lightweight listing response — slots excluded for performance."""
    model_config = ConfigDict(from_attributes=True)

    id:             str
    label:          str | None = None
    status:         str
    solver_wall_ms: int | None = None
    slot_count:     int = 0          # populated manually by the router
    created_at:     datetime


class TimetableLabelUpdate(BaseModel):
    label: str | None = Field(None, max_length=120)


class TimetableSlotCreate(BaseModel):
    section_id:   str
    subject_id:   str
    teacher_id:   str
    room_id:      str
    day_of_week:  int = Field(..., ge=0, le=6)
    period_index: int = Field(..., ge=0, le=15)


class TimetableSlotsUpdate(BaseModel):
    slots: list[TimetableSlotCreate]

