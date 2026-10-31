/**
 * TeacherCommuteTimeline.jsx
 *
 * Displays the personal walking commute path for a teacher in a beautiful timeline manner.
 * Includes:
 *   - Day section option (Mon - Sat tab navigation with walking load pills)
 *   - Weekly commute overview and aggregate metrics (total weekly meters, daily walk time est., path reliability)
 *   - Visual vertical timeline from Staffroom -> Period 1 -> Period 2 -> ... -> Staffroom
 *   - Distance pills on each hop labeled with Module 7f distances, BFS cells, and route classifications
 *   - Free period / break detection between scheduled periods
 *   - Campus switcher & Timetable run selector
 *   - Teacher selector (for admins or department heads)
 *   - Direct link to Campus Map overlay and Print option
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Route,
  Footprints,
  Navigation,
  MapPin,
  Building2,
  Layers,
  ArrowUpDown,
  Clock,
  Compass,
  ChevronDown,
  Calendar,
  Sparkles,
  Timer,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Users,
  Printer,
  ExternalLink,
  Coffee,
  RefreshCw,
  Info,
  DoorOpen,
  School,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { campusApi, timetablesApi, teachersApi } from '../api'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function TeacherCommuteTimeline({
  teacher,
  teachersList = [],
  onSelectTeacher,
  timetableId: initialTimetableId,
  timetablesList = [],
}) {
  const navigate = useNavigate()

  // Campus state
  const [campuses, setCampuses] = useState([])
  const [selectedCampusId, setSelectedCampusId] = useState('')
  const [loadingCampuses, setLoadingCampuses] = useState(true)

  // Teacher & Timetable selection
  const [activeTeacherId, setActiveTeacherId] = useState(teacher?.id || '')
  const [activeTimetableId, setActiveTimetableId] = useState(initialTimetableId || '')

  // Day selection (0 = Monday, ..., 5 = Saturday)
  const defaultDay = useMemo(() => {
    const today = new Date().getDay() // 0 = Sun, 1 = Mon ... 6 = Sat
    return (today >= 1 && today <= 5) ? today - 1 : 0
  }, [])
  const [selectedDay, setSelectedDay] = useState(defaultDay)

  // Commute path data
  const [commute, setCommute] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Interactive hop focus
  const [focusedHopIndex, setFocusedHopIndex] = useState(null)

  // Sync prop changes
  useEffect(() => {
    if (teacher?.id && teacher.id !== activeTeacherId) {
      setActiveTeacherId(teacher.id)
    }
  }, [teacher?.id])

  useEffect(() => {
    if (initialTimetableId && !activeTimetableId) {
      setActiveTimetableId(initialTimetableId)
    }
  }, [initialTimetableId])

  // Load campuses on mount
  useEffect(() => {
    let isMounted = true
    setLoadingCampuses(true)
    campusApi.list()
      .then(res => {
        if (!isMounted) return
        const list = Array.isArray(res?.data) ? res.data : []
        setCampuses(list)
        if (list.length > 0 && !selectedCampusId) {
          setSelectedCampusId(list[0].id)
        }
      })
      .catch(err => {
        console.error('Failed to load campuses for commute timeline:', err)
      })
      .finally(() => {
        if (isMounted) setLoadingCampuses(false)
      })
    return () => { isMounted = false }
  }, [])

  // If no timetableId provided, find the latest successful run
  useEffect(() => {
    if (!activeTimetableId) {
      timetablesApi.list()
        .then(res => {
          const list = Array.isArray(res?.data) ? res.data : []
          const okRun = list.find(r => r.status === 'ok') || list[0]
          if (okRun) {
            setActiveTimetableId(okRun.id)
          }
        })
        .catch(() => {})
    }
  }, [activeTimetableId])

  // Fetch commute path whenever campus, teacher, timetable, or day changes
  useEffect(() => {
    if (!selectedCampusId || !activeTeacherId || !activeTimetableId) return

    let isMounted = true
    setLoading(true)
    setError(null)

    campusApi.teacherCommute(selectedCampusId, activeTeacherId, activeTimetableId, selectedDay)
      .then(res => {
        if (!isMounted) return
        setCommute(res.data)
        setFocusedHopIndex(null)
      })
      .catch(err => {
        if (!isMounted) return
        setError(err?.response?.data?.detail || err?.message || 'Failed to calculate commute path')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => { isMounted = false }
  }, [selectedCampusId, activeTeacherId, activeTimetableId, selectedDay])

  // Format walking time estimate (avg 1.2 meters/second indoor walking speed)
  const formatWalkTime = (distM) => {
    if (!distM || distM <= 0) return 'Immediate'
    const secs = Math.round(distM / 1.2)
    if (secs < 60) return `${secs} sec walk`
    const mins = Math.floor(secs / 60)
    const remSecs = secs % 60
    return remSecs > 10 ? `${mins}m ${remSecs}s walk` : `${mins} min walk`
  }

  // Room type color badges
  const getRoomBadge = (rtype) => {
    switch (rtype) {
      case 'staffroom':
        return {
          bg: 'bg-violet-500/15',
          border: 'border-violet-500/30',
          text: 'text-violet-300',
          dot: '#a855f7',
          label: 'Staffroom',
        }
      case 'lab':
        return {
          bg: 'bg-cyan-500/15',
          border: 'border-cyan-500/30',
          text: 'text-cyan-300',
          dot: '#06b6d4',
          label: 'Laboratory',
        }
      case 'seminar':
        return {
          bg: 'bg-amber-500/15',
          border: 'border-amber-500/30',
          text: 'text-amber-300',
          dot: '#f59e0b',
          label: 'Seminar Hall',
        }
      case 'classroom':
      default:
        return {
          bg: 'bg-indigo-500/15',
          border: 'border-indigo-500/30',
          text: 'text-indigo-300',
          dot: '#6366f1',
          label: 'Classroom',
        }
    }
  }

  // Hop distance styling
  const getHopStyle = (hop) => {
    if (!hop.reachable) {
      return {
        badgeBg: 'bg-red-500/15',
        badgeBorder: 'border-red-500/40',
        badgeText: 'text-red-300',
        lineColor: '#ef4444',
      }
    }
    if (hop.distance_m === 0) {
      return {
        badgeBg: 'bg-gray-500/15',
        badgeBorder: 'border-gray-500/30',
        badgeText: 'text-gray-400',
        lineColor: '#6b7280',
      }
    }
    const m = hop.distance_m || 0
    if (m < 30) {
      return {
        badgeBg: 'bg-emerald-500/15',
        badgeBorder: 'border-emerald-500/40',
        badgeText: 'text-emerald-300',
        lineColor: '#10b981',
      }
    }
    if (m < 80) {
      return {
        badgeBg: 'bg-amber-500/15',
        badgeBorder: 'border-amber-500/40',
        badgeText: 'text-amber-300',
        lineColor: '#f59e0b',
      }
    }
    return {
      badgeBg: 'bg-violet-500/15',
      badgeBorder: 'border-violet-500/40',
      badgeText: 'text-violet-300',
      lineColor: '#a855f7',
    }
  }

  // Route type badge
  const formatRouteType = (type) => {
    switch (type) {
      case 'same_floor':
        return { label: 'Same Floor', icon: Layers, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' }
      case 'cross_floor':
        return { label: 'Cross-Floor (Stairs)', icon: ArrowUpDown, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' }
      case 'cross_building':
        return { label: 'Inter-Building Walk', icon: Building2, color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' }
      default:
        return { label: 'Direct Walk', icon: Navigation, color: 'text-gray-400 bg-white/5 border-white/10' }
    }
  }

  // Aggregate weekly stats
  const weeklyStats = useMemo(() => {
    if (!commute?.weekly_summary) return { totalM: 0, totalClasses: 0, totalHops: 0, maxDayM: 0 }
    let totalM = 0
    let totalClasses = 0
    let totalHops = 0
    let maxDayM = 0

    commute.weekly_summary.forEach(day => {
      totalM += day.total_distance_m || 0
      totalClasses += day.periods_count || 0
      totalHops += day.hops_count || 0
      if ((day.total_distance_m || 0) > maxDayM) {
        maxDayM = day.total_distance_m || 0
      }
    })

    return {
      totalM: Math.round(totalM * 10) / 10,
      totalClasses,
      totalHops,
      maxDayM: Math.round(maxDayM),
    }
  }, [commute?.weekly_summary])

  // Active day's summary from weekly_summary
  const activeDaySummary = useMemo(() => {
    if (!commute?.weekly_summary) return null
    return commute.weekly_summary.find(d => d.day_of_week === selectedDay)
  }, [commute?.weekly_summary, selectedDay])

  // Longest hop today
  const longestHopToday = useMemo(() => {
    if (!commute?.hops || commute.hops.length === 0) return null
    let longest = commute.hops[0]
    commute.hops.forEach(h => {
      if ((h.distance_m || 0) > (longest.distance_m || 0)) {
        longest = h
      }
    })
    return longest
  }, [commute?.hops])

  return (
    <section className="glass-card p-6 relative overflow-hidden transition-all print:border-none print:shadow-none print:p-0">
      {/* Background ambient gradient */}
      <div className="absolute -top-24 -right-24 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* ─── Header & Controls ─── */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-5 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shadow-md">
              <Route size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--c-body)', display: 'flex', alignItems: 'center', gap: 8 }}>
                Daily commute path
                <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: 'rgba(46,42,107,0.10)', border: '1px solid rgba(46,42,107,0.20)', color: '#2E2A6B' }}>
                  Module 7f Spatial
                </span>
              </h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--c-muted)', marginTop: 2 }}>
                Staffroom → each period's room in order → return to Staffroom, mapped with shortest walking distances.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Teacher Selector (if list available) */}
          {teachersList.length > 1 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
              <Users size={12} className="text-violet-400 shrink-0" />
              <select
                className="bg-transparent text-gray-200 outline-none cursor-pointer text-xs font-medium"
                value={activeTeacherId}
                onChange={e => {
                  setActiveTeacherId(e.target.value)
                  if (onSelectTeacher) {
                    const found = teachersList.find(t => t.id === e.target.value)
                    if (found) onSelectTeacher(found)
                  }
                }}
              >
                {teachersList.map(t => (
                  <option key={t.id} value={t.id} className="bg-gray-900 text-gray-200">
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Campus Selector */}
          {campuses.length > 1 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
              <School size={12} className="text-brand-400 shrink-0" />
              <select
                className="bg-transparent text-gray-200 outline-none cursor-pointer text-xs font-medium"
                value={selectedCampusId}
                onChange={e => setSelectedCampusId(e.target.value)}
              >
                {campuses.map(c => (
                  <option key={c.id} value={c.id} className="bg-gray-900 text-gray-200">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* View on Campus Map Button */}
          <button
            onClick={() => navigate('/campus')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 hover:text-violet-200 transition-all shadow-sm"
            title="Open campus layout view to see 2D building overlay"
          >
            <MapPin size={12} />
            <span>Campus Map</span>
            <ExternalLink size={10} className="opacity-70" />
          </button>

          {/* Print button */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-white/5 text-gray-400 hover:text-gray-200 border border-white/10 hover:border-white/20 transition-all"
            title="Print daily walking itinerary"
          >
            <Printer size={12} />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* ─── Day Section Option (Day Navigation Tabs) ─── */}
      <div className="relative z-10 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar size={12} className="text-violet-400" />
            Select Teaching Day
          </span>
          {activeDaySummary && (
            <span className="text-xs text-gray-400">
              {activeDaySummary.periods_count > 0 ? (
                <>
                  <strong className="text-violet-300">{activeDaySummary.periods_count}</strong> classes scheduled ·{' '}
                  <strong className="text-gray-200 font-mono">{activeDaySummary.total_distance_m}m</strong> walk
                </>
              ) : (
                <span className="text-emerald-400 font-medium">Free day · No scheduled classes</span>
              )}
            </span>
          )}
        </div>

        {/* Day Pills Bar */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {DAY_SHORT.slice(0, 6).map((shortName, idx) => {
            const isSelected = selectedDay === idx
            const daySummary = commute?.weekly_summary?.find(d => d.day_of_week === idx)
            const hasClasses = daySummary && daySummary.periods_count > 0

            return (
              <button
                key={idx}
                onClick={() => setSelectedDay(idx)}
                className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl border transition-all text-center relative overflow-hidden ${
                  isSelected
                    ? 'bg-gradient-to-b from-violet-600 to-violet-800 border-violet-400/60 text-white shadow-lg shadow-violet-600/30 scale-[1.02]'
                    : 'bg-white/[0.03] border-white/10 hover:border-violet-500/30 hover:bg-white/[0.06] text-gray-400'
                }`}
              >
                <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                  {DAY_NAMES[idx]}
                </span>
                <span className={`text-[10px] mt-0.5 font-mono ${
                  isSelected
                    ? 'text-violet-200 font-semibold'
                    : hasClasses
                    ? 'text-gray-400'
                    : 'text-gray-600'
                }`}>
                  {hasClasses ? `${daySummary.total_distance_m}m` : 'Free Day'}
                </span>

                {/* Micro period dots */}
                {hasClasses && (
                  <div className="flex items-center gap-1 mt-1.5">
                    {Array.from({ length: Math.min(daySummary.periods_count, 5) }).map((_, pI) => (
                      <span
                        key={pI}
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSelected ? 'bg-white' : 'bg-violet-400/60'
                        }`}
                      />
                    ))}
                    {daySummary.periods_count > 5 && (
                      <span className="text-[8px] leading-none opacity-80">+</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Metric Cards Bar ─── */}
      {commute && !loading && (
        <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {/* Card 1: Today's Walk */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
              <Footprints size={18} />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
                {commute.day_name} Walk
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-xl font-extrabold text-white font-mono">
                  {commute.total_distance_m}
                </span>
                <span className="text-xs text-gray-400 font-medium">meters</span>
              </div>
              <span className="text-[10px] text-gray-500 block mt-0.5">
                {commute.hops.length} walking hops connecting rooms
              </span>
            </div>
          </div>

          {/* Card 2: Estimated Time */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Timer size={18} />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
                Est. Walking Time
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-extrabold text-white font-mono">
                  {formatWalkTime(commute.total_distance_m)}
                </span>
              </div>
              <span className="text-[10px] text-gray-500 block mt-0.5">
                At standard 1.2 m/s indoor pace
              </span>
            </div>
          </div>

          {/* Card 3: Longest Transition */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Activity size={18} />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
                Longest Walk Leg
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-extrabold text-white font-mono">
                  {longestHopToday?.distance_m ?? 0}m
                </span>
              </div>
              <span className="text-[10px] text-gray-500 block mt-0.5 truncate max-w-[140px]" title={longestHopToday ? `${longestHopToday.from_room_name} → ${longestHopToday.to_room_name}` : 'None'}>
                {longestHopToday ? `${longestHopToday.from_room_name} → ${longestHopToday.to_room_name}` : 'No transitions'}
              </span>
            </div>
          </div>

          {/* Card 4: Weekly Total Walk */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Compass size={18} />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
                Weekly Total
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-extrabold text-emerald-300 font-mono">
                  {weeklyStats.totalM}m
                </span>
              </div>
              <span className="text-[10px] text-gray-500 block mt-0.5">
                Across {weeklyStats.totalClasses} periods this week
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Loading / Error States ─── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
          <Loader2 size={24} className="animate-spin text-violet-400" />
          <span className="text-sm font-medium">Computing shortest daily walking commute…</span>
          <span className="text-xs text-gray-500">Querying Module 7f Dijkstra & inter-building spatial matrices</span>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 flex items-start gap-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-400" />
          <div className="text-xs space-y-1">
            <span className="font-semibold block text-red-200">Could not calculate commute path</span>
            <p className="text-gray-400">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && !commute && (
        <div className="text-center py-10 text-gray-500 text-sm">
          Select a campus and timetable run to inspect the commute path.
        </div>
      )}

      {/* ─── Timeline View ─── */}
      {!loading && !error && commute && (
        <div className="relative z-10 space-y-4">
          {/* Base Staffroom Banner */}
          <div className="px-4 py-3 rounded-2xl bg-violet-950/30 border border-violet-500/25 flex flex-wrap items-center justify-between gap-3 shadow-inner">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-400 shadow-[0_0_8px_#a855f7]" />
              <span className="text-xs font-semibold text-gray-300">
                Department Base:
              </span>
              <span className="text-xs font-bold text-violet-200">
                {commute.staffroom_name || 'Staffroom'}
              </span>
              {commute.staffroom_building_name && (
                <span className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
                  <Building2 size={11} className="text-violet-400" />
                  {commute.staffroom_building_name}
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-400">
              Path status:{' '}
              <span className={`font-semibold ${commute.reachable_hops === commute.total_hops ? 'text-emerald-400' : 'text-amber-400'}`}>
                {commute.reachable_hops}/{commute.total_hops} legs connected ({commute.total_hops > 0 ? Math.round((commute.reachable_hops / commute.total_hops) * 100) : 100}%)
              </span>
            </div>
          </div>

          {/* Empty State: No Classes Today */}
          {commute.hops.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-md">
                <Coffee size={26} />
              </div>
              <h4 className="text-sm font-bold text-gray-200">
                No Classes Scheduled on {commute.day_name}
              </h4>
              <p className="text-xs text-gray-500 max-w-sm leading-relaxed">
                You have no scheduled teaching periods on this day. No room-to-room walking commute required!
              </p>
            </div>
          ) : (
            /* ── Rich Vertical Commute Timeline ── */
            <div className="relative pl-3 pr-1 py-2 space-y-0">
              {(() => {
                const waypoints = commute.waypoints && commute.waypoints.length > 0
                  ? commute.waypoints
                  : [
                      { index: 0, room_id: commute.hops[0]?.from_room_id, room_name: commute.hops[0]?.from_room_name, room_type: commute.hops[0]?.from_room_type, is_staffroom: true, building_name: commute.hops[0]?.from_building_name, floor_name: commute.hops[0]?.from_floor_name },
                      ...commute.hops.map((hop, hIdx) => ({
                        index: hIdx + 1,
                        room_id: hop.to_room_id,
                        room_name: hop.to_room_name,
                        room_type: hop.to_room_type,
                        is_staffroom: hIdx === commute.hops.length - 1,
                        period_index: hop.period_index,
                        subject_name: hop.subject_name,
                        subject_code: hop.subject_code,
                        section_name: hop.section_name,
                        building_name: hop.to_building_name,
                        floor_name: hop.to_floor_name,
                      }))
                    ]

                return waypoints.map((wp, idx) => {
                  const hop = commute.hops[idx - 1] // arriving hop
                  const isFirst = idx === 0
                  const isLast = idx === waypoints.length - 1
                  const isBreakReturn = wp.is_staffroom && wp.is_break
                  const rBadge = getRoomBadge(wp.room_type)
                  const hopIdx = idx - 1
                  const isHopFocused = hopIdx >= 0 && focusedHopIndex === hopIdx
                  const hopStyle = hop ? getHopStyle(hop) : null
                  const routeInfo = hop?.route_type ? formatRouteType(hop.route_type) : null
                  const RouteIcon = routeInfo?.icon || Navigation

                  return (
                    <div key={idx} className="relative">
                      {/* ── Hop Transition Connector ── */}
                      {!isFirst && hop && (
                        <div className="flex items-center my-2 ml-4">
                          {/* Vertical connector line */}
                          <div className="flex flex-col items-center w-6">
                            <div className="w-0.5 h-3 bg-white/10" />
                            <div
                              className="w-2.5 h-2.5 rounded-full border-2 transition-transform cursor-pointer"
                              style={{
                                background: hopStyle.lineColor,
                                borderColor: '#13151f',
                                transform: isHopFocused ? 'scale(1.4)' : 'scale(1)',
                              }}
                              onClick={() => setFocusedHopIndex(isHopFocused ? null : hopIdx)}
                            />
                            <div className="w-0.5 h-3 bg-white/10" />
                          </div>

                          {/* Hop distance badge & walk detail */}
                          <div
                            onClick={() => setFocusedHopIndex(isHopFocused ? null : hopIdx)}
                            className={`ml-3.5 flex-1 p-2.5 rounded-xl border transition-all cursor-pointer select-none flex flex-wrap items-center justify-between gap-2 ${
                              hopStyle.badgeBg
                            } ${hopStyle.badgeBorder} ${
                              isHopFocused ? 'ring-2 ring-violet-500/50 scale-[1.01] shadow-lg' : 'hover:scale-[1.005]'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Leg number pill */}
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-black/40 text-gray-300 border border-white/10">
                                Leg #{hopIdx + 1}
                              </span>

                              {/* Special purpose activity tag */}
                              {hop.is_break_return && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-sm">
                                  <Coffee size={10} />
                                  <span>Return to Staffroom for Break</span>
                                </span>
                              )}
                              {hop.is_break_departure && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 flex items-center gap-1 shadow-sm">
                                  <School size={10} />
                                  <span>Walk from Staffroom to Class</span>
                                </span>
                              )}
                              {hop.is_return_to_staffroom && !hop.is_break_return && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 flex items-center gap-1 shadow-sm">
                                  <DoorOpen size={10} />
                                  <span>End of Day Return to Staffroom</span>
                                </span>
                              )}

                              {/* Distance */}
                              <div className="flex items-baseline gap-1">
                                <span className={`text-sm font-bold font-mono ${hopStyle.badgeText}`}>
                                  {hop.reachable ? `${hop.distance_m}m` : 'Unreachable'}
                                </span>
                                {hop.reachable && (
                                  <span className="text-[10px] text-gray-400">
                                    ({hop.distance_cells} cells)
                                  </span>
                                )}
                              </div>

                              {/* Walk time */}
                              {hop.reachable && (
                                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                  <Clock size={10} className="text-gray-400" />
                                  {formatWalkTime(hop.distance_m)}
                                </span>
                              )}
                            </div>

                            {/* Route classification */}
                            {routeInfo && (
                              <div className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${routeInfo.color}`}>
                                <RouteIcon size={10} />
                                <span>{routeInfo.label}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── Waypoint Card (Stop / Room) ── */}
                      <div className="flex items-start">
                        {/* Waypoint Indicator Icon / Dot */}
                        <div className="flex flex-col items-center mr-3 mt-1">
                          <div
                            className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center shadow-lg transition-transform ${
                              isBreakReturn
                                ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-2 ring-amber-500/30'
                                : (isFirst || isLast)
                                ? 'bg-violet-600/30 border-violet-400 text-violet-200 ring-2 ring-violet-500/30'
                                : `${rBadge.bg} ${rBadge.border} ${rBadge.text}`
                            }`}
                          >
                            {isBreakReturn ? (
                              <Coffee size={15} className="text-amber-300" />
                            ) : (isFirst || isLast) ? (
                              <DoorOpen size={15} />
                            ) : wp.room_type === 'lab' ? (
                              <Sparkles size={14} />
                            ) : (
                              <School size={14} />
                            )}
                          </div>
                        </div>

                        {/* Room & Period Card */}
                        <div
                          className={`flex-1 rounded-2xl border p-4 transition-all shadow-md ${
                            isBreakReturn
                              ? 'bg-gradient-to-r from-amber-950/20 via-amber-900/10 to-transparent border-amber-500/30'
                              : (isFirst || isLast)
                              ? 'bg-gradient-to-r from-violet-900/20 via-violet-950/10 to-transparent border-violet-500/30'
                              : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              {/* Header Tags */}
                              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                {isFirst ? (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-violet-600 text-white shadow-sm">
                                    Start of Day · Staffroom Departure
                                  </span>
                                ) : isLast ? (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-violet-600 text-white shadow-sm">
                                    End of Day · Staffroom Return
                                  </span>
                                ) : isBreakReturn ? (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/30 text-amber-200 border border-amber-500/50 shadow-sm flex items-center gap-1">
                                    <Coffee size={10} />
                                    Free Period Break · Staffroom ({wp.gap_periods} free period{wp.gap_periods > 1 ? 's' : ''})
                                  </span>
                                ) : wp.period_index != null && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-brand-600/40 text-brand-200 border border-brand-500/40 font-mono">
                                    Period {wp.period_index + 1}
                                  </span>
                                )}

                                {/* Room type badge */}
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase ${
                                  isBreakReturn
                                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                    : `${rBadge.bg} ${rBadge.border} ${rBadge.text}`
                                }`}>
                                  {isBreakReturn ? 'Staffroom Break' : rBadge.label}
                                </span>
                              </div>

                              {/* Room Name */}
                              <h5 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                                {wp.room_name}
                              </h5>

                              {/* Subject & Section (for periods) */}
                              {wp.subject_name && (
                                <div className="text-xs text-gray-300 mt-1 flex items-center gap-1.5 flex-wrap">
                                  {wp.subject_code && (
                                    <span className="font-mono text-violet-300 font-bold bg-violet-500/10 px-1.5 py-0.2 rounded border border-violet-500/20">
                                      {wp.subject_code}
                                    </span>
                                  )}
                                  <span className="font-medium">{wp.subject_name}</span>
                                  {wp.section_name && (
                                    <span className="text-gray-400">· Section: <strong className="text-gray-200">{wp.section_name}</strong></span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Spatial Location Breadcrumb */}
                            {(wp.building_name || wp.floor_name) && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-400 font-mono bg-black/40 px-2.5 py-1 rounded-xl border border-white/10 shrink-0">
                                <Building2 size={12} className="text-violet-400" />
                                <span className="text-gray-200 font-semibold">{wp.building_name || 'Campus Building'}</span>
                                {wp.floor_name && (
                                  <>
                                    <span className="text-gray-600">›</span>
                                    <span>{wp.floor_name}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
