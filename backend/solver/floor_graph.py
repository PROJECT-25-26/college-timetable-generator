"""
BFS room-distance computation for single-floor, multi-floor, and multi-building campus graphs.

Cell Types
──────────
    "door"      – Room/staffroom door (new, preferred).  Walkable, used as BFS entry for rooms.
    "gate"      – Building gate (new, preferred).  Walkable, used as cross-building hop node.
    "entrance"  – Legacy alias for "gate". Still accepted so existing grids keep working.

Public API
──────────
    compute_room_distances(grid_data, room_links) → dict[str, dict[str, int]]
        Single-floor BFS distances between every linked room/staffroom pair.

    compute_building_distances(floors, stair_connections, floor_distance_penalty) → dict[str, dict[str, int]]
        Multi-floor distances by stitching per-floor BFS graphs through
        stair/lift connections declared between floors.

    compute_campus_distances(floors, stair_connections, inter_building_distances,
                             entrance_pair_distances, building_positions, floor_distance_penalty)
        → dict[str, Any]
        Full campus-wide distance calculation: same-floor + cross-floor + cross-building.
        Returns:
          {
            "staffRoomDistance": dict[staffroom_id, dict[room_id, int]],
            "roomRoomDistance":  dict[room_id, dict[room_id, int]],
            "allDistances":      dict[room_id, dict[room_id, int]],
            "allRoutes":         dict[room_id, dict[room_id, dict[str, Any]]],
          }

Caching & Precomputation
────────────────────────
    FloorBFSGraphCache:
        Caches per-floor BFS graph calculations (intra-floor distances, room-to-stair,
        room-to-gate). Invalidated ONLY when that floor's grid/links change.

    CampusMatrixCache:
        Caches precomputed full staffRoomDistance and roomRoomDistance matrices across the campus.
"""

from __future__ import annotations

import hashlib
import heapq
import json
from collections import deque
from dataclasses import dataclass, field
from typing import Any, TypedDict

# ---------------------------------------------------------------------------
# Cell type constants
# ---------------------------------------------------------------------------

# Gate-equivalent cell types (used for cross-building hop nodes)
_GATE_TYPES: frozenset[str] = frozenset({"gate", "entrance"})

# Cell types that a person can walk through
_WALKABLE: frozenset[str] = frozenset(
    {"corridor", "room", "staffroom", "stairs", "door", "gate", "entrance"}
)

# Default penalty added per stair connection traversed (in BFS cells).
# Rule of thumb: 1 floor crossing ≈ 15 cells of extra walking distance.
DEFAULT_FLOOR_DISTANCE_PENALTY: int = 15



# ---------------------------------------------------------------------------
# Public data types
# ---------------------------------------------------------------------------

class FloorData(TypedDict, total=False):
    """Describes one floor passed to compute_building_distances / compute_campus_distances."""
    floor_id:    str                    # DB id of the Floor record
    building_id: str                    # DB id of the Building record
    level:       int                    # floor level (0 = ground)
    cell_size_m: float                  # metres per cell
    grid_data:   list[list[str]]        # 2-D cell-type grid
    room_links:  list[dict[str, Any]]   # blob-to-record link list
    stair_cells: list[dict[str, Any]]   # [{stair_id: str, cells: [[r,c],...]}]
    gate_cells:  list[dict[str, Any]]   # [{row: int, col: int, label: str|None}]


@dataclass(frozen=True)
class StairConnection:
    """
    Declares that stair/lift group ``stair_id`` physically connects
    ``floor_a_id`` and ``floor_b_id``.
    """
    stair_id:      str               # shared label on both floors
    floor_a_id:    str               # DB id of the first floor
    floor_b_id:    str               # DB id of the second floor
    crossing_cost: int | None = None  # override in BFS cells; None = auto


@dataclass(frozen=True)
class InterBuildingDistanceData:
    """
    Coarse building-pair distance (fallback when no per-gate-pair entry exists).
    """
    building_a_id: str
    building_b_id: str
    distance_cells: int = 0
    distance_m: float | None = None


@dataclass(frozen=True)
class EntrancePairDistanceData:
    """
    Precise per-gate cross-building distance.
    Keyed by (floor_a_id, gate_a_pos, floor_b_id, gate_b_pos).
    """
    floor_a_id:     str
    gate_a_pos:     tuple[int, int]   # (row, col)
    gate_a_label:   str | None
    floor_b_id:     str
    gate_b_pos:     tuple[int, int]   # (row, col)
    gate_b_label:   str | None
    distance_cells: int = 0
    distance_m: float | None = None


