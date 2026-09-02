import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Zap, CheckCircle2, XCircle, AlertTriangle,
  Trash2, Download, RefreshCw, History, Settings,
  Loader2, X, Users, DoorOpen, LayoutGrid,
} from 'lucide-react'
import { generateApi, timetablesApi, subjectsApi, teachersApi, classSectionsApi, roomsApi } from '../api'
import { useToast } from '../hooks/useToast'
import TimetableViewGrid from '../components/TimetableViewGrid'

// ── Constants ────────────────────────────────────────────────────────────────
const DAY_LABELS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TIMEOUT_OPTIONS = [
  { label: '30 seconds',  value: 30  },
  { label: '60 seconds',  value: 60  },
  { label: '120 seconds', value: 120 },
]

// 10-colour palette cycling per subject (bg / border / text)
const PALETTES = [
  { bg: 'rgba(99,102,241,.18)',  bd: 'rgba(99,102,241,.4)',  tx: '#a5b4fc' },
  { bg: 'rgba(139,92,246,.18)',  bd: 'rgba(139,92,246,.4)',  tx: '#c4b5fd' },
  { bg: 'rgba(14,165,233,.18)',  bd: 'rgba(14,165,233,.4)',  tx: '#7dd3fc' },
  { bg: 'rgba(16,185,129,.18)',  bd: 'rgba(16,185,129,.4)',  tx: '#6ee7b7' },
  { bg: 'rgba(245,158,11,.18)',  bd: 'rgba(245,158,11,.4)',  tx: '#fcd34d' },
  { bg: 'rgba(239,68,68,.18)',   bd: 'rgba(239,68,68,.4)',   tx: '#fca5a5' },
  { bg: 'rgba(236,72,153,.18)',  bd: 'rgba(236,72,153,.4)',  tx: '#f9a8d4' },
  { bg: 'rgba(20,184,166,.18)',  bd: 'rgba(20,184,166,.4)',  tx: '#5eead4' },
  { bg: 'rgba(168,85,247,.18)',  bd: 'rgba(168,85,247,.4)',  tx: '#d8b4fe' },
  { bg: 'rgba(251,146,60,.18)',  bd: 'rgba(251,146,60,.4)',  tx: '#fdba74' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtMs(ms) {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function fmtDate(iso) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function exportCsv(result, subjectMap, teacherMap, sectionMap, roomMap) {
  const rows = [['Section', 'Subject', 'Teacher', 'Room', 'Day', 'Period']]
  for (const s of result.slots) {
    rows.push([
      sectionMap[s.section_id]?.name ?? s.section_id ?? '',
      subjectMap[s.subject_id]?.name ?? s.subject_id ?? '',
      teacherMap[s.teacher_id]?.name ?? s.teacher_id ?? '',
      roomMap[s.room_id]?.code    ?? s.room_id    ?? '',
      DAY_LABELS[s.day_of_week]   ?? s.day_of_week,
      `P${s.period_index + 1}`,
    ])
  }
  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url
  a.download = `timetable_${result.id.slice(0, 8)}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ── Sub-components ───────────────────────────────────────────────────────────

function DayToggle({ selected, onChange }) {
  const days = DAY_LABELS.slice(0, 5)  // Mon–Fri only
  return (
    <div className="flex gap-1 flex-wrap">
      {days.map((d, i) => {
        const on = selected.includes(i)
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(on ? selected.filter(x => x !== i) : [...selected, i].sort())}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
              on
                ? 'bg-brand-600 border-brand-500 text-white shadow-sm shadow-brand-500/30'
                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
            }`}
          >
            {d}
          </button>
        )
      })}
    </div>
  )
}

function SolvingAnimation({ onCancel }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 py-16">
      {/* Pulsing sonar rings */}
      <div className="relative flex items-center justify-center w-28 h-28">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="absolute inset-0 rounded-full border-2 border-brand-500/40 animate-ping"
            style={{ animationDelay: `${i * 0.4}s`, animationDuration: '1.8s' }}
          />
        ))}
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/40">
          <Zap size={28} className="text-white" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <p className="text-xl font-bold text-white">Solving…</p>
        <p className="text-sm text-gray-400 max-w-xs">
          CP-SAT is applying constraints and optimising the schedule.
          This may take up to 60 seconds.
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full"
          style={{ animation: 'progress-fill 60s linear forwards' }}
        />
      </div>

      <button
        onClick={onCancel}
        className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-white/10 text-gray-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
      >
        <X size={14} /> Cancel
      </button>
    </div>
  )
}

function IdleState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
        <Zap size={28} className="text-gray-600" />
      </div>
      <div>
        <p className="text-gray-300 font-medium">Ready to generate</p>
        <p className="text-gray-500 text-sm mt-1">Configure the time grid and click Generate</p>
      </div>
    </div>
  )
}

