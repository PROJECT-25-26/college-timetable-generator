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
from models.orm import (
    Building, Campus, EntrancePairDistance, Floor, InterBuildingDistance,
    Teacher, StaffRoom, Timetable, TimetableSlot, Room, Subject, ClassSection, Department,
)
from models.schemas import (
    BuildingCreate,
    BuildingOut,
    BuildingUpdate,
    BuildingRoomDistances,
    CampusCreate,
    CampusOut,
    CampusUpdate,
    CampusDistanceMatricesResponse,
    EntrancePairEntry,
    EntrancePairOut,
    EntrancePairsUpdate,
    FloorCreate,
    FloorGridUpdate,
    FloorOut,
    FloorRoomDistances,
    FloorUpdate,
    GateInfo,
    InterBuildingDistanceEntry,
    InterBuildingDistanceOut,
    InterBuildingDistancesUpdate,
    MessageResponse,
    RoomDistanceEntry,
    StairConnectionEntry,
    StairConnectionsUpdate,
    MappedRoomItem,
    RoomDistanceQueryResponse,
)
from solver.floor_graph import (
    compute_room_distances,
    compute_building_distances,
    compute_campus_distances,
    EntrancePairDistanceData,
    FloorData,
    StairConnection,
    InterBuildingDistanceData,
    GLOBAL_FLOOR_CACHE,
    GLOBAL_CAMPUS_MATRIX_CACHE,
)

router = APIRouter(tags=["Campus Layout"])


# "door" = room/staffroom door (new); "gate" = building gate (new); "entrance" = legacy alias for gate
_VALID_CELL_TYPES = {"empty", "wall", "corridor", "stairs", "door", "gate", "entrance", "room", "staffroom"}


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
    """Convert Floor ORM row to a dict suitable for FloorOut, with grid and room_links parsed."""
    d = {c.key: getattr(floor, c.key) for c in floor.__table__.columns}
    d["grid_data"] = _parse_grid(floor)
    # Parse room_links
    if floor.room_links is None:
        d["room_links"] = None
    else:
        try:
            d["room_links"] = json.loads(floor.room_links)
        except (json.JSONDecodeError, ValueError):
            d["room_links"] = None
    # Parse stair_connections
    if floor.stair_connections is None:
        d["stair_connections"] = None
    else:
        try:
            d["stair_connections"] = json.loads(floor.stair_connections)
        except (json.JSONDecodeError, ValueError):
            d["stair_connections"] = None
    # Parse gate_labels
    if floor.gate_labels is None:
        d["gate_labels"] = None
    else:
        try:
            d["gate_labels"] = json.loads(floor.gate_labels)
        except (json.JSONDecodeError, ValueError):
            d["gate_labels"] = None
    return d


async def recompute_campus_matrices(db: AsyncSession, campus_id: str | None = None) -> dict:
    """
    Query all floors, stair connections, inter-building distances, entrance-pair distances,
    and building positions for a campus (or all campuses), run compute_campus_distances
    (reusing cached per-floor BFS), and cache the precomputed distance matrices.
    """
    stmt = select(Floor).options(selectinload(Floor.building)).where(Floor.grid_data.isnot(None))
    if campus_id:
        stmt = stmt.join(Floor.building).where(Building.campus_id == campus_id)
    floor_rows = (await db.execute(stmt)).scalars().all()

    floors_data: list[FloorData] = []
    stair_connections_list: list[StairConnection] = []
    seen_sc_pairs: set = set()

    for fl in floor_rows:
        grid = _parse_grid(fl) or []
        links = []
        if fl.room_links:
            try:
                links = json.loads(fl.room_links)
            except Exception:
                links = []

        raw_sc = []
        if fl.stair_connections:
            try:
                raw_sc = json.loads(fl.stair_connections)
            except Exception:
                raw_sc = []

        stair_cells: list[dict] = []
        for sc_entry in raw_sc:
            sid = sc_entry.get("stair_id", "")
            cells = sc_entry.get("cells", [])
            other_fid = sc_entry.get("connected_floor_id", "")
            cost = sc_entry.get("crossing_cost")
            if not sid:
                continue
            stair_cells.append({"stair_id": sid, "cells": cells})
            if other_fid:
                pair_key = (sid, frozenset([fl.id, other_fid]))
                if pair_key not in seen_sc_pairs:
                    seen_sc_pairs.add(pair_key)
                    stair_connections_list.append(
                        StairConnection(
                            stair_id=sid,
                            floor_a_id=fl.id,
                            floor_b_id=other_fid,
                            crossing_cost=cost,
                        )
                    )

        # Parse gate_labels: {"row,col": "label"} → [{row, col, label}]
        raw_gl: dict = {}
        if fl.gate_labels:
            try:
                raw_gl = json.loads(fl.gate_labels)
            except Exception:
                raw_gl = {}
        gate_cells: list[dict] = []
        for key, lbl in raw_gl.items():
            try:
                r_str, c_str = key.split(",", 1)
                gate_cells.append({"row": int(r_str), "col": int(c_str), "label": lbl})
            except (ValueError, AttributeError):
                pass

        floors_data.append(FloorData(
            floor_id=fl.id,
            building_id=fl.building_id,
            level=fl.level,
            cell_size_m=fl.cell_size_m,
            grid_data=grid,
            room_links=links,
            stair_cells=stair_cells,
            gate_cells=gate_cells,
        ))

    ibd_stmt = select(InterBuildingDistance)
    if campus_id:
        ibd_stmt = ibd_stmt.where(InterBuildingDistance.campus_id == campus_id)
    ibd_rows = (await db.execute(ibd_stmt)).scalars().all()

    ibd_data_list = [
        InterBuildingDistanceData(
            building_a_id=r.building_a_id,
            building_b_id=r.building_b_id,
            distance_cells=r.distance_cells,
            distance_m=r.distance_m,
        )
        for r in ibd_rows
    ]

    # Load per-gate-pair entrance distances
    epd_stmt = select(EntrancePairDistance)
    if campus_id:
        epd_stmt = epd_stmt.where(EntrancePairDistance.campus_id == campus_id)
    epd_rows = (await db.execute(epd_stmt)).scalars().all()

    epd_data_list = [
        EntrancePairDistanceData(
            floor_a_id=r.floor_a_id,
            gate_a_pos=(r.gate_a_row, r.gate_a_col),
            gate_a_label=r.gate_a_label,
            floor_b_id=r.floor_b_id,
            gate_b_pos=(r.gate_b_row, r.gate_b_col),
            gate_b_label=r.gate_b_label,
            distance_cells=r.distance_cells,
            distance_m=r.distance_m,
        )
        for r in epd_rows
    ]

    b_stmt = select(Building)
    if campus_id:
        b_stmt = b_stmt.where(Building.campus_id == campus_id)
    b_rows = (await db.execute(b_stmt)).scalars().all()
    building_positions = {b.id: (b.pos_x, b.pos_y) for b in b_rows}

    result = compute_campus_distances(
        floors=floors_data,
        stair_connections=stair_connections_list,
        inter_building_distances=ibd_data_list,
        entrance_pair_distances=epd_data_list,
        building_positions=building_positions,
    )
    return result



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
    # Persist room_links if provided; leave existing if not sent
    if payload.room_links is not None:
        floor.room_links = json.dumps(payload.room_links, separators=(",", ":"))
    # Persist stair_connections if provided; leave existing if not sent
    if payload.stair_connections is not None:
        floor.stair_connections = json.dumps(payload.stair_connections, separators=(",", ":"))
    # Persist gate_labels if provided; leave existing if not sent
    if payload.gate_labels is not None:
        floor.gate_labels = json.dumps(payload.gate_labels, separators=(",", ":"))
    await db.flush()
    await db.refresh(floor)

    # Invalidate per-floor BFS cache & campus matrix cache, then precompute full matrices
    GLOBAL_FLOOR_CACHE.invalidate(floor_id)
    GLOBAL_CAMPUS_MATRIX_CACHE.invalidate()
    bld = await db.get(Building, floor.building_id)
    if bld:
        await recompute_campus_matrices(db, bld.campus_id)

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


