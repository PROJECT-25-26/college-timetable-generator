"""
Campus Layout router — Campus / Building / Floor CRUD + grid paint save.

Endpoints (all under /api/v1):
  Campuses ──────────────────────────────────────────────────────────
    GET    /campuses                      list all campuses
    POST   /campuses                      create a campus
    GET    /campuses/{campus_id}          get campus (with nested buildings + floors)
    PATCH  /campuses/{campus_id}          rename / update campus
    DELETE /campuses/{campus_id}          delete campus (cascades buildings, floors)
    GET    /campuses/{campus_id}/buildings  list buildings in a campus

  Buildings ─────────────────────────────────────────────────────────
    POST   /buildings                     create a building
    GET    /buildings/{building_id}       get building (with nested floors)
    PATCH  /buildings/{building_id}       update building (name, position, color…)
    DELETE /buildings/{building_id}       delete building (cascades floors)
    GET    /buildings/{building_id}/floors  list floors in a building

  Floors ────────────────────────────────────────────────────────────
    POST   /floors                        create a floor
    GET    /floors/{floor_id}             get floor (grid_data deserialized)
    PATCH  /floors/{floor_id}             update floor metadata
    PUT    /floors/{floor_id}/grid        save the full painted grid (2-D array)
    DELETE /floors/{floor_id}             delete a floor
"""

import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.orm import Building, Campus, Floor
from models.schemas import (
    BuildingCreate,
    BuildingOut,
    BuildingUpdate,
    CampusCreate,
    CampusOut,
    CampusUpdate,
    FloorCreate,
    FloorGridUpdate,
    FloorOut,
    FloorUpdate,
    MessageResponse,
)

router = APIRouter(tags=["Campus Layout"])

_VALID_CELL_TYPES = {"empty", "wall", "corridor", "stairs", "entrance"}


# ===========================================================================
# Helper: deserialize grid_data JSON → list[list[str]] | None
# ===========================================================================
def _parse_grid(floor: Floor) -> list[list[str]] | None:
    if floor.grid_data is None:
        return None
    try:
        return json.loads(floor.grid_data)
    except (json.JSONDecodeError, ValueError):
        return None


def _floor_to_out(floor: Floor) -> dict:
    """Convert Floor ORM row to a dict suitable for FloorOut, with grid parsed."""
    d = {c.key: getattr(floor, c.key) for c in floor.__table__.columns}
    d["grid_data"] = _parse_grid(floor)
    return d


# ===========================================================================
# Campus CRUD
# ===========================================================================

@router.get("/campuses", response_model=list[CampusOut])
@router.get("/campuses/", response_model=list[CampusOut], include_in_schema=False)
async def list_campuses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Campus).order_by(Campus.name))
    return result.scalars().all()


@router.post("/campuses", response_model=CampusOut, status_code=status.HTTP_201_CREATED)
@router.post("/campuses/", response_model=CampusOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_campus(payload: CampusCreate, db: AsyncSession = Depends(get_db)):
    campus = Campus(**payload.model_dump())
    db.add(campus)
    await db.flush()
    await db.refresh(campus)
    return campus


@router.get("/campuses/{campus_id}", response_model=CampusOut)
@router.get("/campuses/{campus_id}/", response_model=CampusOut, include_in_schema=False)
async def get_campus(campus_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Campus)
        .where(Campus.id == campus_id)
        .options(
            selectinload(Campus.buildings).selectinload(Building.floors)
        )
    )
    campus = result.scalar_one_or_none()
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    return campus


