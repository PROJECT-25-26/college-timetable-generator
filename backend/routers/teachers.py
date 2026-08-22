from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.orm import Department, Subject, Teacher, TeacherSubject, TeacherUnavailableSlot
from models.schemas import MessageResponse, SubjectPreferencesUpdate, TeacherCreate, TeacherOut, TeacherUpdate
from routers.csv_utils import CsvRowError, parse_csv_bytes, parse_int_field, raise_if_errors

router = APIRouter(prefix="/teachers", tags=["Teachers"])

_LOAD_OPTIONS = [
    selectinload(Teacher.subject_links).selectinload(TeacherSubject.subject),
    selectinload(Teacher.unavailable_slots),
    selectinload(Teacher.department),
]

_VALID_LEVELS = {"preferred", "willing", "avoid"}

# ---------------------------------------------------------------------------
# CSV column positions (0-based) for fixed scalar fields
# ---------------------------------------------------------------------------
_COL_NAME   = 0
_COL_EMAIL  = 1
_COL_DEPT   = 2
_COL_MAX    = 3
_FIXED_COLS = 4   # columns 4+ are subject:level pairs


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


@router.post(
    "/import-csv",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk-import teachers from a CSV file",
    tags=["Teachers"],
)
@router.post(
    "/import-csv/",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk-import teachers from a CSV file",
    tags=["Teachers"],
)
async def import_teachers_csv(
    file: UploadFile = File(..., description="UTF-8 CSV file"),
    db: AsyncSession = Depends(get_db),
):
    """
    Import multiple teachers from a CSV file.

    **Expected columns (header row required):**
    ```
    name, email, department_code, max_periods_per_week, <SUBJ_CODE>:<level>, ...
    ```
    * `name` is required; all other fixed columns are optional.
    * Subject columns (column 5 onward) use the format `CODE:preferred|willing|avoid`.
    * `preference_rank` is auto-assigned by column order (leftmost = rank 1).

    All rows are validated before any data is written.  On any error the
    endpoint returns HTTP 422 with a per-row error report and saves **nothing**.
    """
    content = await file.read()
    _header, rows = parse_csv_bytes(content)

    if not rows:
        return {"imported": 0, "message": "CSV has no data rows."}

    # ── Pre-load lookup maps ────────────────────────────────────────────────
    dept_map: dict[str, str] = {}   # code → id
    for row in (await db.execute(select(Department.code, Department.id))).all():
        dept_map[row.code.upper()] = row.id

    subj_map: dict[str, str] = {}   # code → id
    for row in (await db.execute(select(Subject.code, Subject.id))).all():
        subj_map[row.code.upper()] = row.id

    # ── Per-row validation pass ─────────────────────────────────────────────
    errors: list[CsvRowError] = []
    validated: list[dict] = []

    for row_idx, cells in enumerate(rows, start=1):
        row_errors: list[CsvRowError] = []

        def err(field: str, msg: str) -> None:
            row_errors.append(CsvRowError(row=row_idx, field=field, message=msg))

        # -- Scalar fields ---------------------------------------------------
        name = cells[_COL_NAME] if len(cells) > _COL_NAME else ""
        if not name.strip():
            err("name", "name is required")

        email_raw  = cells[_COL_EMAIL].strip()  if len(cells) > _COL_EMAIL else ""
        dept_code  = cells[_COL_DEPT].strip().upper() if len(cells) > _COL_DEPT else ""
        max_raw    = cells[_COL_MAX].strip()  if len(cells) > _COL_MAX  else ""

        dept_id: str | None = None
        if dept_code:
            if dept_code not in dept_map:
                err("department_code", f"department '{dept_code}' not found")
            else:
                dept_id = dept_map[dept_code]

        max_periods = parse_int_field(max_raw) if max_raw else 25
        if max_periods is None:
            err("max_periods_per_week", f"'{max_raw}' is not a valid integer")
        elif max_periods < 1:
            err("max_periods_per_week", "max_periods_per_week must be ≥ 1")

        # -- Subject columns (variable, from index _FIXED_COLS onward) -------
        subject_links: list[dict] = []
        for col_i, cell in enumerate(cells[_FIXED_COLS:], start=1):
            cell = cell.strip()
            if not cell:
                continue
            if ":" in cell:
                code_part, level_part = cell.rsplit(":", 1)
            else:
                code_part, level_part = cell, "willing"

            code_part  = code_part.strip().upper()
            level_part = level_part.strip().lower()

            col_label = f"subject_col_{col_i}"

            if code_part not in subj_map:
                err(col_label, f"subject '{code_part}' not found")
                continue

            if level_part not in _VALID_LEVELS:
                err(col_label, f"invalid preference level '{level_part}' — must be preferred, willing, or avoid")
                continue

            subject_links.append({
                "subject_id":      subj_map[code_part],
                "preference_rank": col_i,
                "preference_type": level_part,
            })

        errors.extend(row_errors)
        if not row_errors:
            validated.append({
                "name":                 name.strip(),
                "email":                email_raw or None,
                "department_id":        dept_id,
                "max_periods_per_week": max_periods,
                "subject_links":        subject_links,
            })

    # ── Bail out if any row had errors ──────────────────────────────────────
    raise_if_errors(errors)

    # ── All rows valid — commit atomically ──────────────────────────────────
    created_count = 0
    for data in validated:
        links = data.pop("subject_links")
        teacher = Teacher(**data)
        for link in links:
            teacher.subject_links.append(TeacherSubject(**link))
        db.add(teacher)
        created_count += 1

    await db.flush()
    return {"imported": created_count, "message": f"{created_count} teacher(s) imported successfully."}


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
        await db.flush()
        for link in payload.subject_links:
            teacher.subject_links.append(TeacherSubject(teacher_id=teacher.id, **link.model_dump()))

    if payload.unavailable_slots is not None:
        for slot in teacher.unavailable_slots:
            await db.delete(slot)
        teacher.unavailable_slots.clear()
        await db.flush()
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
    await db.flush()

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
