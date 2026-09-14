import api from './client'

export const departmentsApi = {
  list:   ()           => api.get('/departments'),
  get:    (id)         => api.get(`/departments/${id}`),
  create: (data)       => api.post('/departments', data),
  update: (id, data)   => api.patch(`/departments/${id}`, data),
  remove: (id)         => api.delete(`/departments/${id}`),
  importCsv: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/departments/import-csv', fd, {
      headers: { 'Content-Type': undefined },
    })
  },
}

export const teachersApi = {
  list:               ()           => api.get('/teachers'),
  get:                (id)         => api.get(`/teachers/${id}`),
  create:             (data)       => api.post('/teachers', data),
  update:             (id, data)   => api.patch(`/teachers/${id}`, data),
  remove:             (id)         => api.delete(`/teachers/${id}`),
  updatePreferences:  (id, data)   => api.patch(`/teachers/${id}/subject-preferences`, data),
  importCsv: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/teachers/import-csv', fd, {
      headers: { 'Content-Type': undefined },
    })
  },
}

export const subjectsApi = {
  list:   ()           => api.get('/subjects'),
  get:    (id)         => api.get(`/subjects/${id}`),
  create: (data)       => api.post('/subjects', data),
  update: (id, data)   => api.patch(`/subjects/${id}`, data),
  remove: (id)         => api.delete(`/subjects/${id}`),
  importCsv: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/subjects/import-csv', fd, {
      headers: { 'Content-Type': undefined },
    })
  },
}

export const roomsApi = {
  list:   ()           => api.get('/rooms'),
  get:    (id)         => api.get(`/rooms/${id}`),
  create: (data)       => api.post('/rooms', data),
  update: (id, data)   => api.patch(`/rooms/${id}`, data),
  remove: (id)         => api.delete(`/rooms/${id}`),
  importCsv: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/rooms/import-csv', fd, {
      headers: { 'Content-Type': undefined },
    })
  },
}

export const classSectionsApi = {
  list:   ()           => api.get('/class-sections'),
  get:    (id)         => api.get(`/class-sections/${id}`),
  create: (data)       => api.post('/class-sections', data),
  update: (id, data)   => api.patch(`/class-sections/${id}`, data),
  remove: (id)         => api.delete(`/class-sections/${id}`),
  importCsv: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/class-sections/import-csv', fd, {
      headers: { 'Content-Type': undefined },
    })
  },
}

export const generateApi = {
  /**
   * POST /api/v1/generate-timetable
   * Accepts a TimetableRequest body; persists and returns TimetableOut.
   * Supports an AbortSignal for cancel-during-solve.
   * Timeout is set to 130s (solver cap = 60s + network headroom).
   */
  generate: (data, signal) =>
    api.post('/generate-timetable', data, { signal, timeout: 130_000 }),

  /**
   * POST /api/v1/generate-timetable — with locked_slots injected.
   * @param {object}   data        TimetableRequest payload (from /payload endpoint)
   * @param {object[]} lockedSlots Array of {section_id,subject_id,teacher_id,room_id,day_of_week,period_index}
   * @param {AbortSignal} signal   Optional abort signal
   */
  regenerate: (data, lockedSlots, signal) =>
    api.post(
      '/generate-timetable',
      { ...data, locked_slots: lockedSlots },
      { signal, timeout: 130_000 },
    ),

  /**
   * GET /api/v1/generate-timetable/payload
   * Returns a fully-assembled TimetableRequest from current DB state.
   */
  payload: (periodsPerDay = 8, workingDays = [0, 1, 2, 3, 4]) =>
    api.get('/generate-timetable/payload', {
      params: { periods_per_day: periodsPerDay, working_days: workingDays.join(',') },
    }),

  /** GET /api/v1/generate-timetable/health */
  health: () => api.get('/generate-timetable/health'),
}

export const timetablesApi = {
  /** GET /api/v1/timetables — summary list (no slots) */
  list: () => api.get('/timetables'),

  /** GET /api/v1/timetables/{id} — full run with all slots */
  get: (id) => api.get(`/timetables/${id}`),

  /** GET /api/v1/timetables/latest — most recent ok run */
  latest: () => api.get('/timetables/latest'),

  /** PATCH /api/v1/timetables/{id} — rename label */
  updateLabel: (id, label) => api.patch(`/timetables/${id}`, { label }),

  /** PUT /api/v1/timetables/{id}/slots — update all slots for a run */
  updateSlots: (id, slots) => api.put(`/timetables/${id}/slots`, { slots }),

  /** DELETE /api/v1/timetables/{id} — delete run + cascade slots */
  remove: (id) => api.delete(`/timetables/${id}`),
}

// ---------------------------------------------------------------------------
// Campus Layout — Campus / Building / Floor
// ---------------------------------------------------------------------------

export const campusApi = {
  /** GET /api/v1/campuses */
  list: () => api.get('/campuses'),
  /** GET /api/v1/campuses/{id} — includes nested buildings */
  get: (id) => api.get(`/campuses/${id}`),
  /** POST /api/v1/campuses */
  create: (data) => api.post('/campuses', data),
  /** PATCH /api/v1/campuses/{id} */
  update: (id, data) => api.patch(`/campuses/${id}`, data),
  /** DELETE /api/v1/campuses/{id} */
  remove: (id) => api.delete(`/campuses/${id}`),
  /** GET /api/v1/campuses/{campusId}/buildings */
  buildings: (campusId) => api.get(`/campuses/${campusId}/buildings`),
}

export const buildingsApi = {
  /** POST /api/v1/buildings */
  create: (data) => api.post('/buildings', data),
  /** GET /api/v1/buildings/{id} */
  get: (id) => api.get(`/buildings/${id}`),
  /** PATCH /api/v1/buildings/{id} */
  update: (id, data) => api.patch(`/buildings/${id}`, data),
  /** DELETE /api/v1/buildings/{id} */
  remove: (id) => api.delete(`/buildings/${id}`),
  /** GET /api/v1/buildings/{buildingId}/floors */
  floors: (buildingId) => api.get(`/buildings/${buildingId}/floors`),
}

export const floorsApi = {
  /** POST /api/v1/floors */
  create: (data) => api.post('/floors', data),
  /** GET /api/v1/floors/{id} — includes deserialized grid_data and room_links */
  get: (id) => api.get(`/floors/${id}`),
  /** PATCH /api/v1/floors/{id} — update metadata (name, level, scale) */
  update: (id, data) => api.patch(`/floors/${id}`, data),
  /** PUT /api/v1/floors/{id}/grid — save the full painted 2-D grid + room links */
  saveGrid: (id, gridData, roomLinks = null) =>
    api.put(`/floors/${id}/grid`, { grid_data: gridData, room_links: roomLinks }),
  /** DELETE /api/v1/floors/{id} */
  remove: (id) => api.delete(`/floors/${id}`),
}

export const staffroomsApi = {
  /** GET /api/v1/departments/staffrooms — list all staffrooms */
  list: () => api.get('/departments/staffrooms'),
  /** GET /api/v1/departments/staffrooms/{id} */
  get: (id) => api.get(`/departments/staffrooms/${id}`),
}
