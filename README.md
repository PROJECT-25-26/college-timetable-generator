# College Timetable Generator

Automated, collision-free weekly timetable generator for colleges.

## Prerequisites

| Tool             | Version | Purpose                      |
|------------------|---------|------------------------------|
| Docker & Compose | 20.10+  | Containerized deployment     |
| Python (Optional)| 3.11+   | Local backend development    |
| Node.js (Optional)| 18+    | Local frontend development   |

---

## Quick Start with Docker (Recommended)

Run the entire application (PostgreSQL + FastAPI backend + React frontend) with a single command:

```powershell
docker compose up --build
```

- **Frontend**: http://localhost:5173
- **FastAPI API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health
- **PostgreSQL**: `localhost:5432` (`postgres` / `postgrespassword` / `timetable_db`)

To stop all containers:
```powershell
docker compose down
```

---

## Local Development (Without Docker)

### 1. Database Setup
Ensure PostgreSQL is running locally and create the database:
```sql
CREATE DATABASE timetable_db;
```

### 2. Backend Setup
```powershell
cd backend

# Create & activate virtual environment
python -m venv venv
venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment (.env)
# DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/timetable_db

# Run database migrations
alembic upgrade head

# Start API server
uvicorn main:app --reload --port 8000
```

### 3. Frontend Setup
```powershell
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

App available at: http://localhost:5173

---

## Project Structure

```
college-timetable/
├── docker-compose.yml       # Orchestrates DB, Backend, and Frontend containers
├── backend/
│   ├── Dockerfile           # Python 3.13 image with Alembic migration entrypoint
│   ├── docker-entrypoint.sh # Run migrations + launch Uvicorn
│   ├── alembic/            # Database migrations
│   ├── models/
│   │   ├── orm.py          # SQLAlchemy table definitions
│   │   └── schemas.py      # Pydantic request/response schemas
│   ├── routers/            # FastAPI route handlers
│   ├── database.py         # Async engine + session
│   └── main.py             # FastAPI app entry point
│
├── frontend/
│   ├── Dockerfile           # Multi-stage build (Node build → Nginx serve)
│   ├── nginx.conf           # Reverse proxy /api/ to backend:8000
│   ├── src/
│   │   ├── api/            # Axios wrappers per entity
│   │   ├── components/     # Shared UI components
│   │   ├── pages/          # Route-level pages
│   │   └── workers/        # Web Worker for generation
│   └── vite.config.js
│
└── shared/
    └── schema.md           # Entity field contracts (frontend ↔ backend)
```

---

## API Reference

Base URL: `/api/v1`

| Resource         | Endpoints                                   |
|------------------|---------------------------------------------|
| Departments      | `GET/POST /departments`, `GET/PATCH/DELETE /departments/{id}` |
| Teachers         | `GET/POST /teachers`, `GET/PATCH/DELETE /teachers/{id}` |
| Subjects         | `GET/POST /subjects`, `GET/PATCH/DELETE /subjects/{id}` |
| Rooms            | `GET/POST /rooms`, `GET/PATCH/DELETE /rooms/{id}` |
| Class Sections   | `GET/POST /class-sections`, `GET/PATCH/DELETE /class-sections/{id}` |
| Generate         | `POST /generate` (stub — algorithm TBD) |