@router.get("/floors/{floor_id}/room-distances", response_model=FloorRoomDistances)
@router.get("/floors/{floor_id}/room-distances/", response_model=FloorRoomDistances, include_in_schema=False)
async def get_floor_room_distances(floor_id: str, db: AsyncSession = Depends(get_db)):
    """
    Compute BFS shortest-path distances (in cells and metres) between every
    pair of rooms/staffrooms linked on this floor's painted grid.

    Returns an empty ``distances`` list when:
    - The floor has no saved grid yet.
    - The floor has no room-link blobs.
    - Fewer than two blobs carry a ``record_id``.

    Walkability rule: only ``corridor``, ``room``, ``staffroom``, ``stairs``,
    and ``entrance`` cells are traversable. ``wall`` and ``empty`` cells block
    movement.
    """
    floor = await db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    # Parse grid_data
    grid = _parse_grid(floor)
    if grid is None:
        return FloorRoomDistances(floor_id=floor_id, cell_size_m=floor.cell_size_m, distances=[])

    # Parse room_links
    if floor.room_links is None:
        return FloorRoomDistances(floor_id=floor_id, cell_size_m=floor.cell_size_m, distances=[])
    try:
        links = json.loads(floor.room_links)
    except (json.JSONDecodeError, ValueError):
        return FloorRoomDistances(floor_id=floor_id, cell_size_m=floor.cell_size_m, distances=[])

    # Run BFS
    raw: dict[str, dict[str, int]] = compute_room_distances(grid, links)

    # Build record_id → human-readable name from the blob metadata.
    # The FloorGridPainter stores `record_name` on each blob alongside `record_id`.
    id_to_name: dict[str, str | None] = {
        link["record_id"]: link.get("record_name")
        for link in links
        if link.get("record_id")
    }

    # Flatten to list of RoomDistanceEntry (include both A→B and B→A)
    entries: list[RoomDistanceEntry] = []
    for from_id, targets in raw.items():
        for to_id, dist_cells in targets.items():
            entries.append(RoomDistanceEntry(
                from_room_id=from_id,
                to_room_id=to_id,
                from_room_name=id_to_name.get(from_id),
                to_room_name=id_to_name.get(to_id),
                distance_cells=dist_cells,
                distance_m=round(dist_cells * floor.cell_size_m, 3),
            ))

    return FloorRoomDistances(
        floor_id=floor_id,
        cell_size_m=floor.cell_size_m,
        distances=entries,
    )


# ===========================================================================
# Stair connections
# ===========================================================================

