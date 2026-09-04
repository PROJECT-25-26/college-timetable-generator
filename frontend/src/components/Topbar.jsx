import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Bell, Search, LogOut, ShieldCheck, GraduationCap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import GlobalSearchModal from './GlobalSearchModal'

const ROUTE_TITLES = {
  '/':                    'Dashboard',
  '/departments':         'Departments',
  '/teachers':            'Teachers',
  '/subjects':            'Subjects',
  '/rooms':               'Rooms',
  '/class-sections':      'Class Sections',
  '/generate':            'Generate Timetable',
  '/requests':            'Schedule Requests',
  '/teacher-dashboard':   'My Schedule',
}

export default function Topbar() {
  const { pathname }  = useLocation()
  const { user, logout } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const title = ROUTE_TITLES[pathname] ?? 'College Timetable Generator'

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const isAdmin   = user?.role === 'admin'
  const roleLabel = isAdmin ? 'Admin' : 'Teacher'
  const RoleIcon  = isAdmin ? ShieldCheck : GraduationCap
  const roleColor = isAdmin ? 'text-brand-400' : 'text-violet-400'
  const roleBg    = isAdmin ? 'from-brand-500 to-purple-600' : 'from-violet-500 to-indigo-600'

  return (
    <>
      <header className="app-topbar flex items-center justify-between px-6 bg-gray-900/70 backdrop-blur border-b border-white/10">
        <h1 className="text-base font-semibold text-gray-100">{title}</h1>

        <div className="flex items-center gap-3">
          {/* Search Button */}
          <button
            id="topbar-search-btn"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-sm hover:bg-white/10 hover:text-gray-200 transition-colors"
          >
            <Search size={14} />
            <span className="hidden sm:inline">Search schedule / free slots…</span>
            <kbd className="hidden sm:inline text-xs bg-white/10 px-1.5 py-0.5 rounded text-gray-300 font-mono">
              Ctrl+K
            </kbd>
          </button>

          {/* Notifications placeholder — admin only */}
          {isAdmin && (
            <button
              id="topbar-notifications-btn"
              className="relative p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 transition-colors"
            >
              <Bell size={16} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-400" />
            </button>
          )}

          {/* Divider */}
          <div className="h-6 w-px bg-white/10 hidden sm:block" />

          {/* Role badge + avatar */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
              <RoleIcon size={12} className={roleColor} />
              <span className={`text-xs font-medium ${roleColor}`}>{roleLabel}</span>
            </div>

            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${roleBg} flex items-center justify-center text-xs font-bold text-white select-none`}>
              {initials}
            </div>
          </div>

          {/* Quick logout */}
          <button
            id="topbar-logout-btn"
            onClick={logout}
            title="Sign out"
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-500 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
