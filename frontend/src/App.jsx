import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import { AdminRoute, TeacherRoute, ProtectedRoute } from './components/ProtectedRoute'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Dashboard from './pages/Dashboard'
import Departments from './pages/Departments'
import Teachers from './pages/Teachers'
import Subjects from './pages/Subjects'
import Rooms from './pages/Rooms'
import ClassSections from './pages/ClassSections'
import Generate from './pages/Generate'
import TeacherDashboard from './pages/TeacherDashboard'
import Requests from './pages/Requests'
import CampusLayout from './pages/CampusLayout'
import AdminAnalytics from './pages/AdminAnalytics'

function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <Topbar />
      <main className="app-main">
        <Routes>
          {/* Admin-only routes */}
          <Route path="/"               element={<AdminRoute><Dashboard /></AdminRoute>} />
          <Route path="/departments"    element={<AdminRoute><Departments /></AdminRoute>} />
          <Route path="/teachers"       element={<AdminRoute><Teachers /></AdminRoute>} />
          <Route path="/subjects"       element={<AdminRoute><Subjects /></AdminRoute>} />
          <Route path="/rooms"          element={<AdminRoute><Rooms /></AdminRoute>} />
          <Route path="/class-sections" element={<AdminRoute><ClassSections /></AdminRoute>} />
          <Route path="/generate"       element={<AdminRoute><Generate /></AdminRoute>} />
          <Route path="/requests"       element={<AdminRoute><Requests /></AdminRoute>} />
          <Route path="/campus-layout"  element={<AdminRoute><CampusLayout /></AdminRoute>} />
          <Route path="/analytics"      element={<AdminRoute><AdminAnalytics /></AdminRoute>} />

          {/* Teacher-only route */}
          <Route path="/teacher-dashboard" element={<TeacherRoute><TeacherDashboard /></TeacherRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F4F3FB',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <div
            className="spinner"
            style={{
              width: '28px',
              height: '28px',
              borderWidth: '3px',
              borderColor: 'rgba(46,42,107,0.15)',
              borderTopColor: '#2E2A6B',
            }}
            role="status"
            aria-label="Loading"
          />
          <p style={{
            fontFamily: 'Figtree, sans-serif',
            fontSize: '0.875rem',
            color: 'var(--c-muted)',
          }}>
            Loading…
          </p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      {/* Public route */}
      <Route
        path="/login"
        element={
          user
            ? <Navigate to={user.role === 'teacher' ? '/teacher-dashboard' : '/'} replace />
            : <Login />
        }
      />

      {/* All authenticated routes go through the app shell */}
      <Route path="/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />
    </Routes>
  )
}
