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

  /** GET /api/v1/timetables/{id}/export/pdf — download PDF export */
  exportPdf: (id, scope = 'master', entityId = null) =>
    api.get(`/timetables/${id}/export/pdf`, {
      params: { scope, entity_id: entityId || undefined },
      responseType: 'blob',
    }),

  /** GET /api/v1/timetables/{id}/export/excel — download Excel export */
  exportExcel: (id, scope = 'master', entityId = null) =>
    api.get(`/timetables/${id}/export/excel`, {
      params: { scope, entity_id: entityId || undefined },
      responseType: 'blob',
    }),

  /** GET /api/v1/timetables/{id}/search — search teacher/room schedules or free slots */
  search: (id = 'latest', params = {}) =>
    api.get(`/timetables/${id}/search`, { params }),
}