# ---------------------------------------------------------------------------
# Per-Floor BFS Cache & Precomputed Campus Matrix Cache
# ---------------------------------------------------------------------------

class FloorBFSGraphCache:
    """
    In-memory cache for per-floor BFS distance computations.
    Invalidated ONLY when a floor's grid_data, room_links, or stair_cells change.
    """
    def __init__(self) -> None:
        self._cache: dict[str, tuple[str, dict[str, Any]]] = {}

    def _compute_hash(self, grid_data: list, room_links: list, stair_cells: list, gate_cells: list) -> str:
        data_str = json.dumps({"g": grid_data, "r": room_links, "s": stair_cells, "gc": gate_cells}, sort_keys=True)
        return hashlib.sha256(data_str.encode("utf-8")).hexdigest()

    def get(self, floor_id: str, grid_data: list, room_links: list, stair_cells: list, gate_cells: list) -> dict[str, Any] | None:
        h = self._compute_hash(grid_data, room_links, stair_cells, gate_cells)
        if floor_id in self._cache:
            stored_hash, cached_data = self._cache[floor_id]
            if stored_hash == h:
                return cached_data
        return None

    def put(self, floor_id: str, grid_data: list, room_links: list, stair_cells: list, gate_cells: list, data: dict[str, Any]) -> None:
        h = self._compute_hash(grid_data, room_links, stair_cells, gate_cells)
        self._cache[floor_id] = (h, data)

    def invalidate(self, floor_id: str) -> None:
        self._cache.pop(floor_id, None)

    def clear(self) -> None:
        self._cache.clear()


GLOBAL_FLOOR_CACHE = FloorBFSGraphCache()


class CampusMatrixCache:
    """
    Global in-memory cache for precomputed staffRoomDistance, roomRoomDistance,
    allDistances, and allRoutes matrices.
    """
    def __init__(self) -> None:
        self._staff_room_distance: dict[str, dict[str, int]] = {}
        self._room_room_distance: dict[str, dict[str, int]] = {}
        self._all_distances: dict[str, dict[str, int]] = {}
        self._all_routes: dict[str, dict[str, dict[str, Any]]] = {}
        self._is_valid: bool = False

    def update(
        self,
        staff_room_dist: dict[str, dict[str, int]],
        room_room_dist: dict[str, dict[str, int]],
        all_dist: dict[str, dict[str, int]],
        all_routes: dict[str, dict[str, dict[str, Any]]] | None = None,
    ) -> None:
        self._staff_room_distance = staff_room_dist
        self._room_room_distance = room_room_dist
        self._all_distances = all_dist
        self._all_routes = all_routes or {}
        self._is_valid = True

    def invalidate(self) -> None:
        self._is_valid = False

    def is_valid(self) -> bool:
        return self._is_valid

    @property
    def staff_room_distance(self) -> dict[str, dict[str, int]]:
        return self._staff_room_distance

    @property
    def room_room_distance(self) -> dict[str, dict[str, int]]:
        return self._room_room_distance

    @property
    def all_distances(self) -> dict[str, dict[str, int]]:
        return self._all_distances

    @property
    def all_routes(self) -> dict[str, dict[str, dict[str, Any]]]:
        return self._all_routes


GLOBAL_CAMPUS_MATRIX_CACHE = CampusMatrixCache()


# ---------------------------------------------------------------------------
# Single-floor BFS
# ---------------------------------------------------------------------------

def compute_room_distances(
    grid_data: list[list[str]],
    room_links: list[dict[str, Any]],
) -> dict[str, dict[str, int]]:
    """
    Compute BFS shortest-path distances (in cells) between entrances of every
    pair of room/staffroom blobs on a single floor.
    """
    if not grid_data or not grid_data[0]:
        return {}

    rows = len(grid_data)
    cols = len(grid_data[0])

    walkable: list[list[bool]] = [
        [grid_data[r][c] in _WALKABLE for c in range(cols)]
        for r in range(rows)
    ]

    room_entrances = _extract_room_doors(grid_data, room_links)
    if len(room_entrances) < 2:
        return {}

    cell_to_rooms: dict[tuple[int, int], list[str]] = {}
    for rid, entrances in room_entrances.items():
        for pos in entrances:
            cell_to_rooms.setdefault(pos, []).append(rid)

    result: dict[str, dict[str, int]] = {}

    for src_id, entrances in room_entrances.items():
        dist: list[list[int]] = [[-1] * cols for _ in range(rows)]
        queue: deque[tuple[int, int]] = deque()
        found: dict[str, int] = {}

        for sr, sc in entrances:
            dist[sr][sc] = 0
            queue.append((sr, sc))
            for target_id in cell_to_rooms.get((sr, sc), []):
                if target_id != src_id and target_id not in found:
                    found[target_id] = 0

        while queue:
            r, c = queue.popleft()
            d = dist[r][c]

            for nr, nc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
                if 0 <= nr < rows and 0 <= nc < cols and walkable[nr][nc] and dist[nr][nc] == -1:
                    dist[nr][nc] = d + 1
                    queue.append((nr, nc))
                    for target_id in cell_to_rooms.get((nr, nc), []):
                        if target_id != src_id and target_id not in found:
                            found[target_id] = d + 1

        if found:
            result[src_id] = found

    return result


