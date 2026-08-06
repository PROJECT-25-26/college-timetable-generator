"""
Generate router — stub for the timetable generation endpoint.
The actual algorithm will be implemented in a later prompt.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/generate", tags=["Generate"])


class GenerateRequest(BaseModel):
    periods_per_day: int = 8
    working_days: list[int] = [0, 1, 2, 3, 4]  # Mon–Fri


class GenerateResponse(BaseModel):
    status: str
    message: str


@router.post("/", response_model=GenerateResponse)
async def trigger_generation(payload: GenerateRequest):
    """
    Stub — will invoke the constraint-solving algorithm and return
    a job ID for the frontend Web Worker to poll/stream.
    """
    return {
        "status": "not_implemented",
        "message": "Generation algorithm not yet implemented. Coming in a later phase.",
    }
