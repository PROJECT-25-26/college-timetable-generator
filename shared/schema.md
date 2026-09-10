# Entity Schema Contracts

This document is the canonical reference for all entity field names shared between the FastAPI backend and the React frontend. Both sides must use these exact field names.

---

## Department

| Field        | Type     | Notes                          |
|--------------|----------|--------------------------------|
| `id`         | `string` | UUID, server-generated         |
| `name`       | `string` | max 120 chars, unique          |
| `code`       | `string` | max 20 chars, unique           |
| `created_at` | `string` | ISO 8601 datetime              |
| `updated_at` | `string` | ISO 8601 datetime              |

---

## StaffRoom

| Field           | Type     | Notes                          |
|-----------------|----------|--------------------------------|
| `id`            | `string` | UUID                           |
| `department_id` | `string` | FK → Department                |
| `label`         | `string` | Room label / identifier        |
| `created_at`    | `string` | ISO 8601 datetime              |

---

## Subject

| Field                     | Type               | Notes                                          |
|---------------------------|--------------------|------------------------------------------------|
| `id`                      | `string`           | UUID                                           |
| `name`                    | `string`           | max 120 chars                                  |
| `code`                    | `string`           | max 20 chars, unique                           |
| `lab`                     | `boolean`          | default false — true if this is a lab subject  |
| `weekly_periods`          | `integer`          | total weekly periods (auto-computed for labs)  |
| `lab_consecutive_periods` | `integer \| null`  | lab only — consecutive periods per session     |
| `weekly_lab_sessions`     | `integer \| null`  | lab only — number of lab sessions per week     |
| `created_at`              | `string`           | ISO 8601 datetime                              |
| `updated_at`              | `string`           | ISO 8601 datetime                              |

---

## Teacher

| Field                  | Type               | Notes                           |
|------------------------|--------------------|---------------------------------|
| `id`                   | `string`           | UUID                            |
| `department_id`        | `string \| null`   | FK → Department (optional)      |
| `name`                 | `string`           | max 120 chars                   |
| `email`                | `string \| null`   | unique if provided              |
| `max_periods_per_week` | `integer`          | default 25, min 1               |
| `subject_links`        | `TeacherSubject[]` | nested                          |
| `unavailable_slots`    | `UnavailableSlot[]`| nested                          |
| `created_at`           | `string`           | ISO 8601 datetime               |
| `updated_at`           | `string`           | ISO 8601 datetime               |

### TeacherSubject (nested)

| Field             | Type      | Notes               |
|-------------------|-----------|---------------------|
| `subject_id`      | `string`  | FK → Subject        |
| `preference_rank` | `integer` | 1 = most preferred  |

### UnavailableSlot (nested)

| Field          | Type      | Notes                  |
|----------------|-----------|------------------------|
| `day_of_week`  | `integer` | 0 = Monday … 6 = Sunday |
| `period_index` | `integer` | 0-based within day     |

---

## Room

| Field       | Type                              | Notes                            |
|-------------|-----------------------------------|----------------------------------|
| `id`        | `string`                          | UUID                             |
| `name`      | `string`                          | max 120 chars                    |
| `code`      | `string`                          | max 20 chars, unique             |
| `room_type` | `"classroom" \| "lab" \| "seminar"` | default `"classroom"`          |
| `capacity`  | `integer`                         | default 60, min 1                |
| `created_at`| `string`                          | ISO 8601 datetime                |
| `updated_at`| `string`                          | ISO 8601 datetime                |

---

## ClassSection

| Field           | Type                    | Notes                                                    |
|-----------------|-------------------------|----------------------------------------------------------|
| `id`            | `string`                | UUID                                                     |
| `name`          | `string`                | max 120 chars                                            |
| `code`          | `string`                | max 20 chars, unique                                     |
| `strength`      | `integer`               | student count, min 1                                     |
| `homeroom_id`   | `string \| null`        | FK → Room (classroom or seminar only; labs are dynamic)  |
| `homeroom`      | `RoomOut \| null`       | nested Room object                                       |
| `subject_links` | `SectionSubject[]`      | nested                                                   |
| `created_at`    | `string`                | ISO 8601 datetime                                        |
| `updated_at`    | `string`                | ISO 8601 datetime                                        |

### SectionSubject (nested)

| Field                    | Type           | Notes                                |
|--------------------------|----------------|--------------------------------------|
| `subject_id`             | `string`       | FK → Subject                         |
| `weekly_periods_override`| `integer\|null`| overrides Subject.weekly_periods      |

---

## API Conventions

- All list endpoints return arrays sorted alphabetically by `name`.
- Create → `POST /api/v1/<resource>` → 201
- Read one → `GET /api/v1/<resource>/{id}` → 200 or 404
- Update → `PATCH /api/v1/<resource>/{id}` → 200 (partial, exclude_none)
- Delete → `DELETE /api/v1/<resource>/{id}` → 200 `{ "message": "..." }`
- Errors → `{ "detail": "..." }` or `{ "detail": [{ "msg": "..." }] }`

---

## Campus Layout (Phase 7a/7b)

### Campus

| Field         | Type            | Notes                          |
|---------------|-----------------|--------------------------------|
| `id`          | `string`        | UUID                           |
| `name`        | `string`        | max 120 chars, unique          |
| `description` | `string\|null`  | optional                       |
| `created_at`  | `string`        | ISO 8601                       |
| `updated_at`  | `string`        | ISO 8601                       |

**Extra endpoint:** `GET /api/v1/campuses/{id}/buildings` → `BuildingOut[]`

---

### Building

| Field        | Type     | Notes                                            |
|--------------|----------|--------------------------------------------------|
| `id`         | `string` | UUID                                             |
| `campus_id`  | `string` | FK → Campus                                      |
| `name`       | `string` | max 120 chars                                    |
| `code`       | `string` | max 20 chars, unique per campus                  |
| `pos_x`      | `integer`| x-position on campus map (px)                   |
| `pos_y`      | `integer`| y-position on campus map (px)                   |
| `width`      | `integer`| box width on campus map (px, min 40)            |
| `height`     | `integer`| box height on campus map (px, min 30)           |
| `color`      | `string` | hex color, max 9 chars (e.g. `#6366f1`)         |
| `floors`     | `FloorSummary[]` | nested (id, name, level)               |
| `created_at` | `string` | ISO 8601                                         |
| `updated_at` | `string` | ISO 8601                                         |

**Extra endpoint:** `GET /api/v1/buildings/{id}/floors` → `FloorOut[]`

---

### Floor

| Field          | Type               | Notes                                           |
|----------------|--------------------|-------------------------------------------------|
| `id`           | `string`           | UUID                                            |
| `building_id`  | `string`           | FK → Building                                   |
| `name`         | `string`           | max 120 chars                                   |
| `level`        | `integer`          | 0 = ground, -1 = basement, etc.                 |
| `grid_rows`    | `integer`          | 5–200                                           |
| `grid_cols`    | `integer`          | 5–200                                           |
| `cell_size_m`  | `float`            | real-world scale — metres per cell              |
| `grid_data`    | `string[][]|null`  | 2-D array of CellType; null until first save    |
| `created_at`   | `string`           | ISO 8601                                        |
| `updated_at`   | `string`           | ISO 8601                                        |

**CellType values:** `"empty"` \| `"wall"` \| `"corridor"` \| `"stairs"` \| `"entrance"`

**Extra endpoint:** `PUT /api/v1/floors/{id}/grid` — body: `{ "grid_data": string[][] }` → validates dimensions + cell values, persists JSON.
