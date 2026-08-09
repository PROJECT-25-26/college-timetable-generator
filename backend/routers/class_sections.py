from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.orm import ClassSection, ClassSectionSubject
from models.schemas import (
    ClassSectionCreate,
    ClassSectionOut,
    ClassSectionUpdate,
    MessageResponse,
)

router = APIRouter(prefix="/class-sections", tags=["Class Sections"])

_LOAD_OPTIONS = [
    selectinload(ClassSection.subject_links).selectinload(ClassSectionSubject.subject),
]


async def _get_or_404(section_id: str, db: AsyncSession) -> ClassSection:
    result = await db.execute(
        select(ClassSection)
        .where(ClassSection.id == section_id)
        .options(*_LOAD_OPTIONS)
    )
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Class section not found")
    return section


@router.get("", response_model=list[ClassSectionOut])
@router.get("/", response_model=list[ClassSectionOut])
async def list_sections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ClassSection).options(*_LOAD_OPTIONS).order_by(ClassSection.name)
    )
    return result.scalars().all()


@router.post("", response_model=ClassSectionOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ClassSectionOut, status_code=status.HTTP_201_CREATED)
async def create_section(payload: ClassSectionCreate, db: AsyncSession = Depends(get_db)):
    data = payload.model_dump(exclude={"subject_links"})
    section = ClassSection(**data)

    for link in payload.subject_links:
        section.subject_links.append(ClassSectionSubject(**link.model_dump()))

    db.add(section)
    await db.flush()
    return await _get_or_404(section.id, db)


@router.get("/{section_id}", response_model=ClassSectionOut)
@router.get("/{section_id}/", response_model=ClassSectionOut)
async def get_section(section_id: str, db: AsyncSession = Depends(get_db)):
    return await _get_or_404(section_id, db)


@router.patch("/{section_id}", response_model=ClassSectionOut)
@router.patch("/{section_id}/", response_model=ClassSectionOut)
async def update_section(
    section_id: str, payload: ClassSectionUpdate, db: AsyncSession = Depends(get_db)
):
    section = await _get_or_404(section_id, db)

    scalar_fields = payload.model_dump(exclude={"subject_links"}, exclude_none=True)
    for field, value in scalar_fields.items():
        setattr(section, field, value)

    if payload.subject_links is not None:
        for link in section.subject_links:
            await db.delete(link)
        section.subject_links.clear()
        for link in payload.subject_links:
            section.subject_links.append(
                ClassSectionSubject(section_id=section.id, **link.model_dump())
            )

    await db.flush()
    return await _get_or_404(section.id, db)


@router.delete("/{section_id}", response_model=MessageResponse)
@router.delete("/{section_id}/", response_model=MessageResponse)
async def delete_section(section_id: str, db: AsyncSession = Depends(get_db)):
    section = await _get_or_404(section_id, db)
    await db.delete(section)
    return {"message": f"Class section '{section.name}' deleted"}