@router.patch("/campuses/{campus_id}", response_model=CampusOut)
@router.patch("/campuses/{campus_id}/", response_model=CampusOut, include_in_schema=False)
async def update_campus(campus_id: str, payload: CampusUpdate, db: AsyncSession = Depends(get_db)):
    campus = await db.get(Campus, campus_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(campus, field, value)
    await db.flush()
    await db.refresh(campus)
    return campus


@router.delete("/campuses/{campus_id}", response_model=MessageResponse)
@router.delete("/campuses/{campus_id}/", response_model=MessageResponse, include_in_schema=False)
async def delete_campus(campus_id: str, db: AsyncSession = Depends(get_db)):
    campus = await db.get(Campus, campus_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    await db.delete(campus)
    await db.flush()
    return {"message": f"Campus '{campus.name}' deleted"}


@router.get("/campuses/{campus_id}/buildings", response_model=list[BuildingOut])
@router.get("/campuses/{campus_id}/buildings/", response_model=list[BuildingOut], include_in_schema=False)
async def list_campus_buildings(campus_id: str, db: AsyncSession = Depends(get_db)):
    campus = await db.get(Campus, campus_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    result = await db.execute(
        select(Building)
        .where(Building.campus_id == campus_id)
        .options(selectinload(Building.floors))
        .order_by(Building.name)
    )
    return result.scalars().all()


# ===========================================================================
# Building CRUD
# ===========================================================================

@router.post("/buildings", response_model=BuildingOut, status_code=status.HTTP_201_CREATED)
@router.post("/buildings/", response_model=BuildingOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_building(payload: BuildingCreate, db: AsyncSession = Depends(get_db)):
    # Verify campus exists
    campus = await db.get(Campus, payload.campus_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    building = Building(**payload.model_dump())
    db.add(building)
    await db.flush()
    # Reload with floors relation
    result = await db.execute(
        select(Building)
        .where(Building.id == building.id)
        .options(selectinload(Building.floors))
    )
    return result.scalar_one()


@router.get("/buildings/{building_id}", response_model=BuildingOut)
@router.get("/buildings/{building_id}/", response_model=BuildingOut, include_in_schema=False)
async def get_building(building_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Building)
        .where(Building.id == building_id)
        .options(selectinload(Building.floors))
    )
    building = result.scalar_one_or_none()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building


@router.patch("/buildings/{building_id}", response_model=BuildingOut)
@router.patch("/buildings/{building_id}/", response_model=BuildingOut, include_in_schema=False)
async def update_building(building_id: str, payload: BuildingUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Building)
        .where(Building.id == building_id)
        .options(selectinload(Building.floors))
    )
    building = result.scalar_one_or_none()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(building, field, value)
    await db.flush()
    # Reload with floors relationship to ensure nested floors are included in response
    result = await db.execute(
        select(Building)
        .where(Building.id == building_id)
        .options(selectinload(Building.floors))
    )
    return result.scalar_one()


@router.delete("/buildings/{building_id}", response_model=MessageResponse)
@router.delete("/buildings/{building_id}/", response_model=MessageResponse, include_in_schema=False)
async def delete_building(building_id: str, db: AsyncSession = Depends(get_db)):
    building = await db.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    await db.delete(building)
    await db.flush()
    return {"message": f"Building '{building.name}' deleted"}


@router.get("/buildings/{building_id}/floors", response_model=list[FloorOut])
@router.get("/buildings/{building_id}/floors/", response_model=list[FloorOut], include_in_schema=False)
async def list_building_floors(building_id: str, db: AsyncSession = Depends(get_db)):
    building = await db.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    result = await db.execute(
        select(Floor)
        .where(Floor.building_id == building_id)
        .order_by(Floor.level)
    )
    floors = result.scalars().all()
    return [_floor_to_out(f) for f in floors]


# ===========================================================================
# Floor CRUD
# ===========================================================================

@router.post("/floors", response_model=FloorOut, status_code=status.HTTP_201_CREATED)
@router.post("/floors/", response_model=FloorOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_floor(payload: FloorCreate, db: AsyncSession = Depends(get_db)):
    # Verify building exists
    building = await db.get(Building, payload.building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    floor = Floor(**payload.model_dump())
    db.add(floor)
    await db.flush()
    await db.refresh(floor)
    return _floor_to_out(floor)


@router.get("/floors/{floor_id}", response_model=FloorOut)
@router.get("/floors/{floor_id}/", response_model=FloorOut, include_in_schema=False)
async def get_floor(floor_id: str, db: AsyncSession = Depends(get_db)):
    floor = await db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    return _floor_to_out(floor)


@router.patch("/floors/{floor_id}", response_model=FloorOut)
@router.patch("/floors/{floor_id}/", response_model=FloorOut, include_in_schema=False)
async def update_floor(floor_id: str, payload: FloorUpdate, db: AsyncSession = Depends(get_db)):
    floor = await db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(floor, field, value)
    await db.flush()
    await db.refresh(floor)
    return _floor_to_out(floor)


@router.put("/floors/{floor_id}/grid", response_model=FloorOut)
@router.put("/floors/{floor_id}/grid/", response_model=FloorOut, include_in_schema=False)
async def save_floor_grid(floor_id: str, payload: FloorGridUpdate, db: AsyncSession = Depends(get_db)):
    """
    Replace the entire painted grid for a floor.

    Validates:
    - grid dimensions must match floor.grid_rows × floor.grid_cols
    - all cell values must be valid CellType strings
    """
    floor = await db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    grid = payload.grid_data
    # Dimension check
    if len(grid) != floor.grid_rows:
        raise HTTPException(
            status_code=422,
            detail=f"grid_data has {len(grid)} rows but floor has {floor.grid_rows}",
        )
    for r_idx, row in enumerate(grid):
        if len(row) != floor.grid_cols:
            raise HTTPException(
                status_code=422,
                detail=f"grid_data row {r_idx} has {len(row)} cols but floor has {floor.grid_cols}",
            )
        invalid = [c for c in row if c not in _VALID_CELL_TYPES]
        if invalid:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid cell value(s) in row {r_idx}: {invalid}. "
                       f"Allowed: {sorted(_VALID_CELL_TYPES)}",
            )

    floor.grid_data = json.dumps(grid, separators=(",", ":"))
    await db.flush()
    await db.refresh(floor)
    return _floor_to_out(floor)


@router.delete("/floors/{floor_id}", response_model=MessageResponse)
@router.delete("/floors/{floor_id}/", response_model=MessageResponse, include_in_schema=False)
async def delete_floor(floor_id: str, db: AsyncSession = Depends(get_db)):
    floor = await db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    await db.delete(floor)
    await db.flush()
    return {"message": f"Floor '{floor.name}' deleted"}
