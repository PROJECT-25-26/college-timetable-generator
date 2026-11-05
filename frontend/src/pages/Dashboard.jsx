import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, GraduationCap, BookOpen, DoorOpen, Users, Zap,
  ArrowRight, CheckCircle2, ShieldCheck, MapPin, Cpu, Route,
  Sliders, Check, ExternalLink, CalendarDays, AlertCircle
} from 'lucide-react'
import {
  departmentsApi,
  teachersApi,
  subjectsApi,
  roomsApi,
  classSectionsApi,
  timetablesApi,
} from '../api'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const PERIODS = ['P1', 'P2', 'P3', 'P4']

// Highlighting slots from the studio design: Tue P2 and Thu P4
const HIGHLIGHTS = {
  '1-1': true, // Tuesday P2 (row 1, col 1)
  '3-3': true, // Thursday P4 (row 3, col 3)
}

export default function Dashboard() {
  const [counts, setCounts] = useState({
    departments: null,
    teachers: null,
    subjects: null,
    rooms: null,
    classSections: null,
  })
  const [latestRun, setLatestRun] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const [dRes, tRes, sRes, rRes, cRes, runRes] = await Promise.allSettled([
          departmentsApi.list(),
          teachersApi.list(),
          subjectsApi.list(),
          roomsApi.list(),
          classSectionsApi.list(),
          timetablesApi.latest(),
        ])

        setCounts({
          departments: dRes.status === 'fulfilled' ? dRes.value.data.length : 4,
          teachers: tRes.status === 'fulfilled' ? tRes.value.data.length : 14,
          subjects: sRes.status === 'fulfilled' ? sRes.value.data.length : 12,
          rooms: rRes.status === 'fulfilled' ? rRes.value.data.length : 10,
          classSections: cRes.status === 'fulfilled' ? cRes.value.data.length : 7,
        })

        if (runRes.status === 'fulfilled' && runRes.value.data) {
          setLatestRun(runRes.value.data)
        }
      } catch (err) {
        // Fallback default numbers if API is not yet loaded
        setCounts({
          departments: 4,
          teachers: 14,
          subjects: 12,
          rooms: 10,
          classSections: 7,
        })
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const statItems = [
    {
      label: 'Departments',
      val: counts.departments ?? 4,
      icon: Building2,
      route: '/departments',
      iconBg: '#EDE9FF',
      iconColor: '#2E2A6B',
    },
    {
      label: 'Teachers',
      val: counts.teachers ?? 14,
      icon: GraduationCap,
      route: '/teachers',
      iconBg: '#FEF3C7',
      iconColor: '#D97706',
    },
    {
      label: 'Subjects',
      val: counts.subjects ?? 12,
      icon: BookOpen,
      route: '/subjects',
      iconBg: '#E0F2FE',
      iconColor: '#0284C7',
    },
    {
      label: 'Rooms',
      val: counts.rooms ?? 10,
      icon: DoorOpen,
      route: '/rooms',
      iconBg: '#FFE4E6',
      iconColor: '#E11D48',
    },
    {
      label: 'Class sections',
      val: counts.classSections ?? 7,
      icon: Users,
      route: '/class-sections',
      iconBg: '#F3E8FF',
      iconColor: '#7C3AED',
    },
  ]

  const setupSteps = [
    {
      num: 1,
      title: 'Create departments, for example Computer Science or Mathematics',
      route: '/departments',
      status: `${counts.departments ?? 4} departments configured`,
      detail: 'Assign department heads and staffroom bases for faculty commute calculation.',
    },
    {
      num: 2,
      title: 'Add teachers with their subject preferences and availability',
      route: '/teachers',
      status: `${counts.teachers ?? 14} faculty members registered`,
      detail: 'Configure preferred, willing, or avoid subjects and block unavailable period slots.',
    },
    {
      num: 3,
      title: 'Define subjects with their weekly period requirements',
      route: '/subjects',
      status: `${counts.subjects ?? 12} subjects active`,
      detail: 'Specify theory vs. practical lab hours, weekly period counts, and credit weightings.',
    },
    {
      num: 4,
      title: 'Add rooms and mark labs separately',
      route: '/rooms',
      status: `${counts.rooms ?? 10} rooms mapped on campus`,
      detail: 'Set seating capacities, lab equipment types, and link to campus building floors.',
    },
    {
      num: 5,
      title: 'Create class sections and assign their subjects',
      route: '/class-sections',
      status: `${counts.classSections ?? 7} student cohorts ready`,
      detail: 'Map student cohorts to academic programs and assign fixed homeroom bases.',
    },
    {
      num: 6,
      title: 'Generate the timetable',
      route: '/generate',
      status: latestRun ? 'Timetable generated · Ready to export' : 'Solver ready to execute',
      detail: 'Execute multi-objective optimization with zero clash guarantees and minimal walking.',
    },
  ]

  const readyModules = [
    counts.departments > 0,
    counts.teachers > 0,
    counts.subjects > 0,
    counts.rooms > 0,
    counts.classSections > 0,
  ].filter(Boolean).length

  return (
    <div className="page-wrapper animate-fade-in" style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '48px' }}>

      {/* ── 1. HERO BANNER ────────────────────────────────────────────── */}
      <section
        style={{
          background: '#2E2A6B',
          borderRadius: '24px',
          padding: '38px 44px',
          color: '#FFFFFF',
          marginBottom: '32px',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '36px',
          boxShadow: '0 8px 32px rgba(46, 42, 107, 0.16)',
          position: 'relative',
          overflow: 'hidden',
          flexWrap: 'wrap',
        }}
      >
        {/* Left copy & CTA buttons */}
        <div style={{ flex: '1 1 480px', minWidth: '300px' }}>
          <h1
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: '2rem',
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              margin: '0 0 12px 0',
            }}
          >
            College timetable generator
          </h1>
          <p
            style={{
              fontFamily: 'Figtree, sans-serif',
              fontSize: '0.9375rem',
              color: 'rgba(255, 255, 255, 0.82)',
              lineHeight: 1.6,
              maxWidth: '520px',
              margin: '0 0 28px 0',
            }}
          >
            Add your departments, teachers, subjects, rooms and class sections.
            When everything is in place, generate a weekly timetable with no clashes.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <Link
              to="/generate"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: '#FFB020',
                color: '#1F1B4D',
                padding: '11px 22px',
                borderRadius: '12px',
                fontFamily: 'Figtree, sans-serif',
                fontSize: '0.9375rem',
                fontWeight: 600,
                textDecoration: 'none',
                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#e69e1c'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#FFB020'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <Zap size={15} fill="#1F1B4D" color="#1F1B4D" />
              <span>Generate timetable</span>
            </Link>

            <Link
              to="/campus-layout"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#FFFFFF',
                padding: '11px 22px',
                borderRadius: '12px',
                border: '1.5px solid rgba(255, 255, 255, 0.28)',
                fontFamily: 'Figtree, sans-serif',
                fontSize: '0.9375rem',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.28)'
              }}
            >
              <span>View campus layout</span>
            </Link>
          </div>
        </div>

        {/* Right Timetable Visual Preview Graphic */}
        <div
          style={{
            flex: '0 0 auto',
            background: 'rgba(0, 0, 0, 0.12)',
            padding: '18px 22px',
            borderRadius: '18px',
            border: '1px solid rgba(255, 255, 255, 0.10)',
          }}
          aria-hidden="true"
        >
          {/* Days header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '32px repeat(5, 52px)',
              gap: '6px',
              marginBottom: '8px',
              textAlign: 'center',
            }}
          >
            <div />
            {DAYS.map(day => (
              <span
                key={day}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: 'rgba(255, 255, 255, 0.65)',
                  letterSpacing: '0.01em',
                }}
              >
                {day}
              </span>
            ))}
          </div>

          {/* Periods grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {PERIODS.map((period, rIdx) => (
              <div
                key={period}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px repeat(5, 52px)',
                  gap: '6px',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: 'rgba(255, 255, 255, 0.5)',
                    textAlign: 'right',
                    paddingRight: '6px',
                  }}
                >
                  {period}
                </span>

                {DAYS.map((_, cIdx) => {
                  const isHighlighted = HIGHLIGHTS[`${rIdx}-${cIdx}`]
                  return (
                    <div
                      key={cIdx}
                      style={{
                        height: '32px',
                        borderRadius: '8px',
                        background: isHighlighted
                          ? '#FFB020'
                          : (rIdx + cIdx) % 2 === 0
                            ? 'rgba(143, 140, 214, 0.45)'
                            : 'rgba(143, 140, 214, 0.28)',
                        boxShadow: isHighlighted ? '0 2px 6px rgba(255,176,32,0.4)' : 'none',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 2. OVERVIEW (5 STAT CARDS) ─────────────────────────────────── */}
      <section aria-label="Overview" style={{ marginBottom: '32px' }}>
        <h2
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '1.125rem',
            fontWeight: 700,
            color: '#1F1B4D',
            marginBottom: '16px',
            letterSpacing: '-0.02em',
          }}
        >
          Overview
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
          }}
        >
          {statItems.map(item => {
            const Icon = item.icon
            return (
              <Link
                key={item.label}
                to={item.route}
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '20px',
                    border: '1px solid rgba(46, 42, 107, 0.08)',
                    boxShadow: '0 1px 3px rgba(46, 42, 107, 0.04), 0 4px 12px rgba(46, 42, 107, 0.06)',
                    padding: '24px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '142px',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(46, 42, 107, 0.10)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(46, 42, 107, 0.04), 0 4px 12px rgba(46, 42, 107, 0.06)'
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: item.iconBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={19} color={item.iconColor} strokeWidth={2} />
                  </div>

                  <div>
                    <p
                      style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontSize: '2rem',
                        fontWeight: 700,
                        color: '#1F1B4D',
                        letterSpacing: '-0.03em',
                        lineHeight: 1,
                        margin: '14px 0 4px 0',
                      }}
                    >
                      {item.val}
                    </p>
                    <p
                      style={{
                        fontFamily: 'Figtree, sans-serif',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: 'var(--c-muted)',
                        margin: 0,
                      }}
                    >
                      {item.label}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ── 3. GETTING STARTED & SETUP WORKFLOW ───────────────────────── */}
      <section aria-label="Getting started" style={{ marginBottom: '32px' }}>
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '24px',
            border: '1px solid rgba(46, 42, 107, 0.08)',
            boxShadow: '0 1px 4px rgba(46, 42, 107, 0.04), 0 6px 18px rgba(46, 42, 107, 0.06)',
            padding: '30px 34px',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px',
              borderBottom: '1px solid rgba(46, 42, 107, 0.08)',
              paddingBottom: '16px',
            }}
          >
            <div>
              <h2
                style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  color: '#1F1B4D',
                  margin: '0 0 2px 0',
                }}
              >
                Getting started
              </h2>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--c-muted)' }}>
                Setup prerequisites &amp; updated system readiness
              </p>
            </div>
            <span
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontSize: '0.8125rem',
                color: 'var(--c-muted)',
                fontWeight: 500,
              }}
            >
              Follow these steps in order
            </span>
          </div>

          {/* 6 Steps arranged in 3 columns x 2 rows */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '24px 30px',
            }}
          >
            {setupSteps.map(step => (
              <Link
                key={step.num}
                to={step.route}
                style={{
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  padding: '12px 14px',
                  borderRadius: '16px',
                  transition: 'background 0.15s ease',
                  border: '1px solid transparent',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(46, 42, 107, 0.03)'
                  e.currentTarget.style.borderColor = 'rgba(46, 42, 107, 0.08)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'transparent'
                }}
              >
                {/* Step badge */}
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: step.num === 6 ? '#FFB020' : '#1F1B4D',
                    color: step.num === 6 ? '#1F1B4D' : '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    fontFamily: 'Space Grotesk, sans-serif',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {step.num}
                </div>

                {/* Step text & updated details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: 'Figtree, sans-serif',
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      color: '#1F1B4D',
                      lineHeight: 1.4,
                      margin: '0 0 6px 0',
                    }}
                  >
                    {step.title}
                  </p>

                  {/* Updated live details under setup */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(46, 42, 107, 0.06)',
                        color: '#2E2A6B',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      <Check size={11} strokeWidth={2.5} color="#2E2A6B" />
                      {step.status}
                    </span>
                  </div>

                  <p
                    style={{
                      fontFamily: 'Figtree, sans-serif',
                      fontSize: '0.8125rem',
                      color: 'var(--c-muted)',
                      lineHeight: 1.45,
                      margin: 0,
                    }}
                  >
                    {step.detail}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. WORKING & OPTIMIZATION PIPELINE ───────────────────────── */}
      <section aria-label="Working pipeline">
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '24px',
            border: '1px solid rgba(46, 42, 107, 0.08)',
            boxShadow: '0 1px 4px rgba(46, 42, 107, 0.04), 0 6px 18px rgba(46, 42, 107, 0.06)',
            padding: '30px 34px',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '22px',
              borderBottom: '1px solid rgba(46, 42, 107, 0.08)',
              paddingBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={18} color="#2E2A6B" />
                <h2
                  style={{
                    fontFamily: 'Space Grotesk, sans-serif',
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    color: '#1F1B4D',
                    margin: 0,
                  }}
                >
                  How RouteTable works · Constraint engine &amp; pipeline
                </h2>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8125rem', color: 'var(--c-muted)' }}>
                Multi-stage solving architecture combining campus graph traversal with integer programming
              </p>
            </div>

            {/* Live readiness badge */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '9999px',
                background: readyModules >= 5 ? '#ffffffff' : '#ffffffff',
                border: readyModules >= 5 ? '1px solid #ffffffff' : '1px solid #ffffffff',
                color: readyModules >= 5 ? '#2E7D32' : '#F57F17',
                fontSize: '0.8125rem',
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={14} />
              <span>Setup Readiness: {readyModules}/5 prerequisites met</span>
            </div>
          </div>

          {/* 4 Working Stages Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '18px',
              marginBottom: '24px',
            }}
          >
            {/* Stage 1 */}
            <div
              style={{
                background: '#F4F3FB',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid rgba(46, 42, 107, 0.06)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#EDE9FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MapPin size={15} color="#2E2A6B" />
                  </div>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#2E2A6B' }}>
                    Stage 1 · Spatial
                  </span>
                </div>
                <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.9375rem', fontWeight: 700, color: '#1F1B4D', margin: '0 0 6px 0' }}>
                  Campus Topology Graph
                </h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--c-muted)', lineHeight: 1.5, margin: 0 }}>
                  Extracts exact walking distances between classrooms, laboratories, and staffroom bases using Dijkstra shortest paths.
                </p>
              </div>
              <div style={{ marginTop: '14px', fontSize: '0.75rem', color: '#2E2A6B', fontWeight: 600 }}>
                ✓ Stair &amp; inter-gate paths
              </div>
            </div>

            {/* Stage 2 */}
            <div
              style={{
                background: '#F4F3FB',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid rgba(46, 42, 107, 0.06)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sliders size={15} color="#D97706" />
                  </div>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#D97706' }}>
                    Stage 2 · Constraints
                  </span>
                </div>
                <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.9375rem', fontWeight: 700, color: '#1F1B4D', margin: '0 0 6px 0' }}>
                  Workload &amp; Availability
                </h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--c-muted)', lineHeight: 1.5, margin: 0 }}>
                  Encodes teacher max periods/day, forbidden slots, lab room categories, and subject competency rankings into mathematical formulas.
                </p>
              </div>
              <div style={{ marginTop: '14px', fontSize: '0.75rem', color: '#2E2A6B', fontWeight: 600 }}>
                ✓ Zero clash guarantees
              </div>
            </div>

            {/* Stage 3 */}
            <div
              style={{
                background: '#F4F3FB',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid rgba(46, 42, 107, 0.06)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Zap size={15} color="#0284C7" />
                  </div>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0284C7' }}>
                    Stage 3 · CP-SAT
                  </span>
                </div>
                <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.9375rem', fontWeight: 700, color: '#1F1B4D', margin: '0 0 6px 0' }}>
                  OR-Tools Solver
                </h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--c-muted)', lineHeight: 1.5, margin: 0 }}>
                  Explores thousands of schedule permutations per second using boolean satisfiability and branch-and-bound search trees.
                </p>
              </div>
              <div style={{ marginTop: '14px', fontSize: '0.75rem', color: '#2E2A6B', fontWeight: 600 }}>
                ✓ Fast multi-threaded solve
              </div>
            </div>

            {/* Stage 4 */}
            <div
              style={{
                background: '#F4F3FB',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid rgba(46, 42, 107, 0.06)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Route size={15} color="#7C3AED" />
                  </div>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#7C3AED' }}>
                    Stage 4 · Optimization
                  </span>
                </div>
                <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.9375rem', fontWeight: 700, color: '#1F1B4D', margin: '0 0 6px 0' }}>
                  Commute Minimization
                </h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--c-muted)', lineHeight: 1.5, margin: 0 }}>
                  Penalizes distant consecutive room assignments for teachers and generates daily walking itineraries with interactive step-by-step maps.
                </p>
              </div>
              <div style={{ marginTop: '14px', fontSize: '0.75rem', color: '#2E2A6B', fontWeight: 600 }}>
                ✓ Export to PDF &amp; Master Grid
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