# ---------------------------------------------------------------------------
# Internal Helpers: BFS graph extraction & caching per floor
# ---------------------------------------------------------------------------

def _get_floor_bfs_data(fdata: FloorData) -> dict[str, Any]:
    """
    Retrieve or compute single-floor graph structures for a floor.
    Uses GLOBAL_FLOOR_CACHE to avoid re-running BFS on unchanged floors.
    """
    fid    = fdata.get("floor_id", "")
    grid   = fdata.get("grid_data") or []
    links  = fdata.get("room_links") or []
    scells = fdata.get("stair_cells") or []
    gcells = fdata.get("gate_cells") or []

    cached = GLOBAL_FLOOR_CACHE.get(fid, grid, links, scells, gcells)
    if cached is not None:
        return cached

    rows = len(grid)
    cols = len(grid[0]) if (grid and grid[0]) else 0

    room_ents = _extract_room_doors(grid, links)

    stair_map: dict[str, set[tuple[int, int]]] = {}
    for sg in scells:
        sid = sg.get("stair_id", "")
        parsed = _parse_cells(sg.get("cells", []), rows, cols)
        if sid:
            if not parsed and grid:
                parsed = {(r, c) for r in range(rows) for c in range(cols) if grid[r][c] == "stairs"}
            if parsed:
                stair_map[sid] = parsed

    # Grid scan fallback: if stair_map is empty but grid has "stairs" cells, group under "STAIR_DEFAULT"
    if not stair_map and grid:
        grid_stairs = {(r, c) for r in range(rows) for c in range(cols) if grid[r][c] == "stairs"}
        if grid_stairs:
            stair_map["STAIR_DEFAULT"] = grid_stairs

    # Building gates: from explicit gate_cells list (new) plus any gate/entrance cells on the grid
    building_gates = _extract_building_gates(grid, gcells, rows, cols)

    room_to_room = compute_room_distances(grid, links)

    # Room → Stair BFS
    room_to_stair: dict[str, dict[str, int]] = {}
    for room_id, ents in room_ents.items():
        sd: dict[str, int] = {}
        for sid, sc_set in stair_map.items():
            hit = _bfs_from_sources_to_targets(grid, ents, sc_set)
            if hit:
                sd[sid] = min(hit.values())
        if sd:
            room_to_stair[room_id] = sd

    # Room → Gate BFS: {room_id → {gate_pos: dist_cells}}
    room_to_gate: dict[str, dict[tuple[int, int], int]] = {}
    if building_gates:
        for room_id, ents in room_ents.items():
            hit = _bfs_from_sources_to_targets(grid, ents, building_gates)
            if hit:
                room_to_gate[room_id] = hit

    # Stair → Gate BFS
    stair_to_gate: dict[str, dict[tuple[int, int], int]] = {}
    if building_gates:
        for sid, sc_set in stair_map.items():
            hit = _bfs_from_sources_to_targets(grid, sc_set, building_gates)
            if hit:
                stair_to_gate[sid] = hit

    # Gate position → label map (for route metadata)
    gate_labels: dict[tuple[int, int], str | None] = {
        (gc["row"], gc["col"]): gc.get("label")
        for gc in gcells
        if "row" in gc and "col" in gc
    }
    # Also label legacy entrance cells (no user label)
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] in _GATE_TYPES and (r, c) not in gate_labels:
                gate_labels[(r, c)] = None

    data = {
        "room_ents":       room_ents,
        "stair_map":       stair_map,
        "building_gates":  building_gates,
        "gate_labels":     gate_labels,
        "room_to_room":    room_to_room,
        "room_to_stair":   room_to_stair,
        "room_to_gate":    room_to_gate,
        "stair_to_gate":   stair_to_gate,
    }

    if fid:
        GLOBAL_FLOOR_CACHE.put(fid, grid, links, scells, gcells, data)

    return data


