# College Timetable Scheduling & Campus Spatial Optimization System

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115.0-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Google OR-Tools](https://img.shields.io/badge/Google%20OR--Tools-CP--SAT-4285F4?style=flat-square&logo=google&logoColor=white)](https://developers.google.com/optimization)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com)

An automated college timetable generation and academic resource allocation platform. Powered by **Google OR-Tools CP-SAT** constraint satisfaction solver and a unique **2D Campus Spatial Graph Engine**, the system optimizes multi-department class schedules while minimizing physical walking transit distances across campus buildings and floors.

>  **Deep Dive**: For full mathematical formulations, relational schema specifications, and algorithmic architecture, refer to the [System Technical Documentation](documentation/TECHNICAL_DOCUMENTATION.md).  
>  **Visual Showcase Booklet**: For a complete multi-page walkthrough featuring high-resolution system screenshots, UI breakdowns, and module previews, view the **[Feature Showcase Digital Booklet (PDF)](documentation/Featureshowcase_Digital_Booklet.pdf)**.

---

##  Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Solver Specifications (Hard & Soft Constraints)](#-solver-specifications)
- [Technology Stack](#-technology-stack)
- [Directory Structure](#-directory-structure)
- [Quick Start with Docker](#-quick-start-with-docker)
- [Local Development Setup](#-local-development-setup)
- [Environment Variables](#-environment-variables)

---

## Overview

University and college timetabling is a notoriously NP-hard combinatorial problem involving hundreds of interdependent variables: faculty work hour caps, classroom and laboratory allocations, course-subject pairings, student section constraints, and physical transit across campus.

This system tackles these complexities by coupling an industrial **Constraint Programming (CP-SAT)** solver with a visual **Campus Floor Grid Painter**. It generates conflict-free schedules in seconds while intelligently grouping consecutive classes near teachers' previous rooms or staff cabins to eliminate campus transit fatigue.

---

## Key Features

### Automated Timetable Engine (Google OR-Tools CP-SAT)
- **Mathematical Constraint Modeling**: Formulates schedule variables across days, periods, sections, teachers, and rooms into integer/boolean constraints.
- **Continuous Multi-Period Lab Blocks**: Automatically packs laboratory courses into unbroken consecutive periods (e.g., 2-3 hour practical blocks).
- **Slot Locking & Incremental Re-Solving**: Lock approved slots and selectively re-solve remaining assignments without disrupting existing schedules.
- **Real-Time Solver Diagnostics**: Reports solve wall-time, branch-and-bound iterations, objective penalty scores, and infeasibility diagnoses.

### Spatial Campus Engine & 2D Floor Painter
- **Interactive Grid Painter**: Draw floor plans directly in the browser—define classrooms, labs, staff cabins, hallways, stairs, and elevators.
- **Campus Graph & BFS Routing**: Builds multi-floor coordinate graphs to compute exact shortest-path walking distances between any two rooms.
- **Transit-Aware Optimization**: Soft objective penalizes assigning back-to-back classes across distant buildings or floors for teachers.

### Teacher Portal
- **Teacher Self-Service Dashboard**: Dedicated schedule view for instructors with day/week views and room routing guides.


### Administrative Analytics & Resource Heatmaps
- **Room Utilization Metrics**: Identify bottlenecks, overbooked labs, and underutilized lecture halls.
- **Teacher Workload Distribution**: Visualize weekly hours, free days, and assignment balance across departments.
- **Campus Transit Insights**: Review teacher transit metrics and average walking distances per academic day.

### Bulk Data Operations & Multi-Format Exports
- **CSV Data Import**: Bulk ingest departments, teachers, subjects, rooms, and sections with pre-import validation and error logs.
- **Excel Export (.xlsx)**: Generates styled multi-sheet workbooks formatted for department boards via `openpyxl`.
- **PDF Timetables**: Generates publication-ready print matrices with headers and legends using `ReportLab`.

---

## Solver Specifications

The scheduler uses a rigorous mathematical formulation divided into strict hard constraints and weighted soft objectives:

### Hard Constraints (Must Satisfy)
| Code | Name | Description |
|------|------|-------------|
| **C1** | **Period Coverage** | Exactly satisfies required weekly lecture periods and continuous multi-period laboratory session blocks for each section. |
| **C2** | **Teacher No-Double-Booking** | Instructors can never be assigned to more than one section or room in the same time period. |
| **C3** | **Section No-Double-Booking** | A student section can attend only one subject/lecture/lab at any given time slot. |
| **C4** | **Room & Lab Exclusivity** | Classrooms and specialized laboratories can host at most one active class or practical session per period. |
| **C5** | **Teacher Unavailability** | Guaranteed zero assignments during instructor-declared blackout periods or leave slots. |
| **C6** | **Weekly Workload Cap** | Total weekly teaching periods per instructor cannot exceed their maximum contractual limit. |

### Soft Objectives (Optimized & Minimized)
| Code | Name | Objective & Penalty Formulation |
|------|------|---------------------------------|
| **O1** | **Balanced Weekly Spread** | Penalizes clustering all sessions of a subject on the same day; balances topics evenly through the week. |
| **O2** | **Teacher Subject Preference** | Rewards assigning instructors to preferred subjects based on preference ranking; penalizes assigning avoided subjects. |
| **O3** | **Campus Walking Distance** | Calculates BFS grid distance between consecutive periods and penalizes long-distance or cross-building transit. |

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite 5, Tailwind CSS 3 |
| **Backend** | Python 3.11+, FastAPI 0.115, SQLAlchemy 2.0 (AsyncIO), Pydantic v2, Uvicorn |
| **Optimization Engine** | Google OR-Tools 9.10+ (CP-SAT Solver) |
| **Database & ORM** | PostgreSQL 16, asyncpg driver, Alembic 1.14 migration runner |
| **Export Engines** | ReportLab (PDF generation), OpenPyXL (Excel workbooks) |
| **DevOps & Containers** | Docker, Docker Compose, Nginx Alpine |

---

## Directory Structure

```text
college-timetable/
├── docker-compose.yml          # Multi-container orchestration (DB, API, Frontend)
├── README.md                   # Project documentation
├── backend/
│   ├── Dockerfile              # Python 3.11 multi-stage container
│   ├── docker-entrypoint.sh    # Migration auto-runner & uvicorn entrypoint
│   ├── requirements.txt        # Backend dependencies
│   ├── alembic.ini             # Alembic migration configuration
│   ├── config.py               # Pydantic environment configuration
│   ├── database.py             # Async SQLAlchemy engine & session factory
│   ├── main.py                 # FastAPI application factory & router registration
│   ├── exporter.py             # PDF & Excel formatting and file generators
│   ├── alembic/                # Database migration versions
│   ├── models/
│   │   ├── orm.py              # SQLAlchemy database models
│   │   ├── schemas.py          # Pydantic request/response schemas
│   │   └── solver_schemas.py   # Specialized data contracts for CP-SAT solver
│   ├── routers/
│   │   ├── campus.py           # Campus, buildings, floors & pathfinding endpoints
│   │   ├── generate.py         # Solver dispatch & timetable generation endpoints
│   │   ├── timetables.py       # Timetable queries, locks & export endpoints
│   │   ├── teachers.py         # Teacher CRUD, preferences & unavailability
│   │   ├── subjects.py         # Course subjects & laboratory configurations
│   │   ├── rooms.py            # Rooms, labs & capacity management
│   │   ├── class_sections.py   # Student batches & section curriculum mapping
│   │   ├── departments.py      # Academic department hierarchies
│   │   ├── analytics.py        # Utilization rates & workload analytics
│   │   └── csv_utils.py        # Bulk CSV ingestion parsing utilities
│   └── solver/
│       ├── floor_graph.py      # Campus floor grid graph builder & BFS routing
│       ├── variables.py        # CP-SAT decision variables creation
│       ├── constraints.py      # Hard constraints implementation (C1-C6)
│       ├── objectives.py       # Soft optimization objective functions (O1-O3)
│       ├── locks.py            # Slot locking and manual pin logic
│       └── extractor.py        # Solver solution parser to DB slot records
├── frontend/
│   ├── Dockerfile              # Node build -> Nginx Alpine production image
│   ├── nginx.conf              # Reverse proxy & SPA routing configuration
│   ├── package.json            # NPM dependencies & build scripts
│   ├── vite.config.js          # Vite configuration with API proxy
│   ├── tailwind.config.js      # Custom theme styling & colors
│   ├── public/                 # Static assets
│   └── src/
│       ├── api/                # Axios API service clients
│       ├── components/         # Reusable UI widgets & modals (GridPainter, CsvImport, etc.)
│       ├── context/            # React context providers (Auth, Global state)
│       ├── hooks/              # Custom React hooks
│       ├── pages/              # Primary application views:
│       │   ├── Dashboard.jsx       # Main system overview
│       │   ├── Generate.jsx        # Timetable generation & solver control
│       │   ├── CampusLayout.jsx    # Campus building & 2D floor grid painter
│       │   ├── AdminAnalytics.jsx  # Utilization heatmaps & metrics
│       │   ├── TeacherDashboard.jsx# Teacher schedule & swap portal
│       │   ├── Requests.jsx        # Substitution & change requests review
│       │   ├── Teachers.jsx        # Faculty management
│       │   ├── Subjects.jsx        # Subjects & curriculum setup
│       │   ├── Rooms.jsx           # Classrooms & lab facilities
│       │   ├── ClassSections.jsx   # Student batches & assignments
│       │   └── Departments.jsx     # Department management
│       ├── utils/              # Client-side helper functions
│       └── workers/            # Web workers for background processing
└── documentation/
    ├── TECHNICAL_DOCUMENTATION.md             # System Architecture & Technical Specifications
    ├── Featureshowcase_Digital_Booklet.pdf     # 15-page visual showcase booklet with screenshots
    └── college-sys-arch.jpg                   # System architecture diagram
```

---

## Quick Start with Docker

The fastest way to run the entire system (Database, Backend API, and Frontend) is via Docker Compose:

### 1. Prerequisites
- [Docker](https://docs.docker.com/get-docker/) (v24+)
- [Docker Compose](https://docs.docker.com/compose/) (v2+)

### 2. Launch Containers
Clone the repository and run:

```bash
# Clone the repository
git clone https://github.com/your-username/college-timetable.git
cd college-timetable

# Build and start all services in detached mode
docker compose up --build -d
```

### 3. Verify Services
Once started, access the application in your browser:
- **Web Application**: [http://localhost:5173](http://localhost:5173)
- **API Documentation (Swagger UI)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **API Health Check**: [http://localhost:8000/health](http://localhost:8000/health)


---

## Local Development Setup

For active feature development and debugging, you can run the services natively:

### 1. Prerequisites
- **Python**: 3.11 or higher
- **Node.js**: 18.x or 20.x and `npm`
- **PostgreSQL**: 15 or 16 running locally (or in Docker)

---

### 2. Database Configuration
Ensure a PostgreSQL database exists. You can start one using Docker:

```bash
docker run -d \
  --name timetable_postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgrespassword \
  -e POSTGRES_DB=timetable_db \
  -p 5432:5432 \
  postgres:16-alpine
```

---

### 3. Backend Setup

```bash
cd backend

# Create and activate Python virtual environment
python -m venv venv

# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Create .env file (if not already present)
# Ensure DATABASE_URL matches your local PostgreSQL credentials:
# DATABASE_URL=postgresql+asyncpg://postgres:postgrespassword@localhost:5432/timetable_db

# Run database migrations
alembic upgrade head

# Start FastAPI development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`.

---

### 4. Frontend Setup

In a new terminal:

```bash
cd frontend

# Install npm dependencies
npm install

# Start Vite development server
npm run dev
```

The frontend will run at `http://localhost:5173` and automatically proxy `/api` requests to `http://localhost:8000`.

---

## Environment Variables

Backend settings can be configured via `backend/.env` or container environment variables:

| Variable | Default Value | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgrespassword@localhost:5432/timetable_db` | Async PostgreSQL database connection string |
| `APP_ENV` | `development` | Environment mode (`development`, `production`, `test`) |

---



