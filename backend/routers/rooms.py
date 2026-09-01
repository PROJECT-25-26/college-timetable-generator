from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.orm import Room
from models.schemas import MessageResponse, RoomCreate, RoomOut, RoomUpdate
from routers.csv_utils import CsvRowError, parse_csv_bytes, parse_int_field, raise_if_errors

router = APIRouter(prefix="/rooms", tags=["Rooms"])

_VALID_ROOM_TYPES = {"classroom", "lab", "seminar"}


@router.get("", response_model=list[RoomOut])
@router.get("/", response_model=list[RoomOut])
async def list_rooms(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Room).order_by(Room.name))
    return result.scalars().all()


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(payload: RoomCreate, db: AsyncSession = Depends(get_db)):
    room = Room(**payload.model_dump())
    db.add(room)
    await db.flush()
    await db.refresh(room)
    return room


@router.post(
    "/import-csv",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk-import rooms from a CSV file",
    tags=["Rooms"],
)
@router.post("/import-csv/", status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def import_rooms_csv(
    file: UploadFile = File(..., description="UTF-8 CSV file"),
    db: AsyncSession = Depends(get_db),
):
    """
    Import multiple rooms from a CSV file.

    **Expected columns (header row required):**
    ```
    name, code, room_type, capacity
    ```
    * `name` and `code` are required.
    * `room_type` must be one of: `classroom`, `lab`, `seminar`. Defaults to **classroom**.
    * `capacity` must be a positive integer. Defaults to **60**.
    * All rows validated before any data is saved (all-or-nothing).
    """
    content = await file.read()
    _header, rows = parse_csv_bytes(content)

    if not rows:
        return {"imported": 0, "message": "CSV has no data rows."}

    existing_codes: set[str] = set(
        (await db.execute(select(Room.code))).scalars().all()
    )

    errors: list[CsvRowError] = []
    validated: list[dict] = []
    seen_codes: set[str] = set()

    for row_idx, cells in enumerate(rows, start=1):
        row_errors: list[CsvRowError] = []

        def err(field: str, msg: str) -> None:
            row_errors.append(CsvRowError(row=row_idx, field=field, message=msg))

        def cell(i: int) -> str:
            return cells[i].strip() if len(cells) > i else ""

        name = cell(0)
        if not name:
            err("name", "name is required")

        code = cell(1).upper()
        if not code:
            err("code", "code is required")
        elif len(code) > 20:
            err("code", f"code '{code}' exceeds 20 characters")
        elif code in existing_codes:
            err("code", f"room with code '{code}' already exists")
        elif code in seen_codes:
            err("code", f"duplicate code '{code}' in this file")
        else:
            seen_codes.add(code)

        # room_type
        rt_raw = cell(2).lower()
        room_type = rt_raw if rt_raw in _VALID_ROOM_TYPES else "classroom"
        if rt_raw and rt_raw not in _VALID_ROOM_TYPES:
            err("room_type", f"'{rt_raw}' is not valid — must be classroom, lab, or seminar")

        # capacity
        cap_raw = cell(3)
        capacity = parse_int_field(cap_raw) if cap_raw else 60
        if capacity is None:
            err("capacity", f"'{cap_raw}' is not a valid integer")
            capacity = 60
        elif capacity < 1:
            err("capacity", "capacity must be at least 1")

        errors.extend(row_errors)
        if not row_errors:
            validated.append({
                "name": name,
                "code": code,
                "room_type": room_type,
                "capacity": capacity,
            })

    raise_if_errors(errors)

    for data in validated:
        db.add(Room(**data))
    await db.flush()

    return {"imported": len(validated), "message": f"{len(validated)} room(s) imported successfully."}


@router.get("/{room_id}", response_model=RoomOut)
@router.get("/{room_id}/", response_model=RoomOut)
async def get_room(room_id: str, db: AsyncSession = Depends(get_db)):
    room = await db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


@router.patch("/{room_id}", response_model=RoomOut)
@router.patch("/{room_id}/", response_model=RoomOut)
async def update_room(room_id: str, payload: RoomUpdate, db: AsyncSession = Depends(get_db)):
    room = await db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(room, field, value)
    await db.flush()
    await db.refresh(room)
    return room


@router.delete("/{room_id}", response_model=MessageResponse)
@router.delete("/{room_id}/", response_model=MessageResponse)
async def delete_room(room_id: str, db: AsyncSession = Depends(get_db)):
    room = await db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    await db.delete(room)
    await db.flush()
    return {"message": f"Room '{room.name}' deleted"}
