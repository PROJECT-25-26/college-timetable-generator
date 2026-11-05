from datetime import datetime
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.orm import Department, StaffRoom
from models.schemas import DepartmentCreate, DepartmentOut, DepartmentUpdate, MessageResponse, StaffRoomOut

from routers.csv_utils import CsvRowError, parse_csv_bytes, raise_if_errors
from routers.location_utils import get_locations_for_records

router = APIRouter(prefix="/departments", tags=["Departments"])


@router.get("", response_model=list[DepartmentOut])
@router.get("/", response_model=list[DepartmentOut])
async def list_departments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).order_by(Department.name))
    return result.scalars().all()


@router.post("", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
async def create_department(payload: DepartmentCreate, db: AsyncSession = Depends(get_db)):
    dept = Department(**payload.model_dump())
    db.add(dept)
    await db.flush()
    sr = StaffRoom(department_id=dept.id, label=f"{dept.name} Staff Room")
    db.add(sr)
    await db.flush()
    await db.refresh(dept)
    return dept


@router.post(
    "/import-csv",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk-import departments from a CSV file",
    tags=["Departments"],
)
@router.post("/import-csv/", status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def import_departments_csv(
    file: UploadFile = File(..., description="UTF-8 CSV file"),
    db: AsyncSession = Depends(get_db),
):
    """
    Import multiple departments from a CSV file.

    **Expected columns (header row required):**
    ```
    name, code
    ```
    * Both `name` and `code` are required.
    * `code` is automatically uppercased.
    * All rows are validated before any data is written.  On any error the
      endpoint returns HTTP 422 with a per-row error report and saves **nothing**.
    """
    content = await file.read()
    _header, rows = parse_csv_bytes(content)

    if not rows:
        return {"imported": 0, "message": "CSV has no data rows."}

    # Pre-load existing codes to detect duplicates within the file and DB
    existing_codes: set[str] = set(
        (await db.execute(select(Department.code))).scalars().all()
    )

    errors: list[CsvRowError] = []
    validated: list[dict] = []
    seen_codes: set[str] = set()

    for row_idx, cells in enumerate(rows, start=1):
        row_errors: list[CsvRowError] = []

        def err(field: str, msg: str) -> None:
            row_errors.append(CsvRowError(row=row_idx, field=field, message=msg))

        name = cells[0].strip() if len(cells) > 0 else ""
        if not name:
            err("name", "name is required")

        code = cells[1].strip().upper() if len(cells) > 1 else ""
        if not code:
            err("code", "code is required")
        elif len(code) > 20:
            err("code", f"code '{code}' exceeds 20 characters")
        elif code in existing_codes:
            err("code", f"department with code '{code}' already exists")
        elif code in seen_codes:
            err("code", f"duplicate code '{code}' in this file")
        else:
            seen_codes.add(code)

        errors.extend(row_errors)
        if not row_errors:
            validated.append({"name": name, "code": code})

    raise_if_errors(errors)

    for data in validated:
        dept = Department(**data)
        db.add(dept)
        await db.flush()
        sr = StaffRoom(department_id=dept.id, label=f"{dept.name} Staff Room")
        db.add(sr)
    await db.flush()

    return {"imported": len(validated), "message": f"{len(validated)} department(s) imported successfully."}


# ===========================================================================
# StaffRoom read-only endpoints
# (StaffRoom belongs to departments; defined before /{dept_id} to avoid route collision)
# ===========================================================================

def _staffroom_to_out(sr: StaffRoom, locations: dict[str, dict]) -> StaffRoomOut:
    return StaffRoomOut(
        id=sr.id,
        department_id=sr.department_id,
        label=sr.label,
        department_name=sr.department.name if sr.department else None,
        department_code=sr.department.code if sr.department else None,
        created_at=sr.created_at or datetime.now(),
        location=locations.get(sr.id),
    )


@router.get("/staffrooms", response_model=list[StaffRoomOut], tags=["StaffRooms"])
@router.get("/staffrooms/", response_model=list[StaffRoomOut], include_in_schema=False)
async def list_staffrooms(db: AsyncSession = Depends(get_db)):
    """List all StaffRoom records (one per department). Auto-creates missing records for existing departments."""
    dept_res = await db.execute(select(Department))
    departments = dept_res.scalars().all()

    sr_res = await db.execute(select(StaffRoom))
    existing_sr_dept_ids = {sr.department_id for sr in sr_res.scalars().all()}

    new_created = False
    for dept in departments:
        if dept.id not in existing_sr_dept_ids:
            sr = StaffRoom(department_id=dept.id, label=f"{dept.name} Staff Room")
            db.add(sr)
            new_created = True

    if new_created:
        await db.flush()

    result = await db.execute(
        select(StaffRoom)
        .options(selectinload(StaffRoom.department))
        .order_by(StaffRoom.label)
    )
    srs = result.scalars().all()
    locations = await get_locations_for_records(db)
    return [_staffroom_to_out(sr, locations) for sr in srs]


@router.get("/staffrooms/{staffroom_id}", response_model=StaffRoomOut, tags=["StaffRooms"])
@router.get("/staffrooms/{staffroom_id}/", response_model=StaffRoomOut, include_in_schema=False)
async def get_staffroom(staffroom_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single StaffRoom by ID."""
    result = await db.execute(
        select(StaffRoom)
        .where(StaffRoom.id == staffroom_id)
        .options(selectinload(StaffRoom.department))
    )
    sr = result.scalar_one_or_none()
    if not sr:
        raise HTTPException(status_code=404, detail="StaffRoom not found")
    locations = await get_locations_for_records(db)
    return _staffroom_to_out(sr, locations)


# ===========================================================================
# Department parameterized endpoints
# ===========================================================================

@router.get("/{dept_id}", response_model=DepartmentOut)
@router.get("/{dept_id}/", response_model=DepartmentOut)
async def get_department(dept_id: str, db: AsyncSession = Depends(get_db)):
    dept = await db.get(Department, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept


@router.patch("/{dept_id}", response_model=DepartmentOut)
@router.patch("/{dept_id}/", response_model=DepartmentOut)
async def update_department(
    dept_id: str, payload: DepartmentUpdate, db: AsyncSession = Depends(get_db)
):
    dept = await db.get(Department, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    updates = payload.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(dept, field, value)
    if "name" in updates:
        sr_res = await db.execute(select(StaffRoom).where(StaffRoom.department_id == dept_id))
        sr = sr_res.scalar_one_or_none()
        if sr:
            sr.label = f"{dept.name} Staff Room"
    await db.flush()
    await db.refresh(dept)
    return dept


@router.delete("/{dept_id}", response_model=MessageResponse)
@router.delete("/{dept_id}/", response_model=MessageResponse)
async def delete_department(dept_id: str, db: AsyncSession = Depends(get_db)):
    dept = await db.get(Department, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    await db.delete(dept)
    await db.flush()
    return {"message": f"Department '{dept.name}' deleted"}
