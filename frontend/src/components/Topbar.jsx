import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, LogOut, ShieldCheck, GraduationCap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import GlobalSearchModal from './GlobalSearchModal'

const ROUTE_TITLES = {
  '/':                    'Dashboard',
  '/departments':         'Departments',
  '/teachers':            'Teachers',
  '/subjects':            'Subjects',
  '/rooms':               'Rooms',
  '/class-sections':      'Class sections',
  '/generate':            'Generate timetable',
  '/requests':            'Schedule requests',
  '/teacher-dashboard':   'My schedule',
  '/campus-layout':       'Campus layout',
  '/analytics':           'Analytics',
}

export default function Topbar() {
  const { pathname }  = useLocation()
  const { user, logout } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const title = ROUTE_TITLES[pathname] ?? 'College timetable generator'

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

  return (
    <>
      <header className="app-topbar" role="banner">
        <h1 className="topbar-title">{title}</h1>

        <div className="topbar-actions">
          {/* Search trigger */}
          <button
            id="topbar-search-btn"
            onClick={() => setSearchOpen(true)}
            className="topbar-search-btn"
            aria-label="Open global search (Ctrl+K)"
          >
            <Search size={14} strokeWidth={2} aria-hidden="true" />
            <span className="hidden sm:inline" style={{ color: 'var(--c-muted)', fontSize: '0.875rem' }}>
              Search…
            </span>
            <kbd className="topbar-search-kbd hidden sm:inline" aria-hidden="true">
              Ctrl K
            </kbd>
          </button>

          <div className="topbar-divider hidden sm:block" aria-hidden="true" />

          {/* Role badge */}
          <div className="topbar-role-badge hidden sm:inline-flex" aria-label={`Signed in as ${roleLabel}`}>
            <RoleIcon size={12} strokeWidth={2} aria-hidden="true" />
            <span>{roleLabel}</span>
          </div>

          {/* Avatar */}
          <div
            className="topbar-avatar"
            title={user?.name}
            aria-label={`Account: ${user?.name}`}
          >
            {initials}
          </div>

          {/* Sign out */}
          <button
            id="topbar-logout-btn"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="topbar-icon-btn"
          >
            <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </header>

      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
