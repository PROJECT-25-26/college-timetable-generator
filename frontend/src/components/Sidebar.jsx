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
  { to: '/class-sections', label: 'Class Sections', icon: Users },
  { to: '/campus-layout',  label: 'Campus Layout',  icon: Map },
  { to: '/generate',       label: 'Generate',       icon: Zap },
  { to: '/analytics',     label: 'Analytics',      icon: BarChart2 },
  { to: '/requests',       label: 'Requests',       icon: Inbox, badge: true },
]

const TEACHER_NAV = [
  { to: '/teacher-dashboard', label: 'My Schedule', icon: CalendarDays, end: true },
]

export default function Sidebar() {
  const { user, logout, requests } = useAuth()
  const pendingCount = requests.filter(r => r.status === 'pending').length

  const NAV_ITEMS = user?.role === 'admin' ? ADMIN_NAV : TEACHER_NAV

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const roleColor = user?.role === 'admin'
    ? 'from-brand-500 to-purple-600'
    : 'from-violet-500 to-indigo-600'

  return (
    <aside className="app-sidebar flex flex-col bg-gray-900 border-r border-white/10 h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
          <Zap size={16} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">TimeTable</p>
          <p className="text-xs text-gray-500 leading-tight">Generator</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {/* Section label */}
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
          {user?.role === 'admin' ? 'Administration' : 'My Account'}
        </p>

        {NAV_ITEMS.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                isActive
                  ? 'bg-brand-600/25 text-brand-300 border border-brand-500/30'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-transparent',
              ].join(' ')
            }
          >
            <Icon size={18} className="shrink-0" />
            <span className="flex-1">{label}</span>
            {badge && pendingCount > 0 && (
              <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User profile + Logout */}
      <div className="px-3 py-4 border-t border-white/10 shrink-0 space-y-3">
        {/* User card */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10">
          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${roleColor} flex items-center justify-center text-xs font-bold text-white shrink-0`}>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gray-200 truncate">{user?.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldCheck size={10} className={user?.role === 'admin' ? 'text-brand-400' : 'text-violet-400'} />
              <p className="text-[10px] text-gray-500 capitalize">{user?.role}</p>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          id="sidebar-logout-btn"
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all duration-200"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
