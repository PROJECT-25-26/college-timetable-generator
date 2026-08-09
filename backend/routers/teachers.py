from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.orm import Teacher, TeacherSubject, TeacherUnavailableSlot
from models.schemas import MessageResponse, SubjectPreferencesUpdate, TeacherCreate, TeacherOut, TeacherUpdate

router = APIRouter(prefix="/teachers", tags=["Teachers"])

_LOAD_OPTIONS = [
    selectinload(Teacher.subject_links).selectinload(TeacherSubject.subject),
    selectinload(Teacher.unavailable_slots),
    selectinload(Teacher.department),
]


async def _get_or_404(teacher_id: str, db: AsyncSession) -> Teacher:
    result = await db.execute(
        select(Teacher)
        .where(Teacher.id == teacher_id)
        .options(*_LOAD_OPTIONS)
    )
    teacher = result.scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return teacher


@router.get("", response_model=list[TeacherOut])
@router.get("/", response_model=list[TeacherOut])
async def list_teachers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Teacher).options(*_LOAD_OPTIONS).order_by(Teacher.name)
    )
    return result.scalars().all()


@router.post("", response_model=TeacherOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=TeacherOut, status_code=status.HTTP_201_CREATED)
async def create_teacher(payload: TeacherCreate, db: AsyncSession = Depends(get_db)):
    data = payload.model_dump(exclude={"subject_links", "unavailable_slots"})
    teacher = Teacher(**data)

    for link in payload.subject_links:
        teacher.subject_links.append(TeacherSubject(**link.model_dump()))
    for slot in payload.unavailable_slots:
        teacher.unavailable_slots.append(TeacherUnavailableSlot(**slot.model_dump()))

    db.add(teacher)
    await db.flush()
    return await _get_or_404(teacher.id, db)


@router.get("/{teacher_id}", response_model=TeacherOut)
@router.get("/{teacher_id}/", response_model=TeacherOut)
async def get_teacher(teacher_id: str, db: AsyncSession = Depends(get_db)):
    return await _get_or_404(teacher_id, db)


@router.patch("/{teacher_id}", response_model=TeacherOut)
@router.patch("/{teacher_id}/", response_model=TeacherOut)
async def update_teacher(
    teacher_id: str, payload: TeacherUpdate, db: AsyncSession = Depends(get_db)
):
    teacher = await _get_or_404(teacher_id, db)

    scalar_fields = payload.model_dump(
        exclude={"subject_links", "unavailable_slots"}, exclude_none=True
    )
    for field, value in scalar_fields.items():
        setattr(teacher, field, value)

    if payload.subject_links is not None:
        # Replace all subject links
        for link in teacher.subject_links:
            await db.delete(link)
        teacher.subject_links.clear()
        for link in payload.subject_links:
            teacher.subject_links.append(TeacherSubject(teacher_id=teacher.id, **link.model_dump()))

    if payload.unavailable_slots is not None:
        for slot in teacher.unavailable_slots:
            await db.delete(slot)
        teacher.unavailable_slots.clear()
        for slot in payload.unavailable_slots:
            teacher.unavailable_slots.append(
                TeacherUnavailableSlot(teacher_id=teacher.id, **slot.model_dump())
            )

    await db.flush()
    return await _get_or_404(teacher.id, db)


@router.patch("/{teacher_id}/subject-preferences", response_model=TeacherOut)
@router.patch("/{teacher_id}/subject-preferences/", response_model=TeacherOut)
async def update_subject_preferences(
    teacher_id: str,
    payload: SubjectPreferencesUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Replace a teacher's subject preference links without touching other fields."""
    teacher = await _get_or_404(teacher_id, db)

    for link in teacher.subject_links:
        await db.delete(link)
    teacher.subject_links.clear()

    for link in payload.subject_links:
        teacher.subject_links.append(
            TeacherSubject(teacher_id=teacher.id, **link.model_dump())
        )

    await db.flush()
    return await _get_or_404(teacher.id, db)


@router.delete("/{teacher_id}", response_model=MessageResponse)
@router.delete("/{teacher_id}/", response_model=MessageResponse)
async def delete_teacher(teacher_id: str, db: AsyncSession = Depends(get_db)):
    teacher = await _get_or_404(teacher_id, db)
    await db.delete(teacher)
    return {"message": f"Teacher '{teacher.name}' deleted"}