def _extract_building_gates(
    grid_data: list[list[str]],
    gate_cells: list[dict[str, Any]],
    rows: int,
    cols: int,
) -> set[tuple[int, int]]:
    """
    Return the set of gate cell positions for a floor.

    Priority:
      1. Explicit gate_cells list provided by the admin (new "gate" tool output).
      2. Any cell on the grid whose type is in _GATE_TYPES ("gate" or legacy "entrance").
    """
    gates: set[tuple[int, int]] = set()

    # Explicit gate_cells list (from gate_labels JSON stored on the floor)
    for gc in gate_cells:
        r, c = gc.get("row"), gc.get("col")
        if r is not None and c is not None:
            r, c = int(r), int(c)
            if 0 <= r < rows and 0 <= c < cols:
                gates.add((r, c))

    # Grid scan fallback: also collect gate/entrance typed cells
    if grid_data:
        for r in range(rows):
            for c in range(cols):
                if grid_data[r][c] in _GATE_TYPES:
                    gates.add((r, c))

    return gates


def _bfs_from_sources_to_targets(
    grid_data:  list[list[str]],
    sources:    set[tuple[int, int]],
    targets:    set[tuple[int, int]],
) -> dict[tuple[int, int], int]:
    """Run multi-source BFS from sources to targets on grid_data."""
    if not grid_data or not grid_data[0]:
        return {}

    rows = len(grid_data)
    cols = len(grid_data[0])
    walkable = [[grid_data[r][c] in _WALKABLE for c in range(cols)] for r in range(rows)]

    dist: list[list[int]] = [[-1] * cols for _ in range(rows)]
    queue: deque[tuple[int, int]] = deque()

    for sr, sc in sources:
        if 0 <= sr < rows and 0 <= sc < cols and walkable[sr][sc] and dist[sr][sc] == -1:
            dist[sr][sc] = 0
            queue.append((sr, sc))

    while queue:
        r, c = queue.popleft()
        d = dist[r][c]
        for nr, nc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
            if 0 <= nr < rows and 0 <= nc < cols and walkable[nr][nc] and dist[nr][nc] == -1:
                dist[nr][nc] = d + 1
                queue.append((nr, nc))

    return {
        (tr, tc): dist[tr][tc]
        for tr, tc in targets
        if 0 <= tr < rows and 0 <= tc < cols and dist[tr][tc] != -1
    }


def _parse_cells(
    raw_cells: list,
    rows: int,
    cols: int,
) -> set[tuple[int, int]]:
    parsed: set[tuple[int, int]] = set()
    for cell in raw_cells:
        if isinstance(cell, dict):
            r = cell.get("r", cell.get("row"))
            c = cell.get("c", cell.get("col"))
        else:
            r, c = cell[0], cell[1]
        if r is not None and c is not None:
            r, c = int(r), int(c)
            if 0 <= r < rows and 0 <= c < cols:
                parsed.add((r, c))
    return parsed


def _extract_room_doors(
    grid_data: list[list[str]],
    room_links: list[dict[str, Any]],
) -> dict[str, set[tuple[int, int]]]:
    """
    For each room/staffroom blob, find its entry-point cells.

    Priority (per blob):
      1. Explicit "door" cells that are part of the blob OR directly adjacent to it.
      2. Explicit "entrance" (legacy) cells adjacent to the blob.
      3. Walkable cells adjacent to the blob boundary (implicit door).
    """
    if not grid_data or not grid_data[0]:
        return {}
    rows = len(grid_data)
    cols = len(grid_data[0])
    walkable = [[grid_data[r][c] in _WALKABLE for c in range(cols)] for r in range(rows)]

    result: dict[str, set[tuple[int, int]]] = {}
    seen: set[str] = set()

    for link in room_links:
        rid = link.get("record_id")
        if not rid or rid in seen:
            continue
        blob = _parse_cells(link.get("cells", []), rows, cols)
        if not blob:
            continue

        # 1) Look for explicit "door" cells inside or adjacent to the blob
        door_cells: set[tuple[int, int]] = set()
        for r, c in blob:
            if grid_data[r][c] == "door":
                door_cells.add((r, c))
            for nr, nc in ((r-1,c),(r+1,c),(r,c-1),(r,c+1)):
                if 0 <= nr < rows and 0 <= nc < cols and grid_data[nr][nc] == "door":
                    door_cells.add((nr, nc))

        if door_cells:
            ents = {p for p in door_cells if walkable[p[0]][p[1]]}
            if ents:
                result[rid] = ents
                seen.add(rid)
                continue

        # 2) Legacy: look for "entrance" cells adjacent to the blob
        legacy_ents: set[tuple[int, int]] = set()
        for r, c in blob:
            if grid_data[r][c] == "entrance":
                legacy_ents.add((r, c))
            for nr, nc in ((r-1,c),(r+1,c),(r,c-1),(r,c+1)):
                if 0 <= nr < rows and 0 <= nc < cols and grid_data[nr][nc] == "entrance":
                    legacy_ents.add((nr, nc))

        if legacy_ents:
            ents = {p for p in legacy_ents if walkable[p[0]][p[1]]}
            if ents:
                result[rid] = ents
                seen.add(rid)
                continue

        # 3) Implicit: walkable non-blob cells adjacent to the blob boundary
        imp: set[tuple[int, int]] = set()
        for r, c in blob:
            for nr, nc in ((r-1,c),(r+1,c),(r,c-1),(r,c+1)):
                if 0 <= nr < rows and 0 <= nc < cols:
                    if (nr, nc) not in blob and walkable[nr][nc]:
                        imp.add((r, c))
                        imp.add((nr, nc))
        ents = {p for p in imp if walkable[p[0]][p[1]]}
        if not ents:
            ents = blob
        ents = {p for p in ents if walkable[p[0]][p[1]]}
        if ents:
            result[rid] = ents
            seen.add(rid)

    return result


