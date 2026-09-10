"""
College Timetable Generator — FastAPI Application Entry Point
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models.schemas import HealthResponse
from routers import campus, class_sections, departments, generate, rooms, subjects, teachers, timetables


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing special — Alembic manages migrations separately.
    yield
    # Shutdown


app = FastAPI(
    title="College Timetable Generator API",
    description="REST API for managing college timetable data and triggering generation.",
    version="0.1.0",
    lifespan=lifespan,
    # nginx always appends a trailing slash before proxying; keeping the
    # default redirect_slashes=True caused a 307 redirect loop:
    #   nginx: /buildings  →  /buildings/
    #   FastAPI: /buildings/  →  307 /buildings  →  nginx rewrites again …
    # All routes explicitly register both /path and /path/ variants so
    # FastAPI never needs to issue automatic slash redirects.
    redirect_slashes=False,
)

# ---------------------------------------------------------------------------
# CORS — allow Vite dev server and container origins
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(departments.router, prefix="/api/v1")
app.include_router(teachers.router,    prefix="/api/v1")
app.include_router(subjects.router,    prefix="/api/v1")
app.include_router(rooms.router,       prefix="/api/v1")
app.include_router(class_sections.router, prefix="/api/v1")
app.include_router(generate.router,    prefix="/api/v1")
app.include_router(timetables.router,  prefix="/api/v1")
app.include_router(campus.router,      prefix="/api/v1")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health():
    return {"status": "ok", "version": app.version}
