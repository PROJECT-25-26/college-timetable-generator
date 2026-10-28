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
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from exporter import generate_excel_export, generate_pdf_export
from models.orm import (
    ClassSection,
    Room,
    Subject,
    Teacher,
    Timetable,
    TimetableSlot as TimetableSlotORM,
)
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


# ── Export PDF / Excel ────────────────────────────────────────────────────────
@router.get("/{timetable_id}/export/pdf")
@router.get("/{timetable_id}/export/pdf/", include_in_schema=False)
async def export_timetable_pdf(
    timetable_id: str,
    scope: str = "master",  # 'class' | 'teacher' | 'master'
    entity_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Generate and return a downloadable PDF for per-class, per-teacher, or master timetable."""
    timetable = await _get_or_404(timetable_id, db)
    sec_map, teach_map, subj_map, room_map = await _fetch_entity_maps(db)

    slots_data = [
        {
            "section_id": s.section_id,
            "subject_id": s.subject_id,
            "teacher_id": s.teacher_id,
            "room_id": s.room_id,
            "day_of_week": s.day_of_week,
            "period_index": s.period_index,
            "is_locked": s.is_locked,
        }
        for s in timetable.slots
    ]

    pdf_bytes = generate_pdf_export(
        timetable_label=timetable.label or timetable.id[:8],
        slots=slots_data,
        scope=scope,
        entity_id=entity_id,
        section_map=sec_map,
        teacher_map=teach_map,
        subject_map=subj_map,
        room_map=room_map,
    )

    filename = f"timetable_{scope}_{entity_id or 'all'}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{timetable_id}/export/excel")
@router.get("/{timetable_id}/export/excel/", include_in_schema=False)
async def export_timetable_excel(
    timetable_id: str,
    scope: str = "master",  # 'class' | 'teacher' | 'master'
    entity_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Generate and return a downloadable Excel (.xlsx) file for per-class, per-teacher, or master timetable."""
    timetable = await _get_or_404(timetable_id, db)
    sec_map, teach_map, subj_map, room_map = await _fetch_entity_maps(db)

    slots_data = [
        {
            "section_id": s.section_id,
            "subject_id": s.subject_id,
            "teacher_id": s.teacher_id,
            "room_id": s.room_id,
            "day_of_week": s.day_of_week,
            "period_index": s.period_index,
            "is_locked": s.is_locked,
        }
        for s in timetable.slots
    ]

    xlsx_bytes = generate_excel_export(
        timetable_label=timetable.label or timetable.id[:8],
        slots=slots_data,
        scope=scope,
        entity_id=entity_id,
        section_map=sec_map,
        teacher_map=teach_map,
        subject_map=subj_map,
        room_map=room_map,
    )

    filename = f"timetable_{scope}_{entity_id or 'all'}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Global Schedule Search ───────────────────────────────────────────────────
@router.get("/latest/search")
@router.get("/latest/search/", include_in_schema=False)
async def search_latest_timetable(
    q: str | None = None,
    entity_type: str = "all",
    entity_id: str | None = None,
    day_of_week: int | None = None,
    min_period: int = 0,
    max_period: int = 7,
    room_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Search teacher schedules, room schedules, or free slots in the latest timetable."""
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
    return await _perform_timetable_search(
        timetable, q, entity_type, entity_id, day_of_week, min_period, max_period, room_type, db
    )


@router.get("/{timetable_id}/search")
@router.get("/{timetable_id}/search/", include_in_schema=False)
async def search_timetable(
    timetable_id: str,
    q: str | None = None,
    entity_type: str = "all",
    entity_id: str | None = None,
    day_of_week: int | None = None,
    min_period: int = 0,
    max_period: int = 7,
    room_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Search teacher schedules, room schedules, or free slots in a specific timetable run."""
    if timetable_id == "latest":
        return await search_latest_timetable(
            q, entity_type, entity_id, day_of_week, min_period, max_period, room_type, db
        )
    timetable = await _get_or_404(timetable_id, db)
    return await _perform_timetable_search(
        timetable, q, entity_type, entity_id, day_of_week, min_period, max_period, room_type, db
    )


# ── Private helper ────────────────────────────────────────────────────────────
async def _perform_timetable_search(
    timetable: Timetable,
    q: str | None,
    entity_type: str,
    entity_id: str | None,
    day_of_week: int | None,
    min_period: int,
    max_period: int,
    room_type: str | None,
    db: AsyncSession,
):
    sec_map, teach_map, subj_map, room_map = await _fetch_entity_maps(db)

    query_str = (q or "").strip().lower()
    days_to_check = [day_of_week] if day_of_week is not None and 0 <= day_of_week <= 6 else [0, 1, 2, 3, 4]
    min_p = max(0, min_period)
    max_p = min(7, max_period)

    teacher_slots = {}
    room_slots = {}
    occupied_room_slots = set()

    for s in timetable.slots:
        if s.teacher_id:
            teacher_slots.setdefault(s.teacher_id, []).append(s)
        if s.room_id:
            room_slots.setdefault(s.room_id, []).append(s)
            occupied_room_slots.add((s.room_id, s.day_of_week, s.period_index))

    teacher_results = []
    room_results = []
    free_slot_results = []

    # Teacher Schedule Search
    if entity_type in ("all", "teacher"):
        for t_id, t_info in teach_map.items():
            if entity_id and t_id != entity_id:
                continue
            name = t_info.get("name", "")
            email = t_info.get("email", "")
            if query_str and not (query_str in name.lower() or query_str in (email or "").lower()):
                continue

            slots_for_t = teacher_slots.get(t_id, [])
            matching_slots = []
            for s in slots_for_t:
                if s.day_of_week in days_to_check and min_p <= s.period_index <= max_p:
                    subj = subj_map.get(s.subject_id, {})
                    sec = sec_map.get(s.section_id, {})
                    rm = room_map.get(s.room_id, {})
                    matching_slots.append({
                        "id": s.id,
                        "day_of_week": s.day_of_week,
                        "period_index": s.period_index,
                        "subject_id": s.subject_id,
                        "subject_name": subj.get("name"),
                        "subject_code": subj.get("code"),
                        "section_id": s.section_id,
                        "section_name": sec.get("name"),
                        "section_code": sec.get("code"),
                        "room_id": s.room_id,
                        "room_name": rm.get("name"),
                        "room_code": rm.get("code"),
                        "is_locked": s.is_locked,
                    })
            if matching_slots or (not query_str and slots_for_t):
                teacher_results.append({
                    "teacher_id": t_id,
                    "teacher_name": name,
                    "teacher_email": email,
                    "total_occupied_periods": len(slots_for_t),
                    "slots": sorted(matching_slots, key=lambda x: (x["day_of_week"], x["period_index"])),
                })

    # Room Schedule Search
    if entity_type in ("all", "room"):
        for r_id, r_info in room_map.items():
            if entity_id and r_id != entity_id:
                continue
            r_name = r_info.get("name", "")
            r_code = r_info.get("code", "")
            r_tp = r_info.get("room_type", "")
            if room_type and r_tp.lower() != room_type.lower():
                continue
            if query_str and not (query_str in r_name.lower() or query_str in r_code.lower() or query_str in r_tp.lower()):
                continue

            slots_for_r = room_slots.get(r_id, [])
            matching_slots = []
            for s in slots_for_r:
                if s.day_of_week in days_to_check and min_p <= s.period_index <= max_p:
                    subj = subj_map.get(s.subject_id, {})
                    sec = sec_map.get(s.section_id, {})
                    tch = teach_map.get(s.teacher_id, {})
                    matching_slots.append({
                        "id": s.id,
                        "day_of_week": s.day_of_week,
                        "period_index": s.period_index,
                        "subject_id": s.subject_id,
                        "subject_name": subj.get("name"),
                        "subject_code": subj.get("code"),
                        "section_id": s.section_id,
                        "section_name": sec.get("name"),
                        "section_code": sec.get("code"),
                        "teacher_id": s.teacher_id,
                        "teacher_name": tch.get("name"),
                        "is_locked": s.is_locked,
                    })
            if matching_slots or (not query_str and slots_for_r):
                room_results.append({
                    "room_id": r_id,
                    "room_name": r_name,
                    "room_code": r_code,
                    "room_type": r_tp,
                    "total_occupied_periods": len(slots_for_r),
                    "slots": sorted(matching_slots, key=lambda x: (x["day_of_week"], x["period_index"])),
                })

    # Free Slots Search
    if entity_type in ("all", "free_slots"):
        for r_id, r_info in room_map.items():
            if entity_id and r_id != entity_id:
                continue
            r_tp = r_info.get("room_type", "")
            if room_type and r_tp.lower() != room_type.lower():
                continue
            r_name = r_info.get("name", "")
            r_code = r_info.get("code", "")
            if query_str and not (query_str in r_name.lower() or query_str in r_code.lower() or query_str in r_tp.lower()):
                continue

            for d in days_to_check:
                for p in range(min_p, max_p + 1):
                    if (r_id, d, p) not in occupied_room_slots:
                        free_slot_results.append({
                            "room_id": r_id,
                            "room_name": r_name,
                            "room_code": r_code,
                            "room_type": r_tp,
                            "day_of_week": d,
                            "period_index": p,
                        })

    return {
        "timetable_id": timetable.id,
        "timetable_label": timetable.label,
        "query": q,
        "filters": {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "day_of_week": day_of_week,
            "min_period": min_p,
            "max_period": max_p,
            "room_type": room_type,
        },
        "teachers": teacher_results,
        "rooms": room_results,
        "free_slots": sorted(free_slot_results, key=lambda x: (x["day_of_week"], x["period_index"], x["room_code"])),
    }


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


async def _fetch_entity_maps(db: AsyncSession):
    sec_res = await db.execute(select(ClassSection))
    teach_res = await db.execute(select(Teacher))
    subj_res = await db.execute(select(Subject))
    room_res = await db.execute(select(Room))

    sec_map = {
        s.id: {"name": s.name, "code": s.code, "homeroom_id": s.homeroom_id}
        for s in sec_res.scalars().all()
    }
    teach_map = {
        t.id: {"name": t.name, "email": t.email}
        for t in teach_res.scalars().all()
    }
    subj_map = {
        sub.id: {"name": sub.name, "code": sub.code, "lab": sub.lab}
        for sub in subj_res.scalars().all()
    }
    room_map = {
        r.id: {"name": r.name, "code": r.code, "room_type": r.room_type}
        for r in room_res.scalars().all()
    }
    return sec_map, teach_map, subj_map, room_map
