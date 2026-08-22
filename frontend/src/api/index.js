import api from './client'

export const departmentsApi = {
  list:   ()           => api.get('/departments'),
  get:    (id)         => api.get(`/departments/${id}`),
  create: (data)       => api.post('/departments', data),
  update: (id, data)   => api.patch(`/departments/${id}`, data),
  remove: (id)         => api.delete(`/departments/${id}`),
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
}

export const roomsApi = {
  list:   ()           => api.get('/rooms'),
  get:    (id)         => api.get(`/rooms/${id}`),
  create: (data)       => api.post('/rooms', data),
  update: (id, data)   => api.patch(`/rooms/${id}`, data),
  remove: (id)         => api.delete(`/rooms/${id}`),
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
  trigger: (data)      => api.post('/generate', data),
}
