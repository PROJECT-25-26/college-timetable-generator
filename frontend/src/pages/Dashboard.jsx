import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, GraduationCap, BookOpen, DoorOpen, Users, Zap,
  ArrowRight, CheckCircle2
} from 'lucide-react'
import axios from 'axios'

const STAT_CARDS = [
  {
    label:  'Departments',
    icon:   Building2,
    key:    'departments',
    route:  '/departments',
    iconBg: '#EDE9FF',
    iconColor: '#2E2A6B',
  },
  {
    label:  'Teachers',
    icon:   GraduationCap,
    key:    'teachers',
    route:  '/teachers',
    iconBg: '#E8F5E9',
    iconColor: '#2e7d32',
  },
  {
    label:  'Subjects',
    icon:   BookOpen,
    key:    'subjects',
    route:  '/subjects',
    iconBg: '#E3F2FD',
    iconColor: '#1565C0',
  },
  {
    label:  'Rooms',
    icon:   DoorOpen,
    key:    'rooms',
    route:  '/rooms',
    iconBg: '#FFF3E0',
    iconColor: '#E65100',
  },
  {
    label:  'Class sections',
    icon:   Users,
    key:    'class-sections',
    route:  '/class-sections',
    iconBg: '#FCE4EC',
    iconColor: '#AD1457',
  },
]

const WORKFLOW_STEPS = [
  {
    n: 1,
    title: 'Set up departments',
    desc:  'Create academic departments and assign staffrooms where faculty will be based.',
    route: '/departments',
  },
  {
    n: 2,
    title: 'Add teachers',
    desc:  'Register faculty with their subject preferences and unavailable period slots.',
    route: '/teachers',
  },
  {
    n: 3,
    title: 'Define subjects',
    desc:  'Specify weekly period counts, lab requirements, and credit hours per subject.',
    route: '/subjects',
  },
  {
    n: 4,
    title: 'Configure rooms',
    desc:  'Add classrooms, labs, and seminar halls with their capacities and types.',
    route: '/rooms',
  },
  {
    n: 5,
    title: 'Create class sections',
    desc:  'Set up student batches, assign homerooms, and link curriculum subjects.',
    route: '/class-sections',
  },
  {
    n: 6,
    title: 'Generate timetable',
    desc:  'Run the constraint solver to produce collision-free, distance-optimized schedules.',
    route: '/generate',
  },
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
    <div className="page-wrapper animate-fade-in" style={{ maxWidth: '1400px' }}>

      {/* Page intro — left-aligned, no hero banner with two buttons */}
      <header style={{ marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: '#FFB020', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Zap size={20} color="#1F1B4D" strokeWidth={2.5} />
          </div>
          <h1 className="page-heading" style={{ margin: 0 }}>
            College timetable generator
          </h1>
        </div>
        <p className="page-sub" style={{ maxWidth: '600px' }}>
          Configure your campus data, then generate constraint-satisfying, walking-distance-optimised
          weekly schedules automatically.
        </p>
      </header>

      {/* Stats row */}
      <section aria-label="System overview" style={{ marginBottom: '40px' }}>
        <h2
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--c-muted)',
            marginBottom: '14px',
            letterSpacing: '0.02em',
          }}
        >
          System overview
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '12px',
          }}
        >
          {STAT_CARDS.map(({ label, icon: Icon, key, route, iconBg, iconColor }) => (
            <Link key={key} to={route} style={{ textDecoration: 'none' }}>
              <div className="stat-card">
                <div className="stat-card-icon" style={{ background: iconBg }}>
                  <Icon size={20} color={iconColor} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div>
                  <p className="stat-card-value">
                    {counts[key] !== undefined
                      ? counts[key]
                      : <span className="skeleton" style={{ display: 'inline-block', width: '32px', height: '28px', borderRadius: '6px' }} />
                    }
                  </p>
                  <p className="stat-card-label">{label}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Workflow — not a card grid, use a plain ordered list */}
      <section aria-label="Setup workflow">
        <h2
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--c-muted)',
            marginBottom: '14px',
            letterSpacing: '0.02em',
          }}
        >
          Setup workflow
        </h2>

        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-card)',
            boxShadow: 'var(--shadow-card)',
            overflow: 'hidden',
          }}
        >
          {WORKFLOW_STEPS.map((step, idx) => (
            <Link
              key={step.n}
              to={step.route}
              style={{ textDecoration: 'none' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  padding: '16px 20px',
                  borderBottom: idx < WORKFLOW_STEPS.length - 1 ? '1px solid var(--c-border)' : 'none',
                  transition: 'background 0.12s',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(46,42,107,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Step number */}
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: step.n === 6 ? '#FFB020' : 'rgba(46,42,107,0.08)',
                    border: step.n === 6 ? '2px solid #FFB020' : '2px solid rgba(46,42,107,0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {step.n === 6
                    ? <Zap size={14} color="#1F1B4D" strokeWidth={2.5} />
                    : (
                      <span style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#2E2A6B',
                      }}>
                        {step.n}
                      </span>
                    )
                  }
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontFamily: 'Space Grotesk, sans-serif',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: '#2E2A6B',
                    marginBottom: '3px',
                    letterSpacing: '-0.01em',
                  }}>
                    {step.title}
                  </p>
                  <p style={{
                    fontSize: '0.875rem',
                    color: 'var(--c-muted)',
                    lineHeight: 1.5,
                  }}>
                    {step.desc}
                  </p>
                </div>

                <ArrowRight
                  size={16}
                  strokeWidth={1.75}
                  style={{ color: 'var(--c-muted)', flexShrink: 0, marginTop: '4px' }}
                  aria-hidden="true"
                />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
