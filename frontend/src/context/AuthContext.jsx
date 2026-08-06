/**
 * AuthContext — manages authentication for Admin and Teacher roles.
 *
 * Credentials (prototype):
 *   Admin   → username: "admin"      password: "admin123"
 *   Teacher → username: <email prefix before @>   password: "teacher123"
 *
 * Change requests are stored in memory here so both TeacherDashboard
 * and the Admin Requests page share the same list.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const ADMIN_CREDENTIALS = { username: 'admin', password: 'admin123' }
const TEACHER_PASSWORD   = 'teacher123'
const STORAGE_KEY        = 'timetable_auth'

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)   // { id, name, email, role, department_id }
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])   // shared change-request list

  // Rehydrate session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch { /* ignore */ }
    }
    setLoading(false)
  }, [])

  /** Login as admin or teacher. Returns { ok: true } or { ok: false, error: string } */
  const login = useCallback(async (username, password) => {
    // ── Admin path ──────────────────────────────────────────────────────────
    if (
      username.trim().toLowerCase() === ADMIN_CREDENTIALS.username &&
      password === ADMIN_CREDENTIALS.password
    ) {
      const adminUser = { id: 'admin', name: 'Administrator', email: 'admin@college.edu', role: 'admin' }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(adminUser))
      setUser(adminUser)
      return { ok: true }
    }

    // ── Teacher path ─────────────────────────────────────────────────────────
    if (password !== TEACHER_PASSWORD) {
      return { ok: false, error: 'Invalid username or password.' }
    }

    try {
      const { data: teachers } = await axios.get('/api/v1/teachers')
      // Match on email prefix (part before @)
      const match = teachers.find(t => {
        if (!t.email) return false
        const prefix = t.email.split('@')[0].toLowerCase()
        return prefix === username.trim().toLowerCase()
      })

      if (!match) {
        return { ok: false, error: 'No teacher account found for that username.' }
      }

      const teacherUser = {
        id: match.id,
        name: match.name,
        email: match.email,
        role: 'teacher',
        department_id: match.department_id,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(teacherUser))
      setUser(teacherUser)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not reach the server. Please try again.' }
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }, [])

  // ── Change-request helpers ────────────────────────────────────────────────
  const addRequest = useCallback((req) => {
    setRequests(prev => [
      {
        id: Date.now().toString(),
        teacherId:   req.teacherId,
        teacherName: req.teacherName,
        day:         req.day,
        period:      req.period,
        reason:      req.reason,
        status:      'pending',
        submittedAt: new Date().toISOString(),
      },
      ...prev,
    ])
  }, [])

  const updateRequestStatus = useCallback((id, status) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, requests, addRequest, updateRequestStatus }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
