import axios from 'axios'

/**
 * Shared axios instance — all requests go through /api/v1.
 * Vite's dev proxy forwards these to FastAPI on port 8000.
 */
const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Response interceptor — surface error.detail from FastAPI
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const detail = err.response?.data?.detail
    if (detail) {
      err.message = Array.isArray(detail)
        ? detail.map((d) => d.msg).join('; ')
        : detail
    }
    return Promise.reject(err)
  }
)

export default api
