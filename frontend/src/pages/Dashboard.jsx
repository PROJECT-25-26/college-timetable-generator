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
    <div className="space-y-8 w-full max-w-[1600px] mx-auto animate-fade-in">
      {/* Hero */}
      <div className="glass-card p-8">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <Zap size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold gradient-text">College Timetable Generator</h2>
            <p className="text-gray-400 text-sm mt-0.5">Automated, collision-free weekly schedules with spatial constraint intelligence</p>
          </div>
        </div>
        <p className="text-gray-400 text-sm leading-relaxed max-w-3xl">
          Configure departments, faculty teachers, academic subjects, classrooms, and student batches below.
          Once your campus data is in place, navigate to the <strong className="text-gray-200">Generate</strong> workspace
          to produce constraint-satisfying, walking-distance-optimized timetables automatically.
        </p>
      </div>

      {/* Stat cards */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">System Overview</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {STAT_CARDS.map(({ label, icon: Icon, key, color }) => (
            <div key={key} className="glass-card p-5 flex flex-col gap-3 hover:bg-white/10 transition-all hover:-translate-y-0.5 cursor-pointer group border border-white/5">
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
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Workflow & Getting Started</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            'Create Departments & staffrooms (e.g. Computer Science, Mathematics)',
            'Add Teachers with subject preferences and unavailable period slots',
            'Define Subjects with weekly period requirements and lab constraints',
            'Add Rooms — mark classrooms, labs, and seminar halls separately',
            'Create Class Sections, assign fixed homerooms and curriculum links',
            'Hit Generate to produce collision-free, walking-distance optimized schedules',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/5 text-sm text-gray-400 hover:bg-white/5 transition-colors">
              <span className="shrink-0 w-6 h-6 rounded-full bg-brand-600/30 text-brand-300 text-xs font-bold flex items-center justify-center mt-0.5 border border-brand-500/20">
                {i + 1}
              </span>
              <span className="leading-snug">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
