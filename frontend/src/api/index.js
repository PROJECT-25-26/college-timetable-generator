import api from './client'

export const departmentsApi = {
  list:   ()           => api.get('/departments'),
  get:    (id)         => api.get(`/departments/${id}`),
  create: (data)       => api.post('/departments', data),
  update: (id, data)   => api.patch(`/departments/${id}`, data),
  remove: (id)         => api.delete(`/departments/${id}`),
}

export const teachersApi = {
  list:   ()           => api.get('/teachers'),
  get:    (id)         => api.get(`/teachers/${id}`),
  create: (data)       => api.post('/teachers', data),
  update: (id, data)   => api.patch(`/teachers/${id}`, data),
  remove: (id)         => api.delete(`/teachers/${id}`),
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
}

export const generateApi = {
  trigger: (data)      => api.post('/generate', data),
}
