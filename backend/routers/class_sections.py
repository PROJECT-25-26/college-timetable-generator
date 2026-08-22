from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.orm import ClassSection, ClassSectionSubject, Room, Subject
from models.schemas import (
    ClassSectionCreate,
    ClassSectionOut,
    ClassSectionUpdate,
    MessageResponse,
)
from routers.csv_utils import CsvRowError, parse_csv_bytes, parse_int_field, raise_if_errors

router = APIRouter(prefix="/class-sections", tags=["Class Sections"])

_LOAD_OPTIONS = [
    selectinload(ClassSection.subject_links).selectinload(ClassSectionSubject.subject),
    selectinload(ClassSection.homeroom),
]

# ---------------------------------------------------------------------------
# CSV column positions (0-based) for fixed scalar fields
# ---------------------------------------------------------------------------
_COL_NAME     = 0
_COL_CODE     = 1
_COL_STRENGTH = 2
_COL_ROOM     = 3
_FIXED_COLS   = 4   # columns 4+ are subject[:periods_override] entries


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


@router.post(
    "/import-csv",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk-import class sections from a CSV file",
    tags=["Class Sections"],
)
@router.post(
    "/import-csv/",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk-import class sections from a CSV file",
    tags=["Class Sections"],
)
async def import_sections_csv(
    file: UploadFile = File(..., description="UTF-8 CSV file"),
    db: AsyncSession = Depends(get_db),
):
    """
    Import multiple class sections from a CSV file.

    **Expected columns (header row required):**
    ```
    name, code, strength, homeroom_code, <SUBJ_CODE>[:<periods_override>], ...
    ```
    * `name` and `code` are required; `strength` defaults to 60; `homeroom_code` is optional.
    * Subject columns (column 5 onward) use format `CODE` or `CODE:<override_int>`.
    * `periods_override` must be between 1 and 30 if provided.

    All rows are validated before any data is written.  On any error the
    endpoint returns HTTP 422 with a per-row error report and saves **nothing**.
    """
    content = await file.read()
    _header, rows = parse_csv_bytes(content)

    if not rows:
        return {"imported": 0, "message": "CSV has no data rows."}

    # ── Pre-load lookup maps ────────────────────────────────────────────────
    room_map: dict[str, str] = {}   # code → id
    for row in (await db.execute(select(Room.code, Room.id))).all():
        room_map[row.code.upper()] = row.id

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
        name = cells[_COL_NAME].strip() if len(cells) > _COL_NAME else ""
        if not name:
            err("name", "name is required")

        code = cells[_COL_CODE].strip().upper() if len(cells) > _COL_CODE else ""
        if not code:
            err("code", "code is required")

        strength_raw = cells[_COL_STRENGTH].strip() if len(cells) > _COL_STRENGTH else ""
        strength = parse_int_field(strength_raw) if strength_raw else 60
        if strength is None:
            err("strength", f"'{strength_raw}' is not a valid integer")
        elif strength < 1:
            err("strength", "strength must be ≥ 1")

        room_code = cells[_COL_ROOM].strip().upper() if len(cells) > _COL_ROOM else ""
        homeroom_id: str | None = None
        if room_code:
            if room_code not in room_map:
                err("homeroom_code", f"room '{room_code}' not found")
            else:
                homeroom_id = room_map[room_code]

        # -- Subject columns (variable, from index _FIXED_COLS onward) -------
        subject_links: list[dict] = []
        for col_i, cell in enumerate(cells[_FIXED_COLS:], start=1):
            cell = cell.strip()
            if not cell:
                continue

            col_label = f"subject_col_{col_i}"

            if ":" in cell:
                code_part, override_raw = cell.rsplit(":", 1)
                code_part   = code_part.strip().upper()
                override_raw = override_raw.strip()
                override = parse_int_field(override_raw)
                if override is None:
                    err(col_label, f"'{override_raw}' is not a valid integer for period override")
                    continue
                if not (1 <= override <= 30):
                    err(col_label, f"period override {override} is out of range (1–30)")
                    continue
            else:
                code_part = cell.upper()
                override  = None

            if code_part not in subj_map:
                err(col_label, f"subject '{code_part}' not found")
                continue

            subject_links.append({
                "subject_id":              subj_map[code_part],
                "weekly_periods_override": override,
            })

        errors.extend(row_errors)
        if not row_errors:
            validated.append({
                "name":        name,
                "code":        code,
                "strength":    strength,
                "homeroom_id": homeroom_id,
                "subject_links": subject_links,
            })

    # ── Bail out if any row had errors ──────────────────────────────────────
    raise_if_errors(errors)

    # ── All rows valid — commit atomically ──────────────────────────────────
    created_count = 0
    for data in validated:
        links = data.pop("subject_links")
        section = ClassSection(**data)
        for link in links:
            section.subject_links.append(ClassSectionSubject(**link))
        db.add(section)
        created_count += 1

    await db.flush()
    return {"imported": created_count, "message": f"{created_count} class section(s) imported successfully."}


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

    # Allow explicitly clearing homeroom by passing homeroom_id=null
    if "homeroom_id" in payload.model_fields_set and payload.homeroom_id is None:
        section.homeroom_id = None

    if payload.subject_links is not None:
        for link in section.subject_links:
            await db.delete(link)
        section.subject_links.clear()
        await db.flush()
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