# ---------------------------------------------------------------------------
# Multi-floor Dijkstra (Building Level)
# ---------------------------------------------------------------------------

def compute_building_distances(
    floors: list[FloorData],
    stair_connections: list[StairConnection],
    floor_distance_penalty: int = DEFAULT_FLOOR_DISTANCE_PENALTY,
) -> dict[str, dict[str, int]]:
    """
    Compute cross-floor BFS/Dijkstra shortest path distances between every
    pair of linked rooms in a building using stair/lift connections.
    """
    res = compute_campus_distances(
        floors=floors,
        stair_connections=stair_connections,
        inter_building_distances=None,
        entrance_pair_distances=None,
        building_positions=None,
        floor_distance_penalty=floor_distance_penalty,
    )
    return res.get("allDistances", {})


# ---------------------------------------------------------------------------
# Full Campus Distance Engine (Cross-Floor + Cross-Building + Caching)
# ---------------------------------------------------------------------------

def compute_campus_distances(
    floors: list[FloorData],
    stair_connections: list[StairConnection],
    inter_building_distances: list[InterBuildingDistanceData] | None = None,
    entrance_pair_distances: list[EntrancePairDistanceData] | None = None,
    building_positions: dict[str, tuple[int, int]] | None = None,
    floor_distance_penalty: int = DEFAULT_FLOOR_DISTANCE_PENALTY,
) -> dict[str, Any]:
    """
    Compute full campus-wide shortest path distance matrices & route metadata:
      1. Same floor: direct BFS
      2. Cross-floor (same building): BFS to nearest stair/lift + penalty + BFS on dest floor
      3. Cross-building: BFS to nearest gate + per-gate-pair distance (or fallback) + BFS from dest gate

    Returns dict:
      {
        "staffRoomDistance": dict[staffroom_id, dict[room_id, int]],
        "roomRoomDistance":  dict[room_id, dict[room_id, int]],
        "allDistances":      dict[room_id, dict[room_id, int]],
        "allRoutes":         dict[room_id, dict[room_id, dict[str, Any]]],
      }
    """
    if not floors:
        return {"staffRoomDistance": {}, "roomRoomDistance": {}, "allDistances": {}, "allRoutes": {}}

    floor_data_map: dict[str, dict[str, Any]] = {}
    floor_building: dict[str, str]           = {}
    floor_levels: dict[str, int]             = {}
    floor_cell_scales: dict[str, float]      = {}
    room_record_types: dict[str, str]        = {}  # record_id → "staffroom" | "room"

    for fdata in floors:
        fid = fdata.get("floor_id", "")
        bid = fdata.get("building_id", "")
        floor_building[fid] = bid
        floor_levels[fid] = int(fdata.get("level", 0))
        floor_cell_scales[fid] = float(fdata.get("cell_size_m", 1.0))
        bdata = _get_floor_bfs_data(fdata)
        floor_data_map[fid] = bdata

        links = fdata.get("room_links") or []
        for link in links:
            rid = link.get("record_id")
            rtype = link.get("record_type", "room")
            if rid:
                room_record_types[rid] = rtype

    # Index stair connections
    stair_conn_by_id: dict[str, list[StairConnection]] = {}
    for sc in (stair_connections or []):
        stair_conn_by_id.setdefault(sc.stair_id, []).append(sc)

    # Auto-connect floors in the same building that share the same stair_id
    building_floors: dict[str, list[str]] = {}
    for fid, bid in floor_building.items():
        if bid:
            building_floors.setdefault(bid, []).append(fid)

    for bid, fids in building_floors.items():
        for i in range(len(fids)):
            for j in range(i + 1, len(fids)):
                f1, f2 = fids[i], fids[j]
                m1 = floor_data_map.get(f1, {}).get("stair_map", {})
                m2 = floor_data_map.get(f2, {}).get("stair_map", {})
                shared_sids = set(m1.keys()) & set(m2.keys())
                for sid in shared_sids:
                    existing = stair_conn_by_id.get(sid, [])
                    if not any(
                        (c.floor_a_id == f1 and c.floor_b_id == f2) or
                        (c.floor_a_id == f2 and c.floor_b_id == f1)
                        for c in existing
                    ):
                        l1 = floor_levels.get(f1, 0)
                        l2 = floor_levels.get(f2, 0)
                        stair_cost = max(1, abs(l1 - l2)) * floor_distance_penalty
                        stair_conn_by_id.setdefault(sid, []).append(
                            StairConnection(stair_id=sid, floor_a_id=f1, floor_b_id=f2, crossing_cost=stair_cost)
                        )

    # Index coarse building-pair distances: (bldg_a, bldg_b) → dist_cells
    inter_bldg_map: dict[tuple[str, str], float] = {}
    for ibd in (inter_building_distances or []):
        distance_m = ibd.distance_m if ibd.distance_m is not None else ibd.distance_cells
        inter_bldg_map[(ibd.building_a_id, ibd.building_b_id)] = distance_m
        inter_bldg_map[(ibd.building_b_id, ibd.building_a_id)] = distance_m

    # Index per-gate-pair distances: (fid_a, pos_a, fid_b, pos_b) → (dist_cells, label_a, label_b)
    gate_pair_map: dict[tuple, tuple[float, str | None, str | None]] = {}
    for epd in (entrance_pair_distances or []):
        distance_m = epd.distance_m if epd.distance_m is not None else epd.distance_cells * floor_cell_scales.get(epd.floor_a_id, 1.0)
        key_fwd = (epd.floor_a_id, epd.gate_a_pos, epd.floor_b_id, epd.gate_b_pos)
        key_rev = (epd.floor_b_id, epd.gate_b_pos, epd.floor_a_id, epd.gate_a_pos)
        gate_pair_map[key_fwd] = (distance_m, epd.gate_a_label, epd.gate_b_label)
        gate_pair_map[key_rev] = (distance_m, epd.gate_b_label, epd.gate_a_label)

    # Construct global Dijkstra search
    INF = float("inf")
    combined: dict[str, dict[str, int]] = {}
    all_routes: dict[str, dict[str, dict[str, Any]]] = {}

    all_room_nodes: list[tuple[str, str, str]] = [
        (floor_building[fid], fid, rid)
        for fid, bdata in floor_data_map.items()
        for rid in bdata["room_ents"]
    ]

    for src_bid, src_fid, src_rid in all_room_nodes:
        dist_djk: dict[tuple, float] = {}
        # meta: (route_type, stair_id, gate_a_pos, gate_a_label, gate_b_label, fallback_used)
        meta_djk: dict[tuple, tuple] = {}
        heap: list[tuple[float, tuple]] = []

        start = ("room", src_bid, src_fid, src_rid)
        dist_djk[start] = 0.0
        meta_djk[start] = ("same_floor", None, None, None, None, False)
        heapq.heappush(heap, (0.0, start))

        while heap:
            d, node = heapq.heappop(heap)
            if d > dist_djk.get(node, INF):
                continue

            curr_route, curr_stair, curr_ga_pos, curr_ga_lbl, curr_gb_lbl, curr_fb = meta_djk[node]
            ntype = node[0]

            if ntype == "room":
                _, bid, fid, rid = node
                bdata = floor_data_map.get(fid, {})

                # 1) Room → Room (same floor)
                for trid, tr_d in bdata.get("room_to_room", {}).get(rid, {}).items():
                    nb = ("room", bid, fid, trid)
                    nd = d + tr_d * floor_cell_scales.get(fid, 1.0)
                    if nd < dist_djk.get(nb, INF):
                        dist_djk[nb] = nd
                        meta_djk[nb] = (curr_route, curr_stair, curr_ga_pos, curr_ga_lbl, curr_gb_lbl, curr_fb)
                        heapq.heappush(heap, (nd, nb))

                # 2) Room → Stair (same floor)
                for sid, stair_d in bdata.get("room_to_stair", {}).get(rid, {}).items():
                    nb = ("stair", bid, fid, sid)
                    nd = d + stair_d * floor_cell_scales.get(fid, 1.0)
                    if nd < dist_djk.get(nb, INF):
                        dist_djk[nb] = nd
                        meta_djk[nb] = (curr_route, curr_stair, curr_ga_pos, curr_ga_lbl, curr_gb_lbl, curr_fb)
                        heapq.heappush(heap, (nd, nb))

                # 3) Room → Gate (same floor)
                for gpos, gate_d in bdata.get("room_to_gate", {}).get(rid, {}).items():
                    nb = ("gate", bid, fid, gpos)
                    nd = d + gate_d * floor_cell_scales.get(fid, 1.0)
                    if nd < dist_djk.get(nb, INF):
                        dist_djk[nb] = nd
                        meta_djk[nb] = (curr_route, curr_stair, curr_ga_pos, curr_ga_lbl, curr_gb_lbl, curr_fb)
                        heapq.heappush(heap, (nd, nb))

            elif ntype == "stair":
                _, bid, fid, sid = node
                bdata = floor_data_map.get(fid, {})

                # 1) Stair → Cross-floor stair (same building)
                for sc in stair_conn_by_id.get(sid, []):
                    if sc.floor_a_id == fid:
                        other_fid = sc.floor_b_id
                    elif sc.floor_b_id == fid:
                        other_fid = sc.floor_a_id
                    else:
                        continue
                    if other_fid not in floor_data_map or sid not in floor_data_map[other_fid]["stair_map"]:
                        continue

                    cost = sc.crossing_cost
                    if cost is None:
                        l1 = floor_levels.get(fid, 0)
                        l2 = floor_levels.get(other_fid, 0)
                        cost = max(1, abs(l1 - l2)) * floor_distance_penalty
                    cost_m = cost * (floor_cell_scales.get(fid, 1.0) + floor_cell_scales.get(other_fid, 1.0)) / 2

                    other_bid = floor_building.get(other_fid, bid)
                    nb = ("stair", other_bid, other_fid, sid)
                    nd = d + cost_m
                    new_route = "cross_building" if curr_route == "cross_building" else "cross_floor"
                    new_stair = curr_stair or sid
                    if nd < dist_djk.get(nb, INF):
                        dist_djk[nb] = nd
                        meta_djk[nb] = (new_route, new_stair, curr_ga_pos, curr_ga_lbl, curr_gb_lbl, curr_fb)
                        heapq.heappush(heap, (nd, nb))

                # 2) Stair → Room (same floor)
                for trid, stair_dists in bdata.get("room_to_stair", {}).items():
                    if sid in stair_dists:
                        nb = ("room", bid, fid, trid)
                        nd = d + stair_dists[sid] * floor_cell_scales.get(fid, 1.0)
                        if nd < dist_djk.get(nb, INF):
                            dist_djk[nb] = nd
                            meta_djk[nb] = (curr_route, curr_stair, curr_ga_pos, curr_ga_lbl, curr_gb_lbl, curr_fb)
                            heapq.heappush(heap, (nd, nb))

                # 3) Stair → Gate (same floor)
                for gpos, gate_d in bdata.get("stair_to_gate", {}).get(sid, {}).items():
                    nb = ("gate", bid, fid, gpos)
                    nd = d + gate_d * floor_cell_scales.get(fid, 1.0)
                    if nd < dist_djk.get(nb, INF):
                        dist_djk[nb] = nd
                        meta_djk[nb] = (curr_route, curr_stair, curr_ga_pos, curr_ga_lbl, curr_gb_lbl, curr_fb)
                        heapq.heappush(heap, (nd, nb))

            elif ntype == "gate":
                _, bid, fid, gpos = node
                bdata = floor_data_map.get(fid, {})
                src_gate_label = bdata.get("gate_labels", {}).get(gpos)

                # 1) Gate → Room (same floor)
                for trid, gate_dists in bdata.get("room_to_gate", {}).items():
                    if gpos in gate_dists:
                        nb = ("room", bid, fid, trid)
                        nd = d + gate_dists[gpos] * floor_cell_scales.get(fid, 1.0)
                        if nd < dist_djk.get(nb, INF):
                            dist_djk[nb] = nd
                            meta_djk[nb] = (curr_route, curr_stair, curr_ga_pos, curr_ga_lbl, curr_gb_lbl, curr_fb)
                            heapq.heappush(heap, (nd, nb))

                # 2) Gate → Stair (same floor)
                for sid, gate_dists in bdata.get("stair_to_gate", {}).items():
                    if gpos in gate_dists:
                        nb = ("stair", bid, fid, sid)
                        nd = d + gate_dists[gpos] * floor_cell_scales.get(fid, 1.0)
                        if nd < dist_djk.get(nb, INF):
                            dist_djk[nb] = nd
                            meta_djk[nb] = (curr_route, curr_stair, curr_ga_pos, curr_ga_lbl, curr_gb_lbl, curr_fb)
                            heapq.heappush(heap, (nd, nb))

                # 3) Gate → Gate (cross-building) — try per-gate-pair first
                for other_fid, other_bdata in floor_data_map.items():
                    other_bid = floor_building.get(other_fid, "")
                    if not other_bid or other_bid == bid:
                        continue  # cross-building only

                    for other_gpos in other_bdata.get("building_gates", set()):
                        key = (fid, gpos, other_fid, other_gpos)
                        if key in gate_pair_map:
                            ib_dist, ga_lbl, gb_lbl = gate_pair_map[key]
                            is_fb = False
                        elif (bid, other_bid) in inter_bldg_map:
                            ib_dist = inter_bldg_map[(bid, other_bid)]
                            is_fb = False
                            ga_lbl = src_gate_label
                            gb_lbl = other_bdata.get("gate_labels", {}).get(other_gpos)
                        else:
                            # No measured or explicitly configured building link: this gate pair is disconnected.
                            continue

                        nb = ("gate", other_bid, other_fid, other_gpos)
                        nd = d + ib_dist
                        if nd < dist_djk.get(nb, INF):
                            dist_djk[nb] = nd
                            meta_djk[nb] = (
                                "cross_building",
                                curr_stair,
                                gpos,          # gate_a_pos
                                ga_lbl,        # gate_a_label
                                gb_lbl,        # gate_b_label
                                curr_fb or is_fb,
                            )
                            heapq.heappush(heap, (nd, nb))

        # Harvest cross-room shortest distances and route metadata
        for target_node, total_d in dist_djk.items():
            if target_node[0] != "room":
                continue
            _, _, tgt_fid, tgt_rid = target_node
            if src_fid == tgt_fid and src_rid == tgt_rid:
                continue

            r_type, s_id, ga_pos, ga_lbl, gb_lbl, is_fb = meta_djk.get(
                target_node, ("same_floor", None, None, None, None, False)
            )
            total_d_m = float(total_d)
            total_d_cells = round(total_d_m / floor_cell_scales.get(src_fid, 1.0))
            combined.setdefault(src_rid, {})[tgt_rid] = total_d_cells

            if src_rid not in all_routes:
                all_routes[src_rid] = {}
            all_routes[src_rid][tgt_rid] = {
                "distance_cells": total_d_cells,
                "distance_m":     round(total_d_m, 3),
                "route_type":     r_type,
                "stair_id":       s_id,
                "gate_a_label":   ga_lbl,
                "gate_b_label":   gb_lbl,
                "fallback_used":  is_fb,
            }

    # Split into staffRoomDistance vs roomRoomDistance
    staff_room_distance: dict[str, dict[str, int]] = {}
    room_room_distance:  dict[str, dict[str, int]] = {}

    for src_id, targets in combined.items():
        src_type = room_record_types.get(src_id, "room")
        if src_type == "staffroom":
            staff_room_distance[src_id] = targets
        else:
            room_room_distance[src_id] = targets

    GLOBAL_CAMPUS_MATRIX_CACHE.update(
        staff_room_dist=staff_room_distance,
        room_room_dist=room_room_distance,
        all_dist=combined,
        all_routes=all_routes,
    )

    return {
        "staffRoomDistance": staff_room_distance,
        "roomRoomDistance":  room_room_distance,
        "allDistances":      combined,
        "allRoutes":         all_routes,
    }


def _update_combined(
    combined: dict[str, dict[str, int]],
    a: str,
    b: str,
    d: int,
) -> None:
    """Insert or improve distance d between rooms a and b (both directions)."""
    if a not in combined:
        combined[a] = {}
    if b not in combined[a] or combined[a][b] > d:
        combined[a][b] = d
    if b not in combined:
        combined[b] = {}
    if a not in combined[b] or combined[b][a] > d:
        combined[b][a] = d