@router.put("/floors/{floor_id}/stair-connections", response_model=FloorOut)
@router.put("/floors/{floor_id}/stair-connections/", response_model=FloorOut, include_in_schema=False)
async def save_stair_connections(
    floor_id: str,
    payload: StairConnectionsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Replace ALL stair/lift connection declarations for a floor.

    Each entry in ``stair_connections`` describes one stair group on this floor:
      - ``stair_id``           : shared label matching the paired floor's entry
      - ``cells``              : grid cells on THIS floor belonging to the stair group
      - ``connected_floor_id`` : DB id of the floor on the other side of this connection
      - ``crossing_cost``      : optional BFS-cell penalty override (None = default)

    Both floors must declare matching ``stair_id`` entries for the Dijkstra
    cross-floor distance to be computed.
    """
    floor = await db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    # Validate: connected_floor_id must exist
    for entry in payload.stair_connections:
        other = await db.get(Floor, entry.connected_floor_id)
        if not other:
            raise HTTPException(
                status_code=422,
                detail=f"connected_floor_id '{entry.connected_floor_id}' not found "
                       f"for stair_id '{entry.stair_id}'",
            )

    floor.stair_connections = json.dumps(
        [e.model_dump() for e in payload.stair_connections],
        separators=(",", ":"),
    )
    await db.flush()
    await db.refresh(floor)

    # Invalidate per-floor BFS cache & campus matrix cache, then precompute full matrices
    GLOBAL_FLOOR_CACHE.invalidate(floor_id)
    GLOBAL_CAMPUS_MATRIX_CACHE.invalidate()
    bld = await db.get(Building, floor.building_id)
    if bld:
        await recompute_campus_matrices(db, bld.campus_id)

    return _floor_to_out(floor)



# ===========================================================================
# Building-level cross-floor room distances
# ===========================================================================

@router.get("/buildings/{building_id}/room-distances", response_model=BuildingRoomDistances)
@router.get("/buildings/{building_id}/room-distances/", response_model=BuildingRoomDistances, include_in_schema=False)
async def get_building_room_distances(
    building_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Compute cross-floor BFS/Dijkstra shortest-path distances between every pair
    of linked rooms/staffrooms across all floors of a building.

    Uses the stair connections declared on each floor via
    ``PUT /floors/{id}/stair-connections`` to stitch per-floor BFS graphs.

    Same-floor distances are always preferred; cross-floor distances via stairs
    are added when they are reachable.

    Returns an empty ``distances`` list when:
    - The building has no floors with saved grids.
    - No floors have room-link blobs with record_ids.
    - Fewer than two linked rooms exist across all floors.
    """
    from sqlalchemy.orm import selectinload as _sil

    building = await db.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    floor_rows = (
        await db.execute(
            select(Floor)
            .where(Floor.building_id == building_id)
            .order_by(Floor.level)
        )
    ).scalars().all()

    if not floor_rows:
        return BuildingRoomDistances(building_id=building_id, distances=[])

    # --- Build FloorData + StairConnection lists ---
    floors_data: list[FloorData] = []
    stair_connections: list[StairConnection] = []
    # cell_size_m per floor_id (for distance_m conversion)
    cell_size_by_floor: dict[str, float] = {}
    # record_id -> name (across all floors)
    id_to_name: dict[str, str | None] = {}
    # record_id -> floor_id (to attribute distance_m correctly)
    id_to_floor: dict[str, str] = {}

    for fl in floor_rows:
        cell_size_by_floor[fl.id] = fl.cell_size_m

        grid = _parse_grid(fl)
        if grid is None:
            grid = []

        links: list[dict] = []
        if fl.room_links:
            try:
                links = json.loads(fl.room_links)
            except Exception:
                links = []

        for lnk in links:
            rid = lnk.get("record_id")
            if rid:
                id_to_name[rid] = lnk.get("record_name")
                id_to_floor[rid] = fl.id

        raw_sc: list[dict] = []
        if fl.stair_connections:
            try:
                raw_sc = json.loads(fl.stair_connections)
            except Exception:
                raw_sc = []

        # Build stair_cells for this floor + collect StairConnection objects
        stair_cells: list[dict] = []
        seen_pairs: set[frozenset] = set()
        for sc_entry in raw_sc:
            sid   = sc_entry.get("stair_id", "")
            cells = sc_entry.get("cells", [])
            other_fid = sc_entry.get("connected_floor_id", "")
            cost  = sc_entry.get("crossing_cost")

            if not sid:
                continue

            stair_cells.append({"stair_id": sid, "cells": cells})

            if other_fid:
                pair = frozenset([fl.id, other_fid])
                pair_key = (sid, pair)
                if pair_key not in seen_pairs:
                    seen_pairs.add(pair_key)  # type: ignore[arg-type]
                    stair_connections.append(
                        StairConnection(
                            stair_id=sid,
                            floor_a_id=fl.id,
                            floor_b_id=other_fid,
                            crossing_cost=cost,
                        )
                    )

        floors_data.append(FloorData(
            floor_id=fl.id,
            building_id=fl.building_id,
            level=fl.level,
            cell_size_m=fl.cell_size_m,
            grid_data=grid,
            room_links=links,
            stair_cells=stair_cells,
        ))

    # --- Run multi-floor Dijkstra ---
    building_result = compute_campus_distances(
        floors=floors_data,
        stair_connections=stair_connections,
    )
    raw: dict[str, dict[str, int]] = building_result.get("allDistances", {})
    route_details = building_result.get("allRoutes", {})

    # --- Identify cross-floor pairs ---
    same_floor_pairs: set[frozenset] = set()
    for fl in floor_rows:
        links_json: list[dict] = []
        if fl.room_links:
            try:
                links_json = json.loads(fl.room_links)
            except Exception:
                pass
        rids = [l.get("record_id") for l in links_json if l.get("record_id")]
        for i in range(len(rids)):
            for j in range(i + 1, len(rids)):
                same_floor_pairs.add(frozenset([rids[i], rids[j]]))

    # --- Flatten to list of RoomDistanceEntry ---
    # Use source room's floor cell_size_m for distance_m
    default_cell_size = next(iter(cell_size_by_floor.values()), 1.0)

    entries: list[RoomDistanceEntry] = []
    for from_id, targets in raw.items():
        from_fid = id_to_floor.get(from_id, "")
        csm = cell_size_by_floor.get(from_fid, default_cell_size)
        for to_id, dist_cells in targets.items():
            is_cross = frozenset([from_id, to_id]) not in same_floor_pairs
            entries.append(RoomDistanceEntry(
                from_room_id=from_id,
                to_room_id=to_id,
                from_room_name=id_to_name.get(from_id),
                to_room_name=id_to_name.get(to_id),
                distance_cells=dist_cells,
                distance_m=round(
                    route_details.get(from_id, {}).get(to_id, {}).get("distance_m", dist_cells * csm),
                    3,
                ),
                cross_floor=is_cross,
            ))

    return BuildingRoomDistances(building_id=building_id, distances=entries)


# ===========================================================================
# Inter-building distances CRUD & Campus Matrix endpoint
# ===========================================================================

@router.get("/campuses/{campus_id}/inter-building-distances", response_model=list[InterBuildingDistanceOut])
@router.get("/campuses/{campus_id}/inter-building-distances/", response_model=list[InterBuildingDistanceOut], include_in_schema=False)
async def list_inter_building_distances(campus_id: str, db: AsyncSession = Depends(get_db)):
    campus = await db.get(Campus, campus_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    result = await db.execute(
        select(InterBuildingDistance)
        .where(InterBuildingDistance.campus_id == campus_id)
    )
    return result.scalars().all()


@router.put("/campuses/{campus_id}/inter-building-distances", response_model=list[InterBuildingDistanceOut])
@router.put("/campuses/{campus_id}/inter-building-distances/", response_model=list[InterBuildingDistanceOut], include_in_schema=False)
async def save_inter_building_distances(
    campus_id: str,
    payload: InterBuildingDistancesUpdate,
    db: AsyncSession = Depends(get_db),
):
    campus = await db.get(Campus, campus_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")

    existing = (
        await db.execute(
            select(InterBuildingDistance).where(InterBuildingDistance.campus_id == campus_id)
        )
    ).scalars().all()
    for item in existing:
        await db.delete(item)
    await db.flush()

    new_entries = []
    for entry in payload.distances:
        b1 = await db.get(Building, entry.building_a_id)
        b2 = await db.get(Building, entry.building_b_id)
        if not b1 or not b2:
            raise HTTPException(status_code=422, detail="Invalid building id in inter-building distance pair")

        dist_cells = entry.distance_cells
        if dist_cells is None:
            dist_cells = int(entry.distance_m)

        row = InterBuildingDistance(
            campus_id=campus_id,
            building_a_id=entry.building_a_id,
            building_b_id=entry.building_b_id,
            distance_m=entry.distance_m,
            distance_cells=dist_cells,
        )
        db.add(row)
        new_entries.append(row)

    await db.flush()

    GLOBAL_CAMPUS_MATRIX_CACHE.invalidate()
    await recompute_campus_matrices(db, campus_id)

    return new_entries


@router.get("/campuses/{campus_id}/distances", response_model=CampusDistanceMatricesResponse)
@router.get("/campuses/{campus_id}/distances/", response_model=CampusDistanceMatricesResponse, include_in_schema=False)
async def get_campus_distance_matrices(campus_id: str, db: AsyncSession = Depends(get_db)):
    campus = await db.get(Campus, campus_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")

    # The current in-memory matrix cache is process-global rather than keyed by
    # campus. Recompute here so requests for another campus cannot reuse it.
    res = await recompute_campus_matrices(db, campus_id)
    return CampusDistanceMatricesResponse(
        campus_id=campus_id,
        staff_room_distance=res.get("staffRoomDistance", {}),
        room_room_distance=res.get("roomRoomDistance", {}),
        all_distances=res.get("allDistances", {}),
        all_routes=res.get("allRoutes", {}),
    )


@router.get("/campuses/{campus_id}/mapped-rooms", response_model=list[MappedRoomItem])
@router.get("/campuses/{campus_id}/mapped-rooms/", response_model=list[MappedRoomItem], include_in_schema=False)
async def list_mapped_rooms(campus_id: str, db: AsyncSession = Depends(get_db)):
    """List all mapped rooms and staff rooms across all buildings/floors of a campus."""
    stmt = (
        select(Floor, Building)
        .join(Building, Floor.building_id == Building.id)
        .where(Building.campus_id == campus_id)
        .where(Floor.room_links.isnot(None))
    )
    rows = (await db.execute(stmt)).all()

    items: list[MappedRoomItem] = []
    seen_ids: set[str] = set()

    for fl, bldg in rows:
        if not fl.room_links:
            continue
        try:
            links = json.loads(fl.room_links)
        except Exception:
            continue

        for link in links:
            rid = link.get("record_id")
            rname = link.get("record_name") or link.get("name") or "Unnamed Room"
            rtype = link.get("record_type") or ("staffroom" if link.get("cell_type") == "staffroom" else "room")
            if rid and rid not in seen_ids:
                seen_ids.add(rid)
                items.append(
                    MappedRoomItem(
                        id=rid,
                        name=rname,
                        code=link.get("code"),
                        type=rtype,
                        building_id=bldg.id,
                        building_name=bldg.name,
                        building_color=bldg.color,
                        floor_id=fl.id,
                        floor_name=fl.name,
                        level=fl.level,
                    )
                )

    items.sort(key=lambda x: (x.building_name or "", x.level or 0, x.name or ""))
    return items


@router.get("/campuses/{campus_id}/room-distance-calculator", response_model=RoomDistanceQueryResponse)
@router.get("/campuses/{campus_id}/room-distance-calculator/", response_model=RoomDistanceQueryResponse, include_in_schema=False)
async def calculate_room_distance_query(
    campus_id: str,
    from_room_id: str,
    to_room_id: str,
    db: AsyncSession = Depends(get_db),
):
    campus = await db.get(Campus, campus_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")

    mapped_rooms = await list_mapped_rooms(campus_id, db)
    room_by_id = {r.id: r for r in mapped_rooms}

    from_item = room_by_id.get(from_room_id)
    to_item = room_by_id.get(to_room_id)

    if not from_item or not to_item:
        return RoomDistanceQueryResponse(
            from_room=from_item,
            to_room=to_item,
            distance_m=None,
            distance_cells=None,
            reachable=False,
            route_type="unreachable",
            description="One or both selected rooms are not mapped on the campus layout."
        )

    if from_room_id == to_room_id:
        return RoomDistanceQueryResponse(
            from_room=from_item,
            to_room=to_item,
            distance_m=0.0,
            distance_cells=0,
            reachable=True,
            route_type="same_floor",
            description=f"Same room ({from_item.name}). Walking distance is 0m."
        )

    matrices = await get_campus_distance_matrices(campus_id, db)
    all_dists = matrices.all_distances or {}
    all_routes = matrices.all_routes or {}

    dist_cells = all_dists.get(from_room_id, {}).get(to_room_id)
    # Try reverse direction if forward not found
    if dist_cells is None:
        dist_cells = all_dists.get(to_room_id, {}).get(from_room_id)

    if dist_cells is None or dist_cells < 0:
        return RoomDistanceQueryResponse(
            from_room=from_item,
            to_room=to_item,
            distance_m=None,
            distance_cells=None,
            reachable=False,
            route_type="unreachable",
            description=f"No connected path exists between {from_item.name} and {to_item.name}."
        )

    # Prefer engine-computed metadata from allRoutes; fall back to reverse lookup
    route_meta = (
        all_routes.get(from_room_id, {}).get(to_room_id)
        or all_routes.get(to_room_id, {}).get(from_room_id)
        or {}
    )

    # Use engine-reported distance_m if available (carries correct cell_size_m),
    # otherwise scale the cells count by the source floor's cell size from room metadata.
    if route_meta.get("distance_m") is not None:
        dist_m = float(route_meta["distance_m"])
    else:
        dist_m = round(float(dist_cells) * 1.0, 1)

    route_type = route_meta.get("route_type", "same_floor")
    stair_id   = route_meta.get("stair_id")
    ga_label   = route_meta.get("gate_a_label")
    gb_label   = route_meta.get("gate_b_label")
    fallback   = route_meta.get("fallback_used", False)

    if route_type == "same_floor":
        desc = f"Direct walking path within {from_item.building_name} ({from_item.floor_name})."
    elif route_type == "cross_floor":
        floor_diff = abs((from_item.level or 0) - (to_item.level or 0))
        stair_info = f" via stairwell '{stair_id}'" if stair_id else " via stairwell/lift"
        desc = (
            f"Cross-floor path{stair_info} in {from_item.building_name} "
            f"({from_item.floor_name} \u2192 {to_item.floor_name}, "
            f"{floor_diff} floor{'s' if floor_diff > 1 else ''}). "
            + ("(Estimated inter-building distance used.)" if fallback else "")
        ).strip()
    elif route_type == "cross_building":
        ga_part = f" '{ga_label}'" if ga_label else ""
        gb_part = f" '{gb_label}'" if gb_label else ""
        desc = (
            f"Cross-building path via gate{ga_part} ({from_item.building_name})"
            f" \u2192 gate{gb_part} ({to_item.building_name})."
            + (" (Estimated inter-building distance used.)" if fallback else "")
        ).strip()
    else:
        desc = f"Path from {from_item.name} to {to_item.name}."

    return RoomDistanceQueryResponse(
        from_room=from_item,
        to_room=to_item,
        distance_m=dist_m,
        distance_cells=dist_cells,
        reachable=True,
        route_type=route_type,
        description=desc,
        gate_a_label=ga_label,
        gate_b_label=gb_label,
        stair_id=stair_id,
        fallback_used=fallback,
    )


# ===========================================================================
# Gates \u2014 list all gate cells across a campus
# ===========================================================================

@router.get("/campuses/{campus_id}/gates", response_model=list[GateInfo])
@router.get("/campuses/{campus_id}/gates/", response_model=list[GateInfo], include_in_schema=False)
async def list_campus_gates(campus_id: str, db: AsyncSession = Depends(get_db)):
    """
    Return all gate cells across every floor of a campus.
    Includes explicitly labelled gates (from gate_labels JSON) and any
    unlabelled gate/entrance typed cells found by scanning the saved grid.
    Used by the frontend Entrance Links panel to populate gate selectors.
    """
    campus = await db.get(Campus, campus_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")

    stmt = (
        select(Floor, Building)
        .join(Building, Floor.building_id == Building.id)
        .where(Building.campus_id == campus_id)
    )
    rows = (await db.execute(stmt)).all()

    gates: list[GateInfo] = []
    _GATE_TYPES_SET = {"gate", "entrance"}

    for fl, bldg in rows:
        raw_gl: dict = {}
        if fl.gate_labels:
            try:
                raw_gl = json.loads(fl.gate_labels)
            except Exception:
                pass

        grid = _parse_grid(fl)
        grid_gate_keys: set[str] = set()
        if grid:
            for r_idx, row_cells in enumerate(grid):
                for c_idx, cell in enumerate(row_cells):
                    if cell in _GATE_TYPES_SET:
                        grid_gate_keys.add(f"{r_idx},{c_idx}")

        all_keys = set(raw_gl.keys()) | grid_gate_keys
        for key in all_keys:
            try:
                r_str, c_str = key.split(",", 1)
                gates.append(GateInfo(
                    floor_id=fl.id,
                    floor_name=fl.name,
                    building_id=bldg.id,
                    building_name=bldg.name,
                    row=int(r_str),
                    col=int(c_str),
                    label=raw_gl.get(key),
                ))
            except (ValueError, AttributeError):
                pass

    gates.sort(key=lambda g: (g.building_name or "", g.floor_name or "", g.row, g.col))
    return gates


# ===========================================================================
# Entrance-Pair Distances (per-gate cross-building distances)
# ===========================================================================

@router.get("/campuses/{campus_id}/entrance-pairs", response_model=list[EntrancePairOut])
@router.get("/campuses/{campus_id}/entrance-pairs/", response_model=list[EntrancePairOut], include_in_schema=False)
async def list_entrance_pairs(campus_id: str, db: AsyncSession = Depends(get_db)):
    """List all per-gate cross-building distance entries for a campus."""
    campus = await db.get(Campus, campus_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    result = await db.execute(
        select(EntrancePairDistance).where(EntrancePairDistance.campus_id == campus_id)
    )
    return result.scalars().all()


@router.put("/campuses/{campus_id}/entrance-pairs", response_model=list[EntrancePairOut])
@router.put("/campuses/{campus_id}/entrance-pairs/", response_model=list[EntrancePairOut], include_in_schema=False)
async def save_entrance_pairs(
    campus_id: str,
    payload: EntrancePairsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Bulk-replace all per-gate cross-building distance entries for a campus.

    Each entry specifies the source gate (floor_a_id, gate_a_row, gate_a_col),
    destination gate (floor_b_id, gate_b_row, gate_b_col), and the real-world
    outdoor walking distance_m between those two gate cells.

    The Dijkstra engine uses these in preference to the coarse building-pair
    InterBuildingDistance table, automatically finding the cheapest gate
    combination for each room-to-room journey.
    """
    campus = await db.get(Campus, campus_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")

    for entry in payload.pairs:
        fa = await db.get(Floor, entry.floor_a_id)
        fb = await db.get(Floor, entry.floor_b_id)
        if not fa:
            raise HTTPException(status_code=422, detail=f"floor_a_id '{entry.floor_a_id}' not found")
        if not fb:
            raise HTTPException(status_code=422, detail=f"floor_b_id '{entry.floor_b_id}' not found")
        if (entry.floor_a_id == entry.floor_b_id and
                entry.gate_a_row == entry.gate_b_row and
                entry.gate_a_col == entry.gate_b_col):
            raise HTTPException(status_code=422, detail="Source and destination gate must differ")

    existing = (
        await db.execute(
            select(EntrancePairDistance).where(EntrancePairDistance.campus_id == campus_id)
        )
    ).scalars().all()
    for item in existing:
        await db.delete(item)
    await db.flush()

    new_entries = []
    for entry in payload.pairs:
        fa = await db.get(Floor, entry.floor_a_id)
        cell_size = fa.cell_size_m if fa else 1.0
        dist_cells = entry.distance_cells
        if dist_cells is None:
            dist_cells = max(1, round(entry.distance_m / cell_size))

        row = EntrancePairDistance(
            campus_id=campus_id,
            floor_a_id=entry.floor_a_id,
            gate_a_row=entry.gate_a_row,
            gate_a_col=entry.gate_a_col,
            gate_a_label=entry.gate_a_label,
            floor_b_id=entry.floor_b_id,
            gate_b_row=entry.gate_b_row,
            gate_b_col=entry.gate_b_col,
            gate_b_label=entry.gate_b_label,
            distance_m=entry.distance_m,
            distance_cells=dist_cells,
        )
        db.add(row)
        new_entries.append(row)

    await db.flush()

    GLOBAL_CAMPUS_MATRIX_CACHE.invalidate()
    await recompute_campus_matrices(db, campus_id)

    return new_entries


# ===========================================================================
# Teacher Daily Commute -- Module 7f distance overlay
# ===========================================================================

from pydantic import BaseModel as _PydanticBaseModel  # local alias


class TeacherCommuteWaypoint(_PydanticBaseModel):
    index: int
    room_id: str | None
    room_name: str
    room_type: str
    building_id: str | None = None
    building_name: str | None = None
    floor_name: str | None = None
    floor_level: int | None = None
    period_index: int | None = None
    subject_name: str | None = None
    subject_code: str | None = None
    section_name: str | None = None
    is_staffroom: bool = False
    is_break: bool = False
    gap_periods: int = 0


class TeacherCommuteHop(_PydanticBaseModel):
    step: int
    from_room_id: str | None
    from_room_name: str
    from_room_type: str
    from_building_id: str | None = None
    from_building_name: str | None = None
    from_floor_name: str | None = None
    from_floor_level: int | None = None
    to_room_id: str | None
    to_room_name: str
    to_room_type: str
    to_building_id: str | None = None
    to_building_name: str | None = None
    to_floor_name: str | None = None
    to_floor_level: int | None = None
    distance_m: float | None
    distance_cells: int | None
    reachable: bool
    route_type: str | None = None
    period_index: int | None
    subject_name: str | None
    subject_code: str | None
    section_name: str | None
    day_of_week: int | None
    is_return_to_staffroom: bool = False
    is_break_departure: bool = False
    is_break_return: bool = False
    gap_periods: int = 0


class TeacherCommuteDaySummary(_PydanticBaseModel):
    day_of_week: int
    day_name: str
    total_distance_m: float
    periods_count: int
    hops_count: int
    reachable_hops: int


class TeacherCommuteResponse(_PydanticBaseModel):
    teacher_id: str
    teacher_name: str
    staffroom_id: str | None
    staffroom_name: str | None
    staffroom_building_id: str | None = None
    staffroom_building_name: str | None = None
    timetable_id: str
    day_of_week: int
    day_name: str
    total_distance_m: float
    reachable_hops: int
    total_hops: int
    hops: list[TeacherCommuteHop]
    waypoints: list[TeacherCommuteWaypoint] = []
    weekly_summary: list[TeacherCommuteDaySummary] = []


_COMMUTE_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@router.get("/campuses/{campus_id}/teacher-commute", response_model=TeacherCommuteResponse)
@router.get("/campuses/{campus_id}/teacher-commute/", response_model=TeacherCommuteResponse, include_in_schema=False)
async def get_teacher_commute(
    campus_id: str,
    teacher_id: str,
    timetable_id: str,
    day_of_week: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """
    Compute the full daily walking commute path for a teacher on a given day.

    Journey: Staffroom -> Period-1 room -> Period-2 room -> ... -> Staffroom

    Uses Module 7f campus-wide precomputed distance matrices to label each hop.
    """
    campus = await db.get(Campus, campus_id)
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")

    teacher = await db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    mapped_rooms = await list_mapped_rooms(campus_id, db)
    mapped_room_dict = {r.id: r for r in mapped_rooms}

    staffroom_id: str | None = None
    staffroom_name: str | None = None
    staffroom_building_id: str | None = None
    staffroom_building_name: str | None = None

    if teacher.department_id:
        sr = (await db.execute(
            select(StaffRoom).where(StaffRoom.department_id == teacher.department_id)
        )).scalar_one_or_none()
        if sr is not None:
            staffroom_id = sr.id
            staffroom_name = sr.label

    # Match staffroom against mapped staffrooms on this campus if possible
    mapped_staffrooms = [r for r in mapped_rooms if r.type == "staffroom"]
    if staffroom_id and staffroom_id in mapped_room_dict:
        mr = mapped_room_dict[staffroom_id]
        staffroom_name = staffroom_name or mr.name
        staffroom_building_id = mr.building_id
        staffroom_building_name = mr.building_name
    elif mapped_staffrooms:
        mr = mapped_staffrooms[0]
        staffroom_id = mr.id
        staffroom_name = staffroom_name or mr.name
        staffroom_building_id = mr.building_id
        staffroom_building_name = mr.building_name

    all_teacher_slots = (await db.execute(
        select(TimetableSlot)
        .where(
            TimetableSlot.timetable_id == timetable_id,
            TimetableSlot.teacher_id == teacher_id,
        )
        .order_by(TimetableSlot.day_of_week, TimetableSlot.period_index)
    )).scalars().all()

    slot_rows = [s for s in all_teacher_slots if s.day_of_week == day_of_week]

    room_ids    = {s.room_id    for s in slot_rows if s.room_id}
    subject_ids = {s.subject_id for s in slot_rows if s.subject_id}
    section_ids = {s.section_id for s in slot_rows if s.section_id}

    room_map: dict[str, Room] = {}
    if room_ids:
        rows = (await db.execute(select(Room).where(Room.id.in_(room_ids)))).scalars().all()
        room_map = {r.id: r for r in rows}

    subj_map: dict[str, Subject] = {}
    if subject_ids:
        rows = (await db.execute(select(Subject).where(Subject.id.in_(subject_ids)))).scalars().all()
        subj_map = {s.id: s for s in rows}

    sect_map: dict[str, ClassSection] = {}
    if section_ids:
        rows = (await db.execute(
            select(ClassSection).where(ClassSection.id.in_(section_ids))
        )).scalars().all()
        sect_map = {s.id: s for s in rows}

    matrices = await recompute_campus_matrices(db, campus_id)
    all_dists  = matrices.get("allDistances", {})
    all_routes = matrices.get("allRoutes", {})
    sr_dists   = matrices.get("staffRoomDistance", {})

    def _get_dist(from_id, to_id):
        if not from_id or not to_id:
            return None, None, None
        if from_id == to_id:
            return 0, 0.0, "same_room"
        cells = sr_dists.get(from_id, {}).get(to_id) or sr_dists.get(to_id, {}).get(from_id)
        if cells is None:
            cells = all_dists.get(from_id, {}).get(to_id) or all_dists.get(to_id, {}).get(from_id)
        if cells is None or cells < 0:
            return None, None, None
        route_meta = (
            all_routes.get(from_id, {}).get(to_id)
            or all_routes.get(to_id, {}).get(from_id)
            or {}
        )
        dist_m = route_meta.get("distance_m")
        if dist_m is None:
            dist_m = float(cells)
        r_type = route_meta.get("route_type", "same_floor")
        return cells, round(float(dist_m), 2), r_type

    class _WP:
        def __init__(self, rid, name, rtype, pidx, sn, sc, secn, dow, is_sr=False, is_break=False, gap_periods=0):
            self.rid = rid; self.name = name; self.rtype = rtype; self.pidx = pidx
            self.sn = sn; self.sc = sc; self.secn = secn; self.dow = dow; self.is_sr = is_sr
            self.is_break = is_break; self.gap_periods = gap_periods

    day_name = _COMMUTE_DAY_NAMES[day_of_week] if 0 <= day_of_week < 7 else f"Day {day_of_week}"

    # Compute weekly summary across all days (including gap returns to staffroom)
    weekly_summary: list[TeacherCommuteDaySummary] = []
    slots_by_day: dict[int, list[TimetableSlot]] = {}
    for s in all_teacher_slots:
        slots_by_day.setdefault(s.day_of_week, []).append(s)

    for d_idx in range(7):
        d_name = _COMMUTE_DAY_NAMES[d_idx]
        d_slots = slots_by_day.get(d_idx, [])
        if not d_slots:
            weekly_summary.append(TeacherCommuteDaySummary(
                day_of_week=d_idx,
                day_name=d_name,
                total_distance_m=0.0,
                periods_count=0,
                hops_count=0,
                reachable_hops=0,
            ))
            continue

        d_rids = [staffroom_id]
        for s_i, s in enumerate(d_slots):
            if s_i > 0:
                prev_s = d_slots[s_i - 1]
                if s.period_index - prev_s.period_index > 1:
                    # Return to staffroom during free period gap!
                    d_rids.append(staffroom_id)
            d_rids.append(s.room_id)
        d_rids.append(staffroom_id)

        d_dist = 0.0
        d_reach = 0
        d_hops = 0
        for k in range(len(d_rids) - 1):
            c_cells, c_dist_m, _ = _get_dist(d_rids[k], d_rids[k + 1])
            if c_dist_m is not None:
                d_dist += c_dist_m
                d_reach += 1
            d_hops += 1

        weekly_summary.append(TeacherCommuteDaySummary(
            day_of_week=d_idx,
            day_name=d_name,
            total_distance_m=round(d_dist, 2),
            periods_count=len(d_slots),
            hops_count=d_hops,
            reachable_hops=d_reach,
        ))

    if not slot_rows:
        return TeacherCommuteResponse(
            teacher_id=teacher.id, teacher_name=teacher.name,
            staffroom_id=staffroom_id, staffroom_name=staffroom_name,
            staffroom_building_id=staffroom_building_id,
            staffroom_building_name=staffroom_building_name,
            timetable_id=timetable_id, day_of_week=day_of_week, day_name=day_name,
            total_distance_m=0.0,
            reachable_hops=0, total_hops=0, hops=[], waypoints=[],
            weekly_summary=weekly_summary,
        )

    # Build sequence of waypoints:
    # Staffroom -> Period 1 Room -> (if gap > 1: return to Staffroom -> next Period Room) -> ... -> Staffroom
    wps = [_WP(staffroom_id, staffroom_name or "Staffroom", "staffroom", None, None, None, None, None, is_sr=True, is_break=False)]
    for slot_idx, slot in enumerate(slot_rows):
        if slot_idx > 0:
            prev_slot = slot_rows[slot_idx - 1]
            if slot.period_index - prev_slot.period_index > 1:
                gap = slot.period_index - prev_slot.period_index - 1
                # Return to Staffroom during gap
                wps.append(_WP(
                    rid=staffroom_id,
                    name=staffroom_name or "Staffroom",
                    rtype="staffroom",
                    pidx=None,
                    sn=None,
                    sc=None,
                    secn=None,
                    dow=slot.day_of_week,
                    is_sr=True,
                    is_break=True,
                    gap_periods=gap,
                ))

        room = room_map.get(slot.room_id) if slot.room_id else None
        subj = subj_map.get(slot.subject_id) if slot.subject_id else None
        sect = sect_map.get(slot.section_id) if slot.section_id else None
        wps.append(_WP(
            rid=slot.room_id,
            name=room.name if room else (f"Room {slot.room_id[:8]}" if slot.room_id else "Unknown"),
            rtype=room.room_type if room else "unknown",
            pidx=slot.period_index,
            sn=subj.name if subj else None,
            sc=subj.code if subj else None,
            secn=sect.name if sect else None,
            dow=slot.day_of_week,
            is_sr=False,
            is_break=False,
        ))
    wps.append(_WP(staffroom_id, staffroom_name or "Staffroom", "staffroom", None, None, None, None, None, is_sr=True, is_break=False))

    waypoint_models = []
    for idx, wp in enumerate(wps):
        mr = mapped_room_dict.get(wp.rid)
        b_id = mr.building_id if mr else (staffroom_building_id if wp.is_sr else None)
        b_name = mr.building_name if mr else (staffroom_building_name if wp.is_sr else None)
        fl_name = mr.floor_name if mr else None
        fl_lvl = mr.level if mr else None
        waypoint_models.append(TeacherCommuteWaypoint(
            index=idx,
            room_id=wp.rid,
            room_name=wp.name,
            room_type=wp.rtype,
            building_id=b_id,
            building_name=b_name,
            floor_name=fl_name,
            floor_level=fl_lvl,
            period_index=wp.pidx,
            subject_name=wp.sn,
            subject_code=wp.sc,
            section_name=wp.secn,
            is_staffroom=wp.is_sr,
            is_break=wp.is_break,
            gap_periods=wp.gap_periods,
        ))

    hops = []
    total_dist_m = 0.0
    reachable_count = 0
    for i in range(len(wps) - 1):
        frm, to_ = wps[i], wps[i + 1]
        frm_mr = mapped_room_dict.get(frm.rid)
        to_mr  = mapped_room_dict.get(to_.rid)

        frm_b_id = frm_mr.building_id if frm_mr else (staffroom_building_id if frm.is_sr else None)
        frm_b_nm = frm_mr.building_name if frm_mr else (staffroom_building_name if frm.is_sr else None)
        to_b_id  = to_mr.building_id if to_mr else (staffroom_building_id if to_.is_sr else None)
        to_b_nm  = to_mr.building_name if to_mr else (staffroom_building_name if to_.is_sr else None)

        cells, dist_m, r_type = _get_dist(frm.rid, to_.rid)
        reachable = dist_m is not None
        if reachable:
            total_dist_m += dist_m
            reachable_count += 1

        is_break_return = to_.is_sr and to_.is_break
        is_break_dep = frm.is_sr and frm.is_break
        is_ret_sr = to_.is_sr

        hops.append(TeacherCommuteHop(
            step=i,
            from_room_id=frm.rid, from_room_name=frm.name, from_room_type=frm.rtype,
            from_building_id=frm_b_id, from_building_name=frm_b_nm,
            from_floor_name=frm_mr.floor_name if frm_mr else None,
            from_floor_level=frm_mr.level if frm_mr else None,
            to_room_id=to_.rid, to_room_name=to_.name, to_room_type=to_.rtype,
            to_building_id=to_b_id, to_building_name=to_b_nm,
            to_floor_name=to_mr.floor_name if to_mr else None,
            to_floor_level=to_mr.level if to_mr else None,
            distance_m=dist_m, distance_cells=cells, reachable=reachable,
            route_type=r_type,
            period_index=to_.pidx, subject_name=to_.sn, subject_code=to_.sc,
            section_name=to_.secn, day_of_week=to_.dow,
            is_return_to_staffroom=is_ret_sr,
            is_break_departure=is_break_dep,
            is_break_return=is_break_return,
            gap_periods=to_.gap_periods or frm.gap_periods,
        ))

    return TeacherCommuteResponse(
        teacher_id=teacher.id, teacher_name=teacher.name,
        staffroom_id=staffroom_id, staffroom_name=staffroom_name,
        staffroom_building_id=staffroom_building_id,
        staffroom_building_name=staffroom_building_name,
        timetable_id=timetable_id, day_of_week=day_of_week, day_name=day_name,
        total_distance_m=round(total_dist_m, 2),
        reachable_hops=reachable_count, total_hops=len(hops),
        hops=hops, waypoints=waypoint_models,
        weekly_summary=weekly_summary,
    )
