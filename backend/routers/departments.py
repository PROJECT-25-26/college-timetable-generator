from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.orm import Department
from models.schemas import DepartmentCreate, DepartmentOut, DepartmentUpdate, MessageResponse

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
