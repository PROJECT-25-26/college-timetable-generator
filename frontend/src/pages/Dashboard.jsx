import { useEffect, useState } from 'react'
import { Building2, GraduationCap, BookOpen, DoorOpen, Users, Zap } from 'lucide-react'
import axios from 'axios'

const STAT_CARDS = [
  { label: 'Departments',    icon: Building2,      key: 'departments',    color: 'from-brand-500 to-brand-700',   route: '/departments'    },
  { label: 'Teachers',       icon: GraduationCap,  key: 'teachers',       color: 'from-violet-500 to-purple-700', route: '/teachers'       },
  { label: 'Subjects',       icon: BookOpen,       key: 'subjects',       color: 'from-sky-500 to-blue-700',      route: '/subjects'       },
  { label: 'Rooms',          icon: DoorOpen,       key: 'rooms',          color: 'from-emerald-500 to-green-700', route: '/rooms'          },
  { label: 'Class Sections', icon: Users,          key: 'class-sections', color: 'from-amber-500 to-orange-600',  route: '/class-sections' },
]

export default function Dashboard() {
  const [counts, setCounts] = useState({})

  useEffect(() => {
    STAT_CARDS.forEach(({ key }) => {
      axios.get(`/api/v1/${key}`)
        .then(res => setCounts(prev => ({ ...prev, [key]: res.data.length })))
        .catch(() => setCounts(prev => ({ ...prev, [key]: '—' })))
    })
  }, [])

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Hero */}
      <div className="glass-card p-8">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <Zap size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold gradient-text">College Timetable Generator</h2>
            <p className="text-gray-400 text-sm mt-0.5">Automated, collision-free weekly schedules</p>
          </div>
        </div>
        <p className="text-gray-400 text-sm leading-relaxed max-w-2xl">
          Add your departments, teachers, subjects, rooms, and class sections below.
          Once all data is in place, use the <strong className="text-gray-200">Generate</strong> page
          to produce a constraint-satisfying timetable automatically.
        </p>
      </div>

      {/* Stat cards */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {STAT_CARDS.map(({ label, icon: Icon, key, color }) => (
            <div key={key} className="glass-card p-5 flex flex-col gap-3 hover:bg-white/10 transition-colors cursor-pointer group">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}>
                <Icon size={18} className="text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white tabular-nums">
                  {counts[key] ?? <span className="inline-block w-6 h-5 bg-white/10 rounded animate-pulse" />}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Getting started */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Getting Started</h3>
        <ol className="space-y-3">
          {[
            'Create Departments (e.g. Computer Science, Mathematics)',
            'Add Teachers with subject preferences and availability',
            'Define Subjects with weekly period requirements',
            'Add Rooms — mark labs separately',
            'Create Class Sections and assign subjects',
            'Hit Generate to produce the timetable',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-gray-400">
              <span className="shrink-0 w-6 h-6 rounded-full bg-brand-600/30 text-brand-300 text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
