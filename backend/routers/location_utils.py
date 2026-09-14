import json
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models.orm import Building, Campus, Floor


async def get_locations_for_records(db: AsyncSession) -> dict[str, dict]:
    """
    Scans all floors with room_links and returns a dictionary mapping
    record_id -> location dict { floor_id, floor_name, building_id, building_name, cells, bounding_box }.
    """
    result = await db.execute(
        select(Floor, Building, Campus)
        .outerjoin(Building, Floor.building_id == Building.id)
        .outerjoin(Campus, Building.campus_id == Campus.id)
        .where(Floor.room_links.isnot(None))
    )
    rows = result.all()
    location_map = {}
    for floor, building, campus in rows:
        if not floor.room_links:
            continue
        try:
            links = json.loads(floor.room_links)
            for link in links:
                record_id = link.get("record_id")
                if record_id and link.get("cells"):
                    location_map[record_id] = {
                        "floor_id": floor.id,
                        "floor_name": floor.name,
                        "building_id": building.id if building else None,
                        "building_name": building.name if building else None,
                        "campus_name": campus.name if campus else None,
                        "cells": link.get("cells", []),
                        "bounding_box": link.get("bounding_box"),
                    }
        except Exception:
            continue
    return location_map
