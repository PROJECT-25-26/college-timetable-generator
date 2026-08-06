# models/__init__.py
# Re-export ORM models so Alembic can discover them via `from models import *`
from models.orm import (  # noqa: F401
    Base,
    ClassSection,
    ClassSectionSubject,
    Department,
    Room,
    StaffRoom,
    Subject,
    Teacher,
    TeacherSubject,
    TeacherUnavailableSlot,
)
