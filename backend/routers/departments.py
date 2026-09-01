from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.orm import Department
from models.schemas import DepartmentCreate, DepartmentOut, DepartmentUpdate, MessageResponse

from routers.csv_utils import CsvRowError, parse_csv_bytes, raise_if_errors

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
        db.add(Department(**data))
    await db.flush()

    return {"imported": len(validated), "message": f"{len(validated)} department(s) imported successfully."}


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
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(dept, field, value)
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
