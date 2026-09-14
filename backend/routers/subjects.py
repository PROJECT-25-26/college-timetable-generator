from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.orm import Subject
from models.schemas import MessageResponse, SubjectCreate, SubjectOut, SubjectUpdate
from routers.csv_utils import CsvRowError, parse_csv_bytes, parse_int_field, raise_if_errors

router = APIRouter(prefix="/subjects", tags=["Subjects"])

# Boolean values accepted for the 'lab' field
_VALID_BOOL = {
    "true": True,  "1": True,  "yes": True,
    "false": False, "0": False, "no": False,
    # Natural language aliases (theory = not a lab, lab = is a lab)
    "lab": True, "theory": False,
}

# Column name aliases (all normalised to lowercase, stripped of spaces/underscores)
_NAME_ALIASES    = {"name"}
_CODE_ALIASES    = {"code"}
_PERIODS_ALIASES = {"weeklyperiods", "periods", "weeklyperiod"}
_LAB_ALIASES     = {"lab", "islab", "type", "subjecttype", "labsubject"}
_LAB_CONS_ALIASES = {"labconsecutiveperiods", "consecutiveperiods", "consecutive", "labconsecutive"}
_LAB_SESS_ALIASES = {"weeklylabsessions", "labsessions", "sessions"}
_REQUIRED_LAB_TYPE_ALIASES = {"requiredlabtype", "labtype", "labcategory", "requiredlabcategory"}


def _normalise_header(h: str) -> str:
    """Lowercase, strip spaces and underscores for flexible matching."""
    return h.lower().replace(" ", "").replace("_", "")


def _parse_bool(value: str) -> bool | None:
    return _VALID_BOOL.get(value.strip().lower())


@router.get("", response_model=list[SubjectOut])
@router.get("/", response_model=list[SubjectOut])
async def list_subjects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subject).order_by(Subject.name))
    return result.scalars().all()


