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
      <main className="app-main p-6">
        <div className="animate-fade-in">
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
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={user ? <Navigate to={user.role === 'teacher' ? '/teacher-dashboard' : '/'} replace /> : <Login />} />

      {/* All authenticated routes go through the app shell */}
      <Route path="/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />
    </Routes>
  )
}
