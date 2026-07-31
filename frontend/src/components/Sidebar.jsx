import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  GraduationCap,
  BookOpen,
  DoorOpen,
  Users,
  Zap,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/',              label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/departments',   label: 'Departments',    icon: Building2 },
  { to: '/teachers',      label: 'Teachers',       icon: GraduationCap },
  { to: '/subjects',      label: 'Subjects',       icon: BookOpen },
  { to: '/rooms',         label: 'Rooms',          icon: DoorOpen },
  { to: '/class-sections',label: 'Class Sections', icon: Users },
  { to: '/generate',      label: 'Generate',       icon: Zap },
]

export default function Sidebar() {
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
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
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
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10 shrink-0">
        <p className="text-xs text-gray-600 text-center">v0.1.0 · prototype</p>
      </div>
    </aside>
  )
}
