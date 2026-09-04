"""
Timetables router — CRUD for generated timetable runs.

Endpoints:
  GET    /timetables          — list all runs (summary, no slots)
  GET    /timetables/latest   — latest successful run with full slots
  GET    /timetables/{id}     — fetch one run with full slots
  PATCH  /timetables/{id}     — update label only
  DELETE /timetables/{id}     — delete run and cascade-delete its slots
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.orm import Timetable, TimetableSlot as TimetableSlotORM
from models.schemas import (
    MessageResponse,
    TimetableLabelUpdate,
    TimetableOut,
    TimetableSlotsUpdate,
    TimetableSummaryOut,
)

router = APIRouter(prefix="/timetables", tags=["Timetables"])

_SLOT_LOAD = [selectinload(Timetable.slots)]



# ── List — lightweight, no slots ─────────────────────────────────────────────
@router.get("", response_model=list[TimetableSummaryOut])
@router.get("/", response_model=list[TimetableSummaryOut], include_in_schema=False)
async def list_timetables(db: AsyncSession = Depends(get_db)):
    """
    Return all timetable runs ordered newest-first.
    Slots are not included — use GET /timetables/{id} for that.
    """
    # Fetch timetables with slot counts in one query
    result = await db.execute(
        select(
            Timetable,
            func.count(TimetableSlotORM.id).label("slot_count"),
        )
        .outerjoin(TimetableSlotORM, TimetableSlotORM.timetable_id == Timetable.id)
        .group_by(Timetable.id)
        .order_by(Timetable.created_at.desc())
    )
    rows = result.all()

    summaries = []
    for timetable, slot_count in rows:
        data = TimetableSummaryOut.model_validate(timetable)
        data.slot_count = slot_count
        summaries.append(data)

    return summaries


# ── Latest successful run ─────────────────────────────────────────────────────
@router.get("/latest", response_model=TimetableOut)
async def get_latest_timetable(db: AsyncSession = Depends(get_db)):
    """
    Return the most recently generated timetable with status='ok', including
    all slots.  Returns 404 if no successful run exists yet.
    """
    result = await db.execute(
        select(Timetable)
        .where(Timetable.status == "ok")
        .options(*_SLOT_LOAD)
        .order_by(Timetable.created_at.desc())
        .limit(1)
    )
    timetable = result.scalar_one_or_none()
    if not timetable:
        raise HTTPException(status_code=404, detail="No successful timetable found")
    return timetable


# ── Get one ───────────────────────────────────────────────────────────────────
@router.get("/{timetable_id}", response_model=TimetableOut)
@router.get("/{timetable_id}/", response_model=TimetableOut, include_in_schema=False)
async def get_timetable(timetable_id: str, db: AsyncSession = Depends(get_db)):
    """Return a single timetable run with all its slots."""
    timetable = await _get_or_404(timetable_id, db)
    return timetable


# ── Update label ──────────────────────────────────────────────────────────────
@router.patch("/{timetable_id}", response_model=TimetableOut)
@router.patch("/{timetable_id}/", response_model=TimetableOut, include_in_schema=False)
async def update_timetable_label(
    timetable_id: str,
    payload: TimetableLabelUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Rename a timetable run (the only mutable field)."""
    timetable = await _get_or_404(timetable_id, db)
    timetable.label = payload.label
    await db.flush()
    return timetable


# ── Update slots ──────────────────────────────────────────────────────────────
@router.put("/{timetable_id}/slots", response_model=TimetableOut)
@router.put("/{timetable_id}/slots/", response_model=TimetableOut, include_in_schema=False)
async def update_timetable_slots(
    timetable_id: str,
    payload: TimetableSlotsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Replace all slots in an existing timetable run with updated slots."""
    timetable = await _get_or_404(timetable_id, db)

    # Delete existing slots for this timetable
    await db.execute(
        delete(TimetableSlotORM).where(TimetableSlotORM.timetable_id == timetable_id)
    )

    # Add updated slots
    for s in payload.slots:
        db.add(TimetableSlotORM(
            id=str(uuid.uuid4()),
            timetable_id=timetable_id,
            section_id=s.section_id,
            subject_id=s.subject_id,
            teacher_id=s.teacher_id,
            room_id=s.room_id,
            day_of_week=s.day_of_week,
            period_index=s.period_index,
            is_locked=s.is_locked,
        ))

    await db.flush()
    return await _get_or_404(timetable_id, db)



# ── Delete ────────────────────────────────────────────────────────────────────
@router.delete("/{timetable_id}", response_model=MessageResponse)
@router.delete("/{timetable_id}/", response_model=MessageResponse, include_in_schema=False)
async def delete_timetable(timetable_id: str, db: AsyncSession = Depends(get_db)):
    """
    Delete a timetable run.  Cascade-deletes all its slots automatically.
    """
    timetable = await _get_or_404(timetable_id, db)
    label = timetable.label or timetable.id
    await db.delete(timetable)
    return {"message": f"Timetable '{label}' and all its slots deleted"}


# ── Private helper ────────────────────────────────────────────────────────────
async def _get_or_404(timetable_id: str, db: AsyncSession) -> Timetable:
    result = await db.execute(
        select(Timetable)
        .where(Timetable.id == timetable_id)
        .options(*_SLOT_LOAD)
    )
    timetable = result.scalar_one_or_none()
    if not timetable:
        raise HTTPException(status_code=404, detail="Timetable not found")
    return timetable
