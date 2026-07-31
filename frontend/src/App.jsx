import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Dashboard from './pages/Dashboard'
import Departments from './pages/Departments'
import Teachers from './pages/Teachers'
import Subjects from './pages/Subjects'
import Rooms from './pages/Rooms'
import ClassSections from './pages/ClassSections'
import Generate from './pages/Generate'

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <Topbar />
      <main className="app-main p-6">
        <div className="animate-fade-in">
          <Routes>
            <Route path="/"               element={<Dashboard />} />
            <Route path="/departments"    element={<Departments />} />
            <Route path="/teachers"       element={<Teachers />} />
            <Route path="/subjects"       element={<Subjects />} />
            <Route path="/rooms"          element={<Rooms />} />
            <Route path="/class-sections" element={<ClassSections />} />
            <Route path="/generate"       element={<Generate />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
