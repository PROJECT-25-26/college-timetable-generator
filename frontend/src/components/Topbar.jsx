import { useLocation } from 'react-router-dom'
import { Bell, Search } from 'lucide-react'

const ROUTE_TITLES = {
  '/':               'Dashboard',
  '/departments':    'Departments',
  '/teachers':       'Teachers',
  '/subjects':       'Subjects',
  '/rooms':          'Rooms',
  '/class-sections': 'Class Sections',
  '/generate':       'Generate Timetable',
}

export default function Topbar() {
  const { pathname } = useLocation()
  const title = ROUTE_TITLES[pathname] ?? 'College Timetable Generator'

  return (
    <header className="app-topbar flex items-center justify-between px-6 bg-gray-900/70 backdrop-blur border-b border-white/10">
      <h1 className="text-base font-semibold text-gray-100">{title}</h1>

      <div className="flex items-center gap-3">
        {/* Search placeholder */}
        <button
          id="topbar-search-btn"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-sm hover:bg-white/10 transition-colors"
        >
          <Search size={14} />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="hidden sm:inline text-xs bg-white/10 px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>

        {/* Notifications placeholder */}
        <button
          id="topbar-notifications-btn"
          className="relative p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 transition-colors"
        >
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-400" />
        </button>
      </div>
    </header>
  )
}