@router.post("", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
async def create_subject(payload: SubjectCreate, db: AsyncSession = Depends(get_db)):
    subject = Subject(**payload.model_dump())
    db.add(subject)
    await db.flush()
    await db.refresh(subject)
    return subject


@router.post(
    "/import-csv",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk-import subjects from a CSV file",
    tags=["Subjects"],
)
@router.post("/import-csv/", status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def import_subjects_csv(
    file: UploadFile = File(..., description="UTF-8 CSV file"),
    db: AsyncSession = Depends(get_db),
):
    """
    Import multiple subjects from a CSV file.

    **Header row is required.** Columns are matched by name (order does not matter).

    **Required columns:**  ``name``, ``code``

    **Optional columns:** ``weekly_periods``, ``lab``, ``lab_consecutive_periods``, ``weekly_lab_sessions``, ``required_lab_type``
    """
    content = await file.read()
    header, rows = parse_csv_bytes(content)

    if not rows:
        return {"imported": 0, "message": "CSV has no data rows."}

    # ── Map header names to column indices ──────────────────────────────────
    norm = [_normalise_header(h) for h in header]

    def col(aliases: set[str]) -> int | None:
        for i, h in enumerate(norm):
            if h in aliases:
                return i
        return None

    col_name     = col(_NAME_ALIASES)
    col_code     = col(_CODE_ALIASES)
    col_periods  = col(_PERIODS_ALIASES)
    col_lab      = col(_LAB_ALIASES)
    col_cons     = col(_LAB_CONS_ALIASES)
    col_sess     = col(_LAB_SESS_ALIASES)
    col_lab_type = col(_REQUIRED_LAB_TYPE_ALIASES)

    if col_name is None:
        raise HTTPException(status_code=400, detail="CSV is missing a 'name' column.")
    if col_code is None:
        raise HTTPException(status_code=400, detail="CSV is missing a 'code' column.")

    # ── Pre-load existing codes ──────────────────────────────────────────────
    existing_codes: set[str] = set(
        (await db.execute(select(Subject.code))).scalars().all()
    )

    errors: list[CsvRowError] = []
    validated: list[dict] = []
    seen_codes: set[str] = set()

    def get_cell(cells: list[str], idx: int | None) -> str:
        if idx is None or idx >= len(cells):
            return ""
        return cells[idx].strip()

    for row_idx, cells in enumerate(rows, start=1):
        row_errors: list[CsvRowError] = []

        def err(field: str, msg: str) -> None:
            row_errors.append(CsvRowError(row=row_idx, field=field, message=msg))

        # name
        name = get_cell(cells, col_name)
        if not name:
            err("name", "name is required")

        # code
        code = get_cell(cells, col_code).upper()
        if not code:
            err("code", "code is required")
        elif len(code) > 20:
            err("code", f"code '{code}' exceeds 20 characters")
        elif code in existing_codes:
            err("code", f"subject with code '{code}' already exists")
        elif code in seen_codes:
            err("code", f"duplicate code '{code}' in this file")
        else:
            seen_codes.add(code)

        # lab flag
        lab_raw = get_cell(cells, col_lab)
        lab = _parse_bool(lab_raw) if lab_raw else False
        if lab_raw and lab is None:
            err("lab", f"'{lab_raw}' is not recognised as a valid boolean")
            lab = False

        # weekly_periods (for non-lab)
        wp_raw = get_cell(cells, col_periods)
        weekly_periods = parse_int_field(wp_raw) if wp_raw else 3
        if not lab:
            if weekly_periods is None or not (1 <= weekly_periods <= 30):
                err("weekly_periods", "weekly_periods must be an integer between 1 and 30")
                weekly_periods = 3

        # lab-specific fields
        lab_consecutive: int | None = None
        weekly_lab_sessions_val: int | None = None
        req_lab_type: str | None = None

        if lab:
            lc_raw = get_cell(cells, col_cons)
            lab_consecutive = parse_int_field(lc_raw) if lc_raw else None
            if lab_consecutive is None:
                err("lab_consecutive_periods",
                    "lab_consecutive_periods is required for lab subjects and must be an integer")
            elif not (1 <= lab_consecutive <= 10):
                err("lab_consecutive_periods",
                    f"lab_consecutive_periods {lab_consecutive} out of range (1-10)")

            ls_raw = get_cell(cells, col_sess)
            weekly_lab_sessions_val = parse_int_field(ls_raw) if ls_raw else None
            if weekly_lab_sessions_val is None:
                err("weekly_lab_sessions",
                    "weekly_lab_sessions is required for lab subjects and must be an integer")
            elif not (1 <= weekly_lab_sessions_val <= 30):
                err("weekly_lab_sessions",
                    f"weekly_lab_sessions {weekly_lab_sessions_val} out of range (1-30)")

            req_lt_raw = get_cell(cells, col_lab_type)
            req_lab_type = (req_lt_raw.lower() or None) if req_lt_raw else None

            # Auto-compute weekly_periods
            if lab_consecutive and weekly_lab_sessions_val:
                weekly_periods = lab_consecutive * weekly_lab_sessions_val

            if not row_errors and not (1 <= weekly_periods <= 60):
                err("weekly_periods", f"computed weekly_periods {weekly_periods} out of range (1-60)")

        errors.extend(row_errors)
        if not row_errors:
            validated.append({
                "name": name,
                "code": code,
                "weekly_periods": weekly_periods,
                "lab": lab,
                "lab_consecutive_periods": lab_consecutive,
                "weekly_lab_sessions": weekly_lab_sessions_val,
                "required_lab_type": req_lab_type,
            })

    raise_if_errors(errors)

    for data in validated:
        db.add(Subject(**data))
    await db.flush()

    return {"imported": len(validated), "message": f"{len(validated)} subject(s) imported successfully."}


@router.get("/{subject_id}", response_model=SubjectOut)
@router.get("/{subject_id}/", response_model=SubjectOut)
async def get_subject(subject_id: str, db: AsyncSession = Depends(get_db)):
    subject = await db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject


@router.patch("/{subject_id}", response_model=SubjectOut)
@router.patch("/{subject_id}/", response_model=SubjectOut)
async def update_subject(
    subject_id: str, payload: SubjectUpdate, db: AsyncSession = Depends(get_db)
):
    subject = await db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(subject, field, value)
    await db.flush()
    await db.refresh(subject)
    return subject


@router.delete("/{subject_id}", response_model=MessageResponse)
@router.delete("/{subject_id}/", response_model=MessageResponse)
async def delete_subject(subject_id: str, db: AsyncSession = Depends(get_db)):
    subject = await db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    await db.delete(subject)
    await db.flush()
    return {"message": f"Subject '{subject.name}' deleted"}
