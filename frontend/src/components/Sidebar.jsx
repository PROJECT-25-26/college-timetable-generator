import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  GraduationCap,
  BookOpen,
  DoorOpen,
  Users,
  Zap,
  Inbox,
  CalendarDays,
  LogOut,
  ShieldCheck,
  Map,
  BarChart2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const ADMIN_NAV = [
  { to: '/',               label: 'Dashboard',      icon: LayoutDashboard, end: true },
  { to: '/departments',    label: 'Departments',    icon: Building2 },
  { to: '/subjects',       label: 'Subjects',       icon: BookOpen },
  { to: '/teachers',       label: 'Teachers',       icon: GraduationCap },
  { to: '/rooms',          label: 'Rooms',          icon: DoorOpen },
  { to: '/class-sections', label: 'Class sections', icon: Users },
  { to: '/campus-layout',  label: 'Campus layout',  icon: Map },
  { to: '/generate',       label: 'Generate',       icon: Zap },
  { to: '/analytics',      label: 'Analytics',      icon: BarChart2 },
  { to: '/requests',       label: 'Requests',       icon: Inbox, badge: true },
]

const TEACHER_NAV = [
  { to: '/teacher-dashboard', label: 'My schedule', icon: CalendarDays, end: true },
]

export default function Sidebar() {
  const { user, logout, requests } = useAuth()
  const pendingCount = requests.filter(r => r.status === 'pending').length

  const NAV_ITEMS = user?.role === 'admin' ? ADMIN_NAV : TEACHER_NAV

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const isAdmin = user?.role === 'admin'

  return (
    <aside className="app-sidebar">
      {/* Brand logo */}
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <img
          src="/logo.jpg"
          alt="RouteTable"
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '9px',
            objectFit: 'contain',
            background: '#FFFFFF',
            padding: '2px',
            flexShrink: 0,
          }}
        />
        <div>
          <p className="sidebar-logo-name" style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.15 }}>RouteTable</p>
          <p className="sidebar-logo-sub" style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.1 }}>Timetable Generator</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        <p className="sidebar-section-label">
          {isAdmin ? 'Administration' : 'My account'}
        </p>

        {NAV_ITEMS.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              'sidebar-nav-item' + (isActive ? ' active' : '')
            }
            aria-current={undefined}
          >
            <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {badge && pendingCount > 0 && (
              <span className="sidebar-nav-badge" aria-label={`${pendingCount} pending`}>
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="sidebar-user">
        <div className="sidebar-user-card">
          <div className={`sidebar-avatar${isAdmin ? '' : ' teacher'}`} aria-hidden="true">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="sidebar-user-name">{user?.name}</p>
            <div className="sidebar-user-role">
              <ShieldCheck size={10} aria-hidden="true" />
              <span>{user?.role}</span>
            </div>
          </div>
        </div>

        <button
          id="sidebar-logout-btn"
          onClick={logout}
          className="sidebar-logout-btn"
          aria-label="Sign out"
        >
          <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
