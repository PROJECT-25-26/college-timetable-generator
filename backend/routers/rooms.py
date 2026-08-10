from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.orm import Room
from models.schemas import MessageResponse, RoomCreate, RoomOut, RoomUpdate

router = APIRouter(prefix="/rooms", tags=["Rooms"])


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
