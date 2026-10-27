"""
Analytics router — Admin dashboard statistics for a timetable run.

Endpoints (all under /api/v1/analytics):
  GET /analytics/workload           — teacher periods/week distribution
  GET /analytics/preferences        — per-teacher preference breakdown (% preferred/willing/avoid)
  GET /analytics/room-utilisation   — room occupancy % + proximity-ranked substitutes
  GET /analytics/commute-costs      — per-teacher weekly commute distance report
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.orm import (
    ClassSection,
    Department,
    Room,
    StaffRoom,
    Subject,
    Teacher,
    TeacherSubject,
    Timetable,
    TimetableSlot,
)
from routers.campus import recompute_campus_matrices

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["Analytics"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _require_timetable(timetable_id: str, db: AsyncSession) -> Timetable:
    result = await db.execute(select(Timetable).where(Timetable.id == timetable_id))
    tt = result.scalar_one_or_none()
    if not tt:
        raise HTTPException(status_code=404, detail=f"Timetable '{timetable_id}' not found")
    return tt


async def _latest_ok_id(db: AsyncSession) -> str:
    result = await db.execute(
        select(Timetable.id)
        .where(Timetable.status == "ok")
        .order_by(Timetable.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="No successful timetable run found")
    return row


# ---------------------------------------------------------------------------
# 1. Workload Distribution
# ---------------------------------------------------------------------------

@router.get("/workload")
@router.get("/workload/", include_in_schema=False)
async def get_workload(
    timetable_id: str | None = Query(None, description="Timetable run ID; defaults to latest ok run"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return periods/week per teacher for the given timetable run."""
    if not timetable_id:
        timetable_id = await _latest_ok_id(db)
    await _require_timetable(timetable_id, db)

    result = await db.execute(
        select(TimetableSlot.teacher_id, func.count(TimetableSlot.id).label("cnt"))
        .where(
            TimetableSlot.timetable_id == timetable_id,
            TimetableSlot.teacher_id.is_not(None),
        )
        .group_by(TimetableSlot.teacher_id)
    )
    counts: dict[str, int] = {row.teacher_id: row.cnt for row in result.all()}

    if not counts:
        return {"timetable_id": timetable_id, "teachers": []}

    teacher_rows = (
        await db.execute(
            select(Teacher, Department.name.label("dept_name"))
            .outerjoin(Department, Teacher.department_id == Department.id)
            .where(Teacher.id.in_(list(counts.keys())))
        )
    ).all()

    teachers_out = []
    for teacher, dept_name in teacher_rows:
        p = counts.get(teacher.id, 0)
        mx = teacher.max_periods_per_week or 1
        teachers_out.append({
            "teacher_id":           teacher.id,
            "teacher_name":         teacher.name,
            "department":           dept_name or "—",
            "periods_per_week":     p,
            "max_periods_per_week": teacher.max_periods_per_week,
            "utilisation_pct":      round(p / mx * 100, 1),
        })

    teachers_out.sort(key=lambda x: x["periods_per_week"], reverse=True)
    return {"timetable_id": timetable_id, "teachers": teachers_out}


# ---------------------------------------------------------------------------
# 2. Preference Breakdown
# ---------------------------------------------------------------------------

