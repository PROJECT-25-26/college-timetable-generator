"""
SQLAlchemy ORM table definitions for the College Timetable Generator.

Entity hierarchy:
  Department → Teacher (many teachers per dept)
  Department → StaffRoom (one per dept)
  Subject  (global, used by Teachers and ClassSections)
  ClassSection → ClassSectionSubject (join table with weekly_periods)
  Room     (typed rooms, referenced by timetable slots)
  TeacherSubject (join table: teacher ↔ subject with preference rank)
  TeacherUnavailableSlot (blocked slots per teacher)
  Timetable → TimetableSlot (generated schedule runs)
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Department
# ---------------------------------------------------------------------------
class Department(Base):
    __tablename__ = "departments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    teachers: Mapped[list["Teacher"]] = relationship(
        "Teacher", back_populates="department", cascade="all, delete-orphan"
    )
    staffroom: Mapped["StaffRoom | None"] = relationship(
        "StaffRoom", back_populates="department", uselist=False, cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# StaffRoom
# ---------------------------------------------------------------------------
class StaffRoom(Base):
    __tablename__ = "staffrooms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    department_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("departments.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    # Building/Floor will be added in a later phase
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    department: Mapped["Department"] = relationship("Department", back_populates="staffroom")


# ---------------------------------------------------------------------------
# Subject
# ---------------------------------------------------------------------------
class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    weekly_periods: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=3)
    lab: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    lab_consecutive_periods: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    weekly_lab_sessions: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    required_lab_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    teacher_links: Mapped[list["TeacherSubject"]] = relationship(
        "TeacherSubject", back_populates="subject", cascade="all, delete-orphan"
    )
    section_links: Mapped[list["ClassSectionSubject"]] = relationship(
        "ClassSectionSubject", back_populates="subject", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# Teacher
# ---------------------------------------------------------------------------
class Teacher(Base):
    __tablename__ = "teachers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    department_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True, unique=True)
    max_periods_per_week: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=25)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint("max_periods_per_week >= 1", name="ck_teacher_max_week_min"),
    )

    department: Mapped["Department | None"] = relationship("Department", back_populates="teachers")
    subject_links: Mapped[list["TeacherSubject"]] = relationship(
        "TeacherSubject", back_populates="teacher", cascade="all, delete-orphan"
    )
    unavailable_slots: Mapped[list["TeacherUnavailableSlot"]] = relationship(
        "TeacherUnavailableSlot", back_populates="teacher", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# TeacherSubject  (join: teacher ↔ subject with preference rank + type)
# ---------------------------------------------------------------------------
class TeacherSubject(Base):
    __tablename__ = "teacher_subjects"

    teacher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teachers.id", ondelete="CASCADE"), primary_key=True
    )
    subject_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True
    )
    # 1 = most preferred, higher = less preferred
    preference_rank: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    # Categorical preference: 'preferred' | 'willing' | 'avoid'
    preference_type: Mapped[str] = mapped_column(String(20), nullable=False, default="willing")

    __table_args__ = (
        CheckConstraint(
            "preference_type IN ('preferred', 'willing', 'avoid')",
            name="ck_teacher_subject_preference_type",
        ),
    )

    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="subject_links")
    subject: Mapped["Subject"] = relationship("Subject", back_populates="teacher_links")


# ---------------------------------------------------------------------------
# TeacherUnavailableSlot
# day_of_week: 0=Monday … 4=Friday
# period_index: 0-based within the day
# ---------------------------------------------------------------------------
class TeacherUnavailableSlot(Base):
    __tablename__ = "teacher_unavailable_slots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    teacher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False
    )
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0-4
    period_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0-based

    __table_args__ = (
        UniqueConstraint("teacher_id", "day_of_week", "period_index", name="uq_teacher_slot"),
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_dow_range"),
        CheckConstraint("period_index >= 0", name="ck_period_index_min"),
    )

    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="unavailable_slots")


# ---------------------------------------------------------------------------
# Room
# type: 'classroom' | 'lab' | 'seminar'
# ---------------------------------------------------------------------------
class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    room_type: Mapped[str] = mapped_column(String(30), nullable=False, default="classroom")
    lab_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "room_type IN ('classroom', 'lab', 'seminar')", name="ck_room_type_valid"
        ),
        CheckConstraint("capacity > 0", name="ck_room_capacity_positive"),
    )


# ---------------------------------------------------------------------------
# ClassSection
# ---------------------------------------------------------------------------
class ClassSection(Base):
    __tablename__ = "class_sections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    strength: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    # Fixed homeroom where all non-lab periods are taught (teachers come here).
    # Labs are assigned dynamically from available lab rooms at generation time.
    homeroom_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint("strength > 0", name="ck_section_strength_positive"),
    )

    homeroom: Mapped["Room | None"] = relationship("Room", foreign_keys=[homeroom_id])
    subject_links: Mapped[list["ClassSectionSubject"]] = relationship(
        "ClassSectionSubject", back_populates="section", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# ClassSectionSubject  (join: section ↔ subject, overrides weekly_periods)
# ---------------------------------------------------------------------------
class ClassSectionSubject(Base):
    __tablename__ = "class_section_subjects"

    section_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("class_sections.id", ondelete="CASCADE"), primary_key=True
    )
    subject_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True
    )
    # Override the subject default if this section needs a different period count
    weekly_periods_override: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    section: Mapped["ClassSection"] = relationship("ClassSection", back_populates="subject_links")
    subject: Mapped["Subject"] = relationship("Subject", back_populates="section_links")


# ---------------------------------------------------------------------------
# Timetable  (one row per generation run)
# ---------------------------------------------------------------------------
class Timetable(Base):
    __tablename__ = "timetables"

    id:             Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    label:          Mapped[str | None] = mapped_column(String(120), nullable=True)
    status:         Mapped[str] = mapped_column(String(20), nullable=False)   # ok|infeasible|timeout
    solver_wall_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message:        Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at:     Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    slots: Mapped[list["TimetableSlot"]] = relationship(
        "TimetableSlot", back_populates="timetable", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# TimetableSlot  (one row per scheduled period in a timetable run)
# ---------------------------------------------------------------------------
class TimetableSlot(Base):
    __tablename__ = "timetable_slots"

    id:           Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    timetable_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("timetables.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Soft FK: SET NULL so timetable history survives entity deletions
    section_id:   Mapped[str | None] = mapped_column(
        String(36), ForeignKey("class_sections.id", ondelete="SET NULL"), nullable=True
    )
    subject_id:   Mapped[str | None] = mapped_column(
        String(36), ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True
    )
    teacher_id:   Mapped[str | None] = mapped_column(
        String(36), ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True
    )
    room_id:      Mapped[str | None] = mapped_column(
        String(36), ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )
    day_of_week:   Mapped[int]  = mapped_column(SmallInteger, nullable=False)   # 0=Mon … 6=Sun
    period_index:  Mapped[int]  = mapped_column(SmallInteger, nullable=False)   # 0-based
    is_locked:     Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    timetable: Mapped["Timetable"] = relationship("Timetable", back_populates="slots")


# ---------------------------------------------------------------------------
# Campus  (top-level physical container)
# ---------------------------------------------------------------------------
class Campus(Base):
    __tablename__ = "campuses"

    id:          Mapped[str]      = mapped_column(String(36), primary_key=True, default=_uuid)
    name:        Mapped[str]      = mapped_column(String(120), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at:  Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at:  Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    buildings: Mapped[list["Building"]] = relationship(
        "Building", back_populates="campus", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# Building  (belongs to a campus; has a position on the campus map)
# ---------------------------------------------------------------------------
class Building(Base):
    __tablename__ = "buildings"

    id:        Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    campus_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False
    )
    name:   Mapped[str] = mapped_column(String(120), nullable=False)
    code:   Mapped[str] = mapped_column(String(20),  nullable=False)
    # Position / size on the campus overview map (arbitrary units / pixels)
    pos_x:  Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pos_y:  Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    width:  Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    height: Mapped[int] = mapped_column(Integer, nullable=False, default=80)
    color:  Mapped[str] = mapped_column(String(9), nullable=False, default="#6366f1")  # hex
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("campus_id", "code", name="uq_building_campus_code"),
    )

    campus: Mapped["Campus"]       = relationship("Campus", back_populates="buildings")
    floors: Mapped[list["Floor"]]  = relationship(
        "Floor", back_populates="building", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# Floor  (belongs to a building; stores the painted grid as serialised JSON)
# cell_size_m: real-world scale — "1 cell = N metres"
# grid_data:   JSON string representing a 2-D list[list[str]] of CellType values:
#              "empty" | "wall" | "corridor" | "stairs" | "entrance" | "room" | "staffroom"
# room_links:  JSON string — list of blob-record links:
#              [{"blob_id": str, "cells": [[r,c],...], "record_type": "room"|"staffroom", "record_id": str|null}]
# ---------------------------------------------------------------------------
class Floor(Base):
    __tablename__ = "floors"

    id:          Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    building_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False
    )
    name:         Mapped[str]         = mapped_column(String(120), nullable=False)
    level:        Mapped[int]         = mapped_column(SmallInteger, nullable=False, default=0)
    grid_rows:    Mapped[int]         = mapped_column(Integer, nullable=False, default=20)
    grid_cols:    Mapped[int]         = mapped_column(Integer, nullable=False, default=30)
    cell_size_m:  Mapped[float]       = mapped_column(Float,   nullable=False, default=1.0)
    # Serialised grid — None until the admin paints and saves
    grid_data:    Mapped[str | None]  = mapped_column(Text, nullable=True)
    # Serialised blob-to-record link map — JSON, None until links are defined
    room_links:   Mapped[str | None]  = mapped_column(Text, nullable=True)
    created_at:   Mapped[datetime]    = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at:   Mapped[datetime]    = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("building_id", "level", name="uq_floor_building_level"),
        CheckConstraint("grid_rows >= 5 AND grid_rows <= 200", name="ck_floor_rows_range"),
        CheckConstraint("grid_cols >= 5 AND grid_cols <= 200", name="ck_floor_cols_range"),
        CheckConstraint("cell_size_m > 0",                    name="ck_floor_cell_size_positive"),
    )

    building: Mapped["Building"] = relationship("Building", back_populates="floors")
