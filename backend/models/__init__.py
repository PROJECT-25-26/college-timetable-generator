# models/__init__.py
# Re-export ORM models so Alembic can discover them via `from models import *`
from models.orm import (  # noqa: F401
    Base,
    Building,
    Campus,
    ClassSection,
    ClassSectionSubject,
    Department,
    Floor,
    Room,
    StaffRoom,
    Subject,
    Teacher,
    TeacherSubject,
    TeacherUnavailableSlot,
    Timetable,
    TimetableSlot,
)
