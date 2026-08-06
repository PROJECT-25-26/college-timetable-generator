/**
 * ProtectedRoute — redirects to /login if not authenticated.
 * AdminRoute    — additionally redirects teachers away from admin pages.
 */

import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Require any authenticated user */
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null   // wait for localStorage rehydration

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

/** Require admin role; redirect teachers to their dashboard */
export function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user.role !== 'admin') {
    return <Navigate to="/teacher-dashboard" replace />
  }

  return children
}

/** Require teacher role; redirect admin to admin dashboard */
export function TeacherRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user.role !== 'teacher') {
    return <Navigate to="/" replace />
  }

  return children
}
