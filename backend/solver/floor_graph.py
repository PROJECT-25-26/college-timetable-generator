"""
BFS room-distance computation for a single floor grid.

Public API
──────────
    compute_room_distances(grid_data, room_links) → dict[str, dict[str, int]]

Algorithm
─────────
For each room blob R that has a record_id and at least one cell:
  • Pick the first listed cell as the BFS seed for that room.
  • Run a 4-connected BFS over *walkable* cells starting from the seed.
  • Any other room's seed cell reached during the BFS produces an entry
    distance[R.record_id][R2.record_id] = steps.

Walkable cells
──────────────
  "corridor", "room", "staffroom", "stairs", "entrance"

NOT walkable (movement blocked):
  "wall", "empty"

The distinction matters for O3 (teacher travel): a teacher cannot walk
through a wall or an unpainted (empty) cell.

Complexity
──────────
  O(R × G)  where R = number of rooms with a record_id, G = grid cells.
  Typical college floor grids are well within 200×200 = 40 000 cells,
  so R ≤ 60 and total work ≈ 60 × 40 000 = 2.4 M steps — sub-millisecond.
"""

from __future__ import annotations

from collections import deque
from typing import Any

# Cell types that a person can walk through
_WALKABLE: frozenset[str] = frozenset(
    {"corridor", "room", "staffroom", "stairs", "entrance"}
)


def compute_room_distances(
    grid_data: list[list[str]],
    room_links: list[dict[str, Any]],
) -> dict[str, dict[str, int]]:
    """
    Compute BFS shortest-path distances (in cells) between every pair of
    room/staffroom blobs on a single floor.

    Parameters
    ----------
    grid_data
        Deserialized 2-D grid — ``grid_data[row][col]`` is a cell-type string.
        Must be a non-empty rectangular list.
    room_links
        Deserialized blob-to-record links.  Each entry is expected to have:
          ``record_id``  (str | None)  — DB id of the Room / StaffRoom record
          ``cells``      (list[[int, int]])  — [row, col] pairs belonging to blob

    Returns
    -------
    dict[str, dict[str, int]]
        ``result[room_id_A][room_id_B]`` = BFS distance in cells from A to B.
        Only entries where both rooms are reachable from each other appear.
        The mapping is symmetric: ``result[A][B] == result[B][A]``.
        A room is never present in its own inner dict (distance to self = 0,
        but that is trivial and not stored).
    """
    if not grid_data or not grid_data[0]:
        return {}

    rows = len(grid_data)
    cols = len(grid_data[0])

    # ── Build a fast walkability lookup ─────────────────────────────────────
    # Precompute a 2-D boolean array so BFS inner loop does O(1) checks.
    walkable: list[list[bool]] = [
        [grid_data[r][c] in _WALKABLE for c in range(cols)]
        for r in range(rows)
    ]

    # ── Extract room seeds ───────────────────────────────────────────────────
    # Collect (record_id, seed_row, seed_col) for every linked blob.
    seeds: list[tuple[str, int, int]] = []
    seen_ids: set[str] = set()

    for link in room_links:
        rid = link.get("record_id")
        if not rid:
            continue
        if rid in seen_ids:
            continue  # skip duplicate record links (shouldn't happen, but safe)
        cells = link.get("cells", [])
        if not cells:
            continue

        # Use first cell as representative; validate bounds.
        # Cells may be stored as {r, c} objects (from the JS painter) or as
        # [row, col] arrays.  Support both so the BFS is robust to serialisation
        # differences between painter versions.
        first_cell = cells[0]
        if isinstance(first_cell, dict):
            r0 = first_cell.get("r", first_cell.get("row"))
            c0 = first_cell.get("c", first_cell.get("col"))
        else:
            # Assume it's a sequence: [row, col]
            r0, c0 = first_cell[0], first_cell[1]

        if r0 is None or c0 is None:
            continue
        r0, c0 = int(r0), int(c0)
        if 0 <= r0 < rows and 0 <= c0 < cols:
            seeds.append((rid, r0, c0))
            seen_ids.add(rid)

    if len(seeds) < 2:
        # Need at least two rooms to produce any distance entry
        return {}

    # Build seed_cell → record_id for O(1) lookup inside BFS
    seed_pos: dict[tuple[int, int], str] = {
        (r, c): rid for rid, r, c in seeds
    }

    # ── BFS from each seed ───────────────────────────────────────────────────
    result: dict[str, dict[str, int]] = {}

    for src_id, sr, sc in seeds:
        # Skip if seed cell itself is not walkable (badly painted grid)
        if not walkable[sr][sc]:
            continue

        # Standard BFS — dist array initialised to -1
        dist: list[list[int]] = [[-1] * cols for _ in range(rows)]
        dist[sr][sc] = 0
        queue: deque[tuple[int, int]] = deque()
        queue.append((sr, sc))

        found: dict[str, int] = {}   # other_room_id → distance

        while queue:
            r, c = queue.popleft()
            d = dist[r][c]

            # Check if this cell is another room's seed
            pos = (r, c)
            if pos != (sr, sc):
                other_id = seed_pos.get(pos)
                if other_id is not None:
                    found[other_id] = d
                    # Don't stop — there may be more rooms reachable

            # Expand 4-connected neighbours
            for nr, nc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
                if 0 <= nr < rows and 0 <= nc < cols and walkable[nr][nc] and dist[nr][nc] == -1:
                    dist[nr][nc] = d + 1
                    queue.append((nr, nc))

        if found:
            result[src_id] = found

    return result