@router.get("/preferences")
@router.get("/preferences/", include_in_schema=False)
async def get_preferences(
    timetable_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Per-teacher assignment preference breakdown: % Preferred / % Willing / % Avoid."""
    if not timetable_id:
        timetable_id = await _latest_ok_id(db)
    await _require_timetable(timetable_id, db)

    result = await db.execute(
        select(
            TimetableSlot.teacher_id,
            TimetableSlot.subject_id,
            TeacherSubject.preference_type,
            func.count(TimetableSlot.id).label("cnt"),
        )
        .outerjoin(
            TeacherSubject,
            (TeacherSubject.teacher_id == TimetableSlot.teacher_id)
            & (TeacherSubject.subject_id == TimetableSlot.subject_id),
        )
        .where(
            TimetableSlot.timetable_id == timetable_id,
            TimetableSlot.teacher_id.is_not(None),
            TimetableSlot.subject_id.is_not(None),
        )
        .group_by(TimetableSlot.teacher_id, TimetableSlot.subject_id, TeacherSubject.preference_type)
    )
    rows = result.all()

    teacher_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"preferred": 0, "willing": 0, "avoid": 0})
    all_teacher_ids: set[str] = set()
    for row in rows:
        ptype = row.preference_type or "willing"
        if ptype not in ("preferred", "willing", "avoid"):
            ptype = "willing"
        teacher_counts[row.teacher_id][ptype] += row.cnt
        all_teacher_ids.add(row.teacher_id)

    if not all_teacher_ids:
        return {
            "timetable_id": timetable_id,
            "teachers": [],
            "summary": {"preferred_pct": 0.0, "willing_pct": 0.0, "avoid_pct": 0.0},
        }

    teacher_rows = (
        await db.execute(select(Teacher).where(Teacher.id.in_(list(all_teacher_ids))))
    ).scalars().all()
    teacher_name_map = {t.id: t.name for t in teacher_rows}

    teachers_out = []
    global_preferred = global_willing = global_avoid = 0
    for tid, cnts in teacher_counts.items():
        pr = cnts["preferred"]
        wi = cnts["willing"]
        av = cnts["avoid"]
        total = pr + wi + av or 1
        global_preferred += pr
        global_willing   += wi
        global_avoid     += av
        teachers_out.append({
            "teacher_id":       tid,
            "teacher_name":     teacher_name_map.get(tid, "Unknown"),
            "preferred_count":  pr,
            "willing_count":    wi,
            "avoid_count":      av,
            "total_periods":    total,
            "preferred_pct":    round(pr / total * 100, 1),
            "willing_pct":      round(wi / total * 100, 1),
            "avoid_pct":        round(av / total * 100, 1),
        })

    teachers_out.sort(key=lambda x: (-x["avoid_pct"], x["teacher_name"]))

    g_total = global_preferred + global_willing + global_avoid or 1
    summary = {
        "preferred_pct":    round(global_preferred / g_total * 100, 1),
        "willing_pct":      round(global_willing   / g_total * 100, 1),
        "avoid_pct":        round(global_avoid     / g_total * 100, 1),
        "preferred_count":  global_preferred,
        "willing_count":    global_willing,
        "avoid_count":      global_avoid,
    }

    return {"timetable_id": timetable_id, "teachers": teachers_out, "summary": summary}


# ---------------------------------------------------------------------------
# 3. Room Utilisation
# ---------------------------------------------------------------------------

@router.get("/room-utilisation")
@router.get("/room-utilisation/", include_in_schema=False)
async def get_room_utilisation(
    timetable_id: str | None = Query(None),
    campus_id: str | None = Query(None, description="Campus ID for distance-based proximity substitutes"),
    periods_per_day: int = Query(8, ge=1, le=20),
    working_days: str = Query("0,1,2,3,4", description="Comma-separated day indices (0=Mon)"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Room occupancy % across the timetable + proximity-ranked substitute rooms."""
    if not timetable_id:
        timetable_id = await _latest_ok_id(db)
    await _require_timetable(timetable_id, db)

    try:
        day_list = [int(d.strip()) for d in working_days.split(",") if d.strip()]
    except ValueError:
        day_list = [0, 1, 2, 3, 4]
    num_working_days = len(day_list) or 5
    total_slots_capacity = periods_per_day * num_working_days

    result = await db.execute(
        select(TimetableSlot.room_id, func.count(TimetableSlot.id).label("occupied"))
        .where(
            TimetableSlot.timetable_id == timetable_id,
            TimetableSlot.room_id.is_not(None),
        )
        .group_by(TimetableSlot.room_id)
    )
    occ_map: dict[str, int] = {row.room_id: row.occupied for row in result.all()}

    all_room_ids = list(occ_map.keys())
    if not all_room_ids:
        return {"timetable_id": timetable_id, "rooms": []}

    rooms_result = (
        await db.execute(select(Room).where(Room.id.in_(all_room_ids)))
    ).scalars().all()
    room_map: dict[str, Room] = {r.id: r for r in rooms_result}

    all_rooms_result = (await db.execute(select(Room))).scalars().all()
    all_rooms_by_type: dict[str, list[Room]] = defaultdict(list)
    for r in all_rooms_result:
        all_rooms_by_type[r.room_type].append(r)

    all_dists: dict[str, dict[str, int]] = {}
    all_routes: dict[str, dict[str, Any]] = {}
    if campus_id:
        try:
            matrices = await recompute_campus_matrices(db, campus_id)
            all_dists  = matrices.get("allDistances", {})
            all_routes = matrices.get("allRoutes", {})
        except Exception as exc:
            logger.warning("room-utilisation: failed to load campus matrix: %s", exc)

    def _dist_m_val(from_id: str, to_id: str) -> float | None:
        if from_id == to_id:
            return 0.0
        cells = all_dists.get(from_id, {}).get(to_id) or all_dists.get(to_id, {}).get(from_id)
        if cells is None:
            return None
        route_meta = (
            all_routes.get(from_id, {}).get(to_id)
            or all_routes.get(to_id, {}).get(from_id)
            or {}
        )
        dm = route_meta.get("distance_m")
        return float(dm) if dm is not None else float(cells)

    rooms_out = []
    for room_id, occupied in occ_map.items():
        room = room_map.get(room_id)
        if not room:
            continue
        util_pct = round(occupied / total_slots_capacity * 100, 1)

        subs = []
        for candidate in all_rooms_by_type.get(room.room_type, []):
            if candidate.id == room_id:
                continue
            d = _dist_m_val(room_id, candidate.id)
            c = all_dists.get(room_id, {}).get(candidate.id) or all_dists.get(candidate.id, {}).get(room_id)
            subs.append({
                "room_id":        candidate.id,
                "room_name":      candidate.name,
                "room_code":      candidate.code,
                "distance_cells": c,
                "distance_m":     round(d, 2) if d is not None else None,
                "reachable":      d is not None,
            })
        subs.sort(key=lambda s: (not s["reachable"], s["distance_m"] if s["distance_m"] is not None else 9999))
        subs = subs[:5]

        rooms_out.append({
            "room_id":               room_id,
            "room_name":             room.name,
            "room_code":             room.code,
            "room_type":             room.room_type,
            "capacity":              room.capacity,
            "total_slot_capacity":   total_slots_capacity,
            "occupied_slots":        occupied,
            "utilisation_pct":       util_pct,
            "proximity_substitutes": subs,
        })

    rooms_out.sort(key=lambda x: x["utilisation_pct"], reverse=True)

    return {
        "timetable_id":         timetable_id,
        "periods_per_day":      periods_per_day,
        "working_days":         day_list,
        "total_slot_capacity":  total_slots_capacity,
        "rooms":                rooms_out,
    }


# ---------------------------------------------------------------------------
# 4. Commute Cost Report
# ---------------------------------------------------------------------------

_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@router.get("/commute-costs")
@router.get("/commute-costs/", include_in_schema=False)
async def get_commute_costs(
    timetable_id: str | None = Query(None),
    campus_id: str | None = Query(None, description="Campus ID for Module 7f distance data"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Per-teacher weekly commute cost report using Module 7f distances."""
    if not timetable_id:
        timetable_id = await _latest_ok_id(db)
    await _require_timetable(timetable_id, db)

    slots_result = (
        await db.execute(
            select(TimetableSlot)
            .where(
                TimetableSlot.timetable_id == timetable_id,
                TimetableSlot.teacher_id.is_not(None),
            )
            .order_by(TimetableSlot.teacher_id, TimetableSlot.day_of_week, TimetableSlot.period_index)
        )
    ).scalars().all()

    if not slots_result:
        return {"timetable_id": timetable_id, "campus_id": campus_id, "teachers": []}

    slots_by_teacher: dict[str, list[TimetableSlot]] = defaultdict(list)
    all_teacher_ids: set[str] = set()
    for slot in slots_result:
        slots_by_teacher[slot.teacher_id].append(slot)
        all_teacher_ids.add(slot.teacher_id)

    teacher_rows = (
        await db.execute(
            select(Teacher, Department.name.label("dept_name"))
            .outerjoin(Department, Teacher.department_id == Department.id)
            .where(Teacher.id.in_(list(all_teacher_ids)))
        )
    ).all()
    teacher_map: dict[str, Teacher] = {}
    dept_map: dict[str, str] = {}
    for teacher, dept_name in teacher_rows:
        teacher_map[teacher.id] = teacher
        dept_map[teacher.id] = dept_name or "—"

    staffroom_rows = (await db.execute(select(StaffRoom))).scalars().all()
    sr_by_dept: dict[str, StaffRoom] = {sr.department_id: sr for sr in staffroom_rows}

    def _get_staffroom_id(teacher: Teacher) -> str | None:
        if not teacher.department_id:
            return None
        sr = sr_by_dept.get(teacher.department_id)
        return sr.id if sr else None

    all_dists: dict[str, dict[str, int]] = {}
    all_routes: dict[str, dict[str, Any]] = {}
    sr_dists: dict[str, dict[str, int]] = {}
    if campus_id:
        try:
            matrices = await recompute_campus_matrices(db, campus_id)
            all_dists  = matrices.get("allDistances", {})
            all_routes = matrices.get("allRoutes", {})
            sr_dists   = matrices.get("staffRoomDistance", {})
        except Exception as exc:
            logger.warning("commute-costs: failed to load campus matrix for %s: %s", campus_id, exc)

    def _get_dist(from_id: str | None, to_id: str | None) -> tuple[int | None, float | None]:
        if not from_id or not to_id:
            return None, None
        if from_id == to_id:
            return 0, 0.0
        cells = (
            sr_dists.get(from_id, {}).get(to_id)
            or sr_dists.get(to_id, {}).get(from_id)
            or all_dists.get(from_id, {}).get(to_id)
            or all_dists.get(to_id, {}).get(from_id)
        )
        if cells is None or cells < 0:
            return None, None
        route_meta = (
            all_routes.get(from_id, {}).get(to_id)
            or all_routes.get(to_id, {}).get(from_id)
            or {}
        )
        dm = route_meta.get("distance_m")
        dist_m = float(dm) if dm is not None else float(cells)
        return cells, round(dist_m, 2)

    teachers_out = []
    for tid in all_teacher_ids:
        teacher = teacher_map.get(tid)
        if not teacher:
            continue
        sr_id = _get_staffroom_id(teacher)

        slots_by_day: dict[int, list[TimetableSlot]] = defaultdict(list)
        for s in slots_by_teacher[tid]:
            slots_by_day[s.day_of_week].append(s)

        weekly_cells = 0
        weekly_m = 0.0
        weekly_gap_hops = 0
        weekly_direct_hops = 0
        daily_breakdown: dict[str, Any] = {}

        for day_idx, day_slots in slots_by_day.items():
            day_slots_sorted = sorted(day_slots, key=lambda s: s.period_index)

            walk: list[str | None] = [sr_id] if sr_id else []
            gap_hops_day = 0

            for i, slot in enumerate(day_slots_sorted):
                if i > 0:
                    prev = day_slots_sorted[i - 1]
                    gap = slot.period_index - prev.period_index
                    if gap > 1 and sr_id:
                        walk.append(sr_id)
                        gap_hops_day += 1
                walk.append(slot.room_id)

            if sr_id:
                walk.append(sr_id)

            day_cells = 0
            day_m = 0.0
            day_hops = 0

            for k in range(len(walk) - 1):
                frm, to_ = walk[k], walk[k + 1]
                c, dm = _get_dist(frm, to_)
                if dm is not None:
                    day_cells += (c or 0)
                    day_m += dm
                day_hops += 1

            direct_hops_day = max(0, day_hops - gap_hops_day)
            weekly_cells += day_cells
            weekly_m     += day_m
            weekly_gap_hops    += gap_hops_day
            weekly_direct_hops += direct_hops_day

            daily_breakdown[str(day_idx)] = {
                "day_name":      _DAY_NAMES[day_idx] if 0 <= day_idx < 7 else f"Day {day_idx}",
                "total_cells":   day_cells,
                "total_m":       round(day_m, 2),
                "hops":          day_hops,
                "gap_hops":      gap_hops_day,
                "periods_count": len(day_slots_sorted),
            }

        teachers_out.append({
            "teacher_id":         tid,
            "teacher_name":       teacher.name,
            "department":         dept_map.get(tid, "—"),
            "staffroom_id":       sr_id,
            "weekly_total_cells": weekly_cells,
            "weekly_total_m":     round(weekly_m, 2),
            "gap_hops":           weekly_gap_hops,
            "direct_hops":        weekly_direct_hops,
            "total_hops":         weekly_gap_hops + weekly_direct_hops,
            "daily_breakdown":    daily_breakdown,
        })

    teachers_out.sort(key=lambda x: x["weekly_total_m"], reverse=True)

    return {
        "timetable_id": timetable_id,
        "campus_id":    campus_id,
        "sorted_by":    "weekly_total_m",
        "teachers":     teachers_out,
    }
