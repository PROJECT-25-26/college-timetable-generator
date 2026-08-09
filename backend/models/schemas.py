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

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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
    weekly_periods: int = Field(3, ge=1, le=30)
    requires_lab: bool = False


class SubjectUpdate(BaseModel):
    name: str | None = Field(None, max_length=120)
    code: str | None = Field(None, max_length=20)
    weekly_periods: int | None = Field(None, ge=1, le=30)
    requires_lab: bool | None = None


class SubjectOut(_TimestampMixin):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str
    weekly_periods: int
    requires_lab: bool


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
    max_periods_per_day: int = Field(6, ge=1)
    max_periods_per_week: int = Field(25, ge=1)
    subject_links: list[TeacherSubjectIn] = []
    unavailable_slots: list[UnavailableSlotIn] = []

    @field_validator("max_periods_per_week")
    @classmethod
    def week_gte_day(cls, v: int, info) -> int:
        day = info.data.get("max_periods_per_day", 1)
        if v < day:
            raise ValueError("max_periods_per_week must be >= max_periods_per_day")
        return v


class TeacherUpdate(BaseModel):
    department_id: str | None = None
    name: str | None = Field(None, max_length=120)
    email: str | None = Field(None, max_length=200)
    max_periods_per_day: int | None = Field(None, ge=1)
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
    max_periods_per_day: int
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
    capacity: int = Field(60, ge=1)


class RoomUpdate(BaseModel):
    name: str | None = Field(None, max_length=120)
    code: str | None = Field(None, max_length=20)
    room_type: RoomType | None = None
    capacity: int | None = Field(None, ge=1)


class RoomOut(_TimestampMixin):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str
    room_type: str
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
    subject_links: list[SectionSubjectIn] = []


class ClassSectionUpdate(BaseModel):
    name: str | None = Field(None, max_length=120)
    code: str | None = Field(None, max_length=20)
    strength: int | None = Field(None, ge=1)
    subject_links: list[SectionSubjectIn] | None = None


class ClassSectionOut(_TimestampMixin):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str
    strength: int
    subject_links: list[SectionSubjectOut] = []


# ---------------------------------------------------------------------------
# Generic responses
# ---------------------------------------------------------------------------
class MessageResponse(BaseModel):
    message: str


class HealthResponse(BaseModel):
    status: str
    version: str