function StatusBanner({ result, onExport }) {
  const isOk          = result.status === 'ok'
  const isInfeasible  = result.status === 'infeasible'

  const colours = isOk
    ? 'border-emerald-500/30 bg-emerald-500/10'
    : isInfeasible
    ? 'border-red-500/30 bg-red-500/10'
    : 'border-amber-500/30 bg-amber-500/10'

  const Icon = isOk ? CheckCircle2 : isInfeasible ? XCircle : AlertTriangle
  const iconCls = isOk ? 'text-emerald-400' : isInfeasible ? 'text-red-400' : 'text-amber-400'
  const title = isOk ? 'Timetable Generated' : isInfeasible ? 'No Solution Found' : 'Timed Out'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colours} mb-4`}>
      <Icon size={20} className={`shrink-0 ${iconCls}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        {result.message && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{result.message}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {result.solver_wall_ms != null && (
          <span className="text-xs text-gray-500">{fmtMs(result.solver_wall_ms)}</span>
        )}
        {isOk && (
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 border border-white/15 text-gray-200 hover:bg-white/15 transition-colors"
          >
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>
    </div>
  )
}

// ── View-mode tab config ──────────────────────────────────────────────────────
const VIEW_MODES = [
  { key: 'section', label: 'Class',   Icon: LayoutGrid },
  { key: 'teacher', label: 'Teacher', Icon: Users      },
  { key: 'room',    label: 'Room',    Icon: DoorOpen   },
]

// ── Main page ────────────────────────────────────────────────────────────────
export default function Generate() {
  const { toast } = useToast()

  // Config
  const [periodsPerDay, setPeriodsPerDay] = useState(8)
  const [workingDays,   setWorkingDays]   = useState([0, 1, 2, 3, 4])
  const [timeout,       setTimeout_]      = useState(60)

  // Solve state
  const [phase,   setPhase]   = useState('idle')   // 'idle' | 'solving' | 'done'
  const [result,  setResult]  = useState(null)      // TimetableOut

  // View mode for result grid
  const [viewMode, setViewMode] = useState('section')  // 'section' | 'teacher' | 'room'

  // Entity maps for display
  const [subjectMap, setSubjectMap] = useState({})  // id → {name, code, lab, lab_consecutive_periods}
  const [teacherMap, setTeacherMap] = useState({})  // id → {name}
  const [sectionMap, setSectionMap] = useState({})  // id → {name, code}
  const [roomMap,    setRoomMap]    = useState({})   // id → {code, name}

  // Past runs
  const [pastRuns,  setPastRuns]  = useState([])
  const [runsLoading, setRunsLoading] = useState(true)

  const abortRef = useRef(null)

  // ── Load entity name maps once on mount ──────────────────────────────────
  useEffect(() => {
    Promise.all([
      subjectsApi.list(),
      teachersApi.list(),
      classSectionsApi.list(),
      roomsApi.list(),
    ]).then(([subs, tch, secs, rms]) => {
      setSubjectMap(Object.fromEntries(
        subs.data.map(s => [s.id, { name: s.name, code: s.code, lab: s.lab, lab_consecutive_periods: s.lab_consecutive_periods }])
      ))
      setTeacherMap(Object.fromEntries(tch.data.map(t => [t.id, { name: t.name }])))
      setSectionMap(Object.fromEntries(secs.data.map(s => [s.id, { name: s.name, code: s.code }])))
      setRoomMap(Object.fromEntries(rms.data.map(r => [r.id, { code: r.code, name: r.name }])))
    }).catch(() => {})
  }, [])

  // ── Load past runs ────────────────────────────────────────────────────────
  const loadPastRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const res = await timetablesApi.list()
      setPastRuns(res.data)
    } catch {
      // silently ignore
    } finally {
      setRunsLoading(false)
    }
  }, [])

  useEffect(() => { loadPastRuns() }, [loadPastRuns])

  // ── Generate ──────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (workingDays.length === 0) {
      toast.error('Select at least one working day')
      return
    }

    setPhase('solving')
    setResult(null)
    abortRef.current = new AbortController()

    try {
      // Step 1: get the assembled payload
      const payloadRes = await generateApi.payload(periodsPerDay, workingDays)
      const payload    = payloadRes.data

      // Step 2: run solver (may take up to 60s)
      const res  = await generateApi.generate(payload, abortRef.current.signal)
      const data = res.data

      setResult(data)
      setPhase('done')
      loadPastRuns()

      if (data.status === 'ok') toast.success(`${data.slots?.length ?? 0} slots scheduled`)
      else if (data.status === 'infeasible') toast.error('No feasible timetable found', 8000)
      else toast.info('Solver timed out — no solution found', 8000)
    } catch (err) {
      setPhase('idle')
      if (err.code === 'ERR_CANCELED') {
        toast.info('Generation cancelled')
      } else {
        toast.error(err.message ?? 'Generation failed')
      }
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
    setPhase('idle')
  }

  // ── Load a past run ───────────────────────────────────────────────────────
  async function handleLoadRun(id) {
    try {
      const res = await timetablesApi.get(id)
      setResult(res.data)
      setPhase('done')
    } catch {
      toast.error('Failed to load run')
    }
  }

  // ── Delete a past run ─────────────────────────────────────────────────────
  async function handleDeleteRun(id, e) {
    e.stopPropagation()
    try {
      await timetablesApi.remove(id)
      setPastRuns(prev => prev.filter(r => r.id !== id))
      if (result?.id === id) { setResult(null); setPhase('idle') }
      toast.success('Run deleted')
    } catch {
      toast.error('Failed to delete run')
    }
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  function handleExport() {
    if (result) exportCsv(result, subjectMap, teacherMap, sectionMap, roomMap)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-6 h-full animate-fade-in" style={{ maxHeight: 'calc(100vh - 64px - 48px)' }}>

      {/* ── LEFT: Config + History ─────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Generate</h2>
            <p className="text-[11px] text-gray-500">CP-SAT constraint solver</p>
          </div>
        </div>

        {/* Config card */}
        <div className="glass-card p-4 space-y-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest">
            <Settings size={12} /> Configuration
          </div>

          {/* Periods per day */}
          <div>
            <label className="form-label">Periods per Day</label>
            <input
              type="number" min={1} max={16}
              value={periodsPerDay}
              onChange={e => setPeriodsPerDay(Math.max(1, Math.min(16, +e.target.value)))}
              disabled={phase === 'solving'}
              className="form-input w-full"
            />
          </div>

          {/* Working days */}
          <div>
            <label className="form-label">Working Days</label>
            <DayToggle
              selected={workingDays}
              onChange={d => phase !== 'solving' && setWorkingDays(d)}
            />
          </div>

          {/* Timeout */}
          <div>
            <label className="form-label">Solver Timeout</label>
            <select
              value={timeout}
              onChange={e => setTimeout_(+e.target.value)}
              disabled={phase === 'solving'}
              className="form-input w-full"
            >
              {TIMEOUT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-600 mt-1.5 leading-relaxed">
              Solver returns best partial result at timeout
            </p>
          </div>

          {/* Generate button */}
          <button
            id="generate-btn"
            onClick={phase === 'solving' ? handleCancel : handleGenerate}
            disabled={workingDays.length === 0}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all shadow-lg ${
              phase === 'solving'
                ? 'bg-red-600/80 hover:bg-red-600 text-white shadow-red-500/20'
                : 'bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white shadow-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {phase === 'solving'
              ? <><X size={15} /> Cancel</>
              : <><Zap size={15} /> Generate Timetable</>
            }
          </button>
        </div>

        {/* Past runs */}
        <div className="glass-card p-4 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest">
              <History size={12} /> Past Runs
            </div>
            <button onClick={loadPastRuns} className="text-gray-600 hover:text-gray-300 transition-colors">
              <RefreshCw size={12} />
            </button>
          </div>

          {runsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 size={16} className="text-gray-600 animate-spin" />
            </div>
          ) : pastRuns.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4">No runs yet</p>
          ) : (
            <ul className="space-y-1">
              {pastRuns.map(run => {
                const isActive = result?.id === run.id
                const statusCls =
                  run.status === 'ok'          ? 'bg-emerald-500'  :
                  run.status === 'infeasible'  ? 'bg-red-500'      : 'bg-amber-500'
                return (
                  <li key={run.id}>
                    <button
                      onClick={() => handleLoadRun(run.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all group ${
                        isActive
                          ? 'bg-brand-600/20 border border-brand-500/30'
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusCls}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-200 truncate">
                          {run.label ?? fmtDate(run.created_at)}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {run.slot_count} slots · {fmtMs(run.solver_wall_ms)}
                        </p>
                      </div>
                      <button
                        onClick={e => handleDeleteRun(run.id, e)}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all p-0.5"
                      >
                        <Trash2 size={11} />
                      </button>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ── RIGHT: Result area ──────────────────────────────────────────── */}
      <div className="flex-1 glass-card p-5 overflow-y-auto min-w-0">

        {phase === 'idle' && <IdleState />}

        {phase === 'solving' && <SolvingAnimation onCancel={handleCancel} />}

        {phase === 'done' && result && (
          <div>
            <StatusBanner result={result} onExport={handleExport} />

            {result.status === 'ok' && result.slots?.length > 0 && (
              <div>
                {/* ── View-mode tab bar ─────────────────────────────── */}
                <div className="flex items-center gap-1 mb-4 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
                  {VIEW_MODES.map(({ key, label, Icon }) => {
                    const active = viewMode === key
                    return (
                      <button
                        key={key}
                        onClick={() => setViewMode(key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/30'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/10'
                        }`}
                      >
                        <Icon size={12} />
                        {label}
                      </button>
                    )
                  })}
                </div>

                {/* ── Grid ──────────────────────────────────────────── */}
                <TimetableViewGrid
                  result={result}
                  subjectMap={subjectMap}
                  teacherMap={teacherMap}
                  sectionMap={sectionMap}
                  roomMap={roomMap}
                  workingDays={workingDays}
                  periodsPerDay={periodsPerDay}
                  viewMode={viewMode}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress bar keyframe (injected once via style tag) */}
      <style>{`
        @keyframes progress-fill {
          from { width: 0% }
          to   { width: 90% }
        }
      `}</style>
    </div>
  )
}
