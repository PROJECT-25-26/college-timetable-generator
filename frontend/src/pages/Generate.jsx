import {
  Zap, CheckCircle2, XCircle, AlertTriangle,
  Trash2, Download, RefreshCw, History, Settings,
  Loader2, X, Users, DoorOpen, LayoutGrid, Save, RotateCcw, Undo2, Lock, RefreshCcw, FileText, FileSpreadsheet,
} from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { generateApi, timetablesApi, subjectsApi, teachersApi, classSectionsApi, roomsApi } from '../api'
import { useToast } from '../hooks/useToast'
import TimetableViewGrid from '../components/TimetableViewGrid'
import ExportModal from '../components/ExportModal'

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
                ? 'bg-primary border-primary text-white shadow-sm'
                : 'bg-ground border-primary/12 text-muted hover:bg-secondary/8 hover:text-body'
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
        <p className="text-xl font-bold text-body">Solving…</p>
        <p className="text-sm text-muted max-w-xs">
          CP-SAT is applying constraints and optimising the schedule.
          This may take up to 60 seconds.
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-48 h-1 rounded-full bg-secondary/8 overflow-hidden">
        <div
          className="h-full bg-accent rounded-full"
          style={{ animation: 'progress-fill 60s linear forwards' }}
        />
      </div>

      <button
        onClick={onCancel}
        className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-primary/12 text-muted hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
      >
        <X size={14} /> Cancel
      </button>
    </div>
  )
}

function IdleState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-ground border border-primary/12 flex items-center justify-center">
        <Zap size={28} className="text-muted" />
      </div>
      <div>
        <p className="text-body font-medium">Ready to generate</p>
        <p className="text-muted text-sm mt-1">Configure the time grid and click Generate</p>
      </div>
    </div>
  )
}

function StatusBanner({ result, onOpenExportModal }) {
  const isOk          = result.status === 'ok'
  const isInfeasible  = result.status === 'infeasible'

  const colours = isOk
    ? 'border-emerald-200 bg-emerald-50'
    : isInfeasible
    ? 'border-red-200 bg-red-50'
    : 'border-amber-200 bg-amber-50'

  const Icon = isOk ? CheckCircle2 : isInfeasible ? XCircle : AlertTriangle
  const iconCls = isOk ? 'text-emerald-700' : isInfeasible ? 'text-red-600' : 'text-amber-700'
  const title = isOk ? 'Timetable Generated' : isInfeasible ? 'No Solution Found' : 'Timed Out'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colours} mb-4`}>
      <Icon size={20} className={`shrink-0 ${iconCls}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-body">{title}</p>
        {result.message && (
          <p className="text-xs text-muted mt-0.5 truncate">{result.message}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {result.solver_wall_ms != null && (
          <span className="text-xs text-muted">{fmtMs(result.solver_wall_ms)}</span>
        )}
        {isOk && (
          <button
            onClick={onOpenExportModal}
            className="btn btn-primary btn-sm"
          >
            <Download size={13} /> Export Schedule
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
  const [travelWeight,  setTravelWeight]  = useState(2)   // O3 walking-distance penalty (0 = disabled)

  // Solve state
  const [phase,   setPhase]   = useState('idle')   // 'idle' | 'solving' | 'done'
  const [result,  setResult]  = useState(null)      // TimetableOut

  // View mode for result grid
  const [viewMode, setViewMode] = useState('section')  // 'section' | 'teacher' | 'room'

  // Entity maps for display & validator
  const [subjectMap, setSubjectMap]         = useState({})  // id → {name,code,lab,lab_consecutive_periods,required_lab_type}
  const [teacherMap, setTeacherMap]         = useState({})  // id → {name,max_periods_per_week}
  const [sectionMap, setSectionMap]         = useState({})  // id → {name,code,homeroom_id}
  const [roomMap,    setRoomMap]            = useState({})  // id → {code,name,room_type,lab_type}
  const [teacherUnavailMap, setTeacherUnavailMap] = useState({}) // teacherId → [{day_of_week,period_index}]
  const [teacherPrefsMap,   setTeacherPrefsMap]   = useState({}) // teacherId → [{subject_id,preference_type}]

  // Manual-edit tracking & undo stack
  const [pendingEdits, setPendingEdits] = useState(false)
  const [savingEdits,  setSavingEdits]  = useState(false)
  const [slotHistory,  setSlotHistory]  = useState([])

  // Lock state — Set of slot IDs the user has pinned for next regeneration
  const [lockedSlotIds,   setLockedSlotIds]   = useState(() => new Set())
  const [isRegenerating,  setIsRegenerating]  = useState(false)

  // Export modal
  const [exportModalOpen, setExportModalOpen] = useState(false)


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
        subs.data.map(s => [s.id, {
          name: s.name,
          code: s.code,
          lab: s.lab,
          lab_consecutive_periods: s.lab_consecutive_periods,
          required_lab_type: s.required_lab_type ?? null,
        }])
      ))
      setTeacherMap(Object.fromEntries(
        tch.data.map(t => [t.id, { name: t.name, max_periods_per_week: t.max_periods_per_week ?? 25 }])
      ))
      setSectionMap(Object.fromEntries(
        secs.data.map(s => [s.id, { name: s.name, code: s.code, homeroom_id: s.homeroom_id ?? null }])
      ))
      setRoomMap(Object.fromEntries(
        rms.data.map(r => [r.id, { code: r.code, name: r.name, room_type: r.room_type, lab_type: r.lab_type ?? null }])
      ))
      const unavailMap = {}
      const prefMap    = {}
      for (const t of tch.data) {
        unavailMap[t.id] = (t.unavailable_slots ?? []).map(u => ({
          day_of_week:  u.day_of_week,
          period_index: u.period_index,
        }))
        prefMap[t.id] = (t.subject_links ?? []).map(l => ({
          subject_id:      l.subject_id,
          preference_type: l.preference_type ?? 'willing',
        }))
      }
      setTeacherUnavailMap(unavailMap)
      setTeacherPrefsMap(prefMap)
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
    const startTime = Date.now()

    try {
      // Step 1: get the assembled payload with user timeout
      const payloadRes = await generateApi.payload(periodsPerDay, workingDays, travelWeight, timeout)
      const payload    = { ...payloadRes.data, timeout_seconds: timeout }

      // Step 2: run solver
      const res  = await generateApi.generate(payload, abortRef.current.signal)
      const data = res.data

      setResult(data)
      setPendingEdits(false)
      setSlotHistory([])
      setLockedSlotIds(new Set())
      setPhase('done')
      loadPastRuns()

      if (data.status === 'ok') toast.success(`${data.slots?.length ?? 0} slots scheduled`)
      else if (data.status === 'infeasible') toast.error('No feasible timetable found', 8000)
      else toast.info('Solver timed out — no solution found', 8000)
    } catch (err) {
      if (err.code === 'ERR_CANCELED') {
        setPhase('idle')
        toast.info('Generation cancelled')
        return
      }

      // Resilient check: In case of upstream timeout (e.g. 504) or network interruption,
      // the backend solver might have still completed and persisted the generated timetable.
      let recovered = false
      try {
        toast.info('Checking for generated timetable…')
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000))
          const runsRes = await timetablesApi.list()
          const runs = runsRes.data || []
          if (runs.length > 0) {
            const latest = runs[0]
            const createdAt = new Date(latest.created_at).getTime()
            if (createdAt >= startTime - 15_000 && latest.status === 'ok') {
              const fullRun = await timetablesApi.get(latest.id)
              setResult(fullRun.data)
              setPendingEdits(false)
              setSlotHistory([])
              setLockedSlotIds(new Set())
              setPhase('done')
              loadPastRuns()
              toast.success(`Timetable retrieved successfully (${fullRun.data.slots?.length ?? 0} slots)`)
              recovered = true
              break
            }
          }
        }
      } catch {
        // Recovery attempt failed; ignore and proceed to error state
      }

      if (!recovered) {
        setPhase('idle')
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
      const data = res.data
      setResult(data)
      // Restore locked state from persisted is_locked flags
      const restoredLocks = new Set(
        (data.slots ?? []).filter(s => s.is_locked).map(s => s.id)
      )
      setLockedSlotIds(restoredLocks)
      setPendingEdits(false)
      setSlotHistory([])
      setPhase('done')
    } catch {
      toast.error('Failed to load run')
    }
  }

  // ── Slot swap callback from grid ──────────────────────────────────────────
  function handleSlotsChange(newSlots) {
    if (result?.slots) {
      setSlotHistory(prev => [...prev, result.slots])
    }
    setResult(prev => prev ? { ...prev, slots: newSlots } : prev)
    setPendingEdits(true)
  }

  // ── Undo swap action ──────────────────────────────────────────────────────
  const handleUndoSwap = useCallback(() => {
    if (slotHistory.length === 0) return
    const prevSlots = slotHistory[slotHistory.length - 1]
    const newHistory = slotHistory.slice(0, -1)
    setSlotHistory(newHistory)
    setResult(prev => prev ? { ...prev, slots: prevSlots } : prev)
    if (newHistory.length === 0) {
      setPendingEdits(false)
    }
    toast.info('Swap undone')
  }, [slotHistory, toast])

  // Ctrl+Z / Cmd+Z keyboard shortcut for Undo
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
        if (slotHistory.length > 0) {
          e.preventDefault()
          handleUndoSwap()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [slotHistory, handleUndoSwap])

  // ── Save manual edits to backend DB ──────────────────────────────────────
  async function handleSaveEdits() {
    if (!result?.id) return
    setSavingEdits(true)
    try {
      const cleanSlots = (result.slots ?? []).map(s => ({
        section_id:   s.section_id,
        subject_id:   s.subject_id,
        teacher_id:   s.teacher_id,
        room_id:      s.room_id,
        day_of_week:  s.day_of_week,
        period_index: s.period_index,
        is_locked:    lockedSlotIds.has(s.id),   // persist current lock state
      }))
      const res = await timetablesApi.updateSlots(result.id, cleanSlots)
      const data = res.data
      setResult(data)
      // Sync restored locks from persisted is_locked flags
      const restoredLocks = new Set(
        (data.slots ?? []).filter(s => s.is_locked).map(s => s.id)
      )
      setLockedSlotIds(restoredLocks)
      setPendingEdits(false)
      setSlotHistory([])
      loadPastRuns()
      toast.success('Timetable changes saved successfully!')
    } catch (err) {
      toast.error(err.message ?? 'Failed to save timetable changes')
    } finally {
      setSavingEdits(false)
    }
  }

  // ── Discard manual edits ──────────────────────────────────────────────────
  async function handleDiscardEdits() {
    if (!result?.id) { setPendingEdits(false); setSlotHistory([]); return }
    try {
      const res = await timetablesApi.get(result.id)
      const data = res.data
      setResult(data)
      const restoredLocks = new Set(
        (data.slots ?? []).filter(s => s.is_locked).map(s => s.id)
      )
      setLockedSlotIds(restoredLocks)
      setPendingEdits(false)
      setSlotHistory([])
      toast.info('Manual edits discarded')
    } catch {
      setPendingEdits(false)
      setSlotHistory([])
    }
  }

  // ── Toggle lock on a slot (and its lab block siblings) ───────────────────
  const handleToggleLock = useCallback((slotId, slot, isLabBlock, blockSize) => {
    setLockedSlotIds(prev => {
      const next = new Set(prev)
      const willLock = !next.has(slotId)

      if (isLabBlock && slot && blockSize > 1) {
        // Lock/unlock the entire lab block together
        const siblings = (result?.slots ?? []).filter(
          s =>
            s.section_id  === slot.section_id &&
            s.subject_id  === slot.subject_id &&
            s.day_of_week === slot.day_of_week &&
            s.room_id     === slot.room_id
        )
        for (const s of siblings) {
          willLock ? next.add(s.id) : next.delete(s.id)
        }
      } else {
        willLock ? next.add(slotId) : next.delete(slotId)
      }
      return next
    })
  }, [result])

  // ── Regenerate with locked slots ──────────────────────────────────────────
  const handleRegenerate = useCallback(async () => {
    if (workingDays.length === 0) {
      toast.error('Select at least one working day')
      return
    }
    if (lockedSlotIds.size === 0) {
      toast.info('No slots are locked — use the regular Generate button for a fresh solve.')
      return
    }

    setIsRegenerating(true)
    abortRef.current = new AbortController()
    const startTime = Date.now()

    try {
      // Build the locked_slots array from the current result
      const lockedSlots = (result?.slots ?? [])
        .filter(s => lockedSlotIds.has(s.id))
        .map(s => ({
          section_id:   s.section_id,
          subject_id:   s.subject_id,
          teacher_id:   s.teacher_id,
          room_id:      s.room_id,
          day_of_week:  s.day_of_week,
          period_index: s.period_index,
        }))

      toast.info(`Regenerating with ${lockedSlots.length} locked slot(s)…`)

      // Fetch fresh payload then regenerate with locked slots pinned and user timeout
      const payloadRes = await generateApi.payload(periodsPerDay, workingDays, travelWeight, timeout)
      const payload    = { ...payloadRes.data, timeout_seconds: timeout }
      const res = await generateApi.regenerate(
        payload,
        lockedSlots,
        abortRef.current.signal,
      )
      const data = res.data

      setResult(data)
      setPendingEdits(false)
      setSlotHistory([])
      setLockedSlotIds(new Set())
      setPhase('done')
      loadPastRuns()

      if (data.status === 'ok')
        toast.success(`Regenerated — ${data.slots?.length ?? 0} slots scheduled`)
      else if (data.status === 'infeasible')
        toast.error('Solver found no feasible timetable with those locks. Try unlocking some slots.', 9000)
      else
        toast.info('Solver timed out — try fewer locked slots or shorter timeout.', 8000)
    } catch (err) {
      if (err.code === 'ERR_CANCELED') {
        toast.info('Regeneration cancelled')
        return
      }

      let recovered = false
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000))
          const runsRes = await timetablesApi.list()
          const runs = runsRes.data || []
          if (runs.length > 0) {
            const latest = runs[0]
            const createdAt = new Date(latest.created_at).getTime()
            if (createdAt >= startTime - 15_000 && latest.status === 'ok') {
              const fullRun = await timetablesApi.get(latest.id)
              setResult(fullRun.data)
              setPendingEdits(false)
              setSlotHistory([])
              setLockedSlotIds(new Set())
              setPhase('done')
              loadPastRuns()
              toast.success(`Regenerated timetable retrieved (${fullRun.data.slots?.length ?? 0} slots)`)
              recovered = true
              break
            }
          }
        }
      } catch {
        // Recovery failed
      }

      if (!recovered) {
        toast.error(err.message ?? 'Regeneration failed')
      }
    } finally {
      setIsRegenerating(false)
    }
  }, [result, lockedSlotIds, periodsPerDay, workingDays, travelWeight, timeout, loadPastRuns, toast])


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
    <div
      className="page-wrapper animate-fade-in"
      style={{
        height: 'calc(100vh - var(--topbar-height))',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        paddingBottom: 24,
      }}
    >
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="page-header" style={{ marginBottom: 16, flexShrink: 0 }}>
        <div className="page-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--r-btn)',
                background: '#FFB020',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Zap size={18} style={{ color: '#1F1B4D' }} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="page-heading" style={{ margin: 0, fontSize: '1.25rem' }}>
                Generate timetable
              </h1>
              <p className="page-sub" style={{ margin: '2px 0 0 0' }}>
                CP-SAT constraint solver · Produce collision-free, walking-distance-optimised schedules
              </p>
            </div>
          </div>
        </div>
        {result && (
          <button
            onClick={() => setExportModalOpen(true)}
            className="btn btn-secondary btn-sm"
          >
            <Download size={13} strokeWidth={2} /> Export timetable
          </button>
        )}
      </div>

      {/* ── Main Two-Column Layout (Config Left, Result Right) ───────── */}
      <div className="flex gap-6 flex-1 min-h-0 items-stretch">
        {/* ── LEFT: Config + History ─────────────────────────────────────── */}
        <aside className="w-80 shrink-0 flex flex-col gap-4 overflow-hidden">
          {/* Config card */}
        <div className="card p-4 space-y-4 shrink-0 overflow-y-auto" style={{ maxHeight: 'calc(100% - 210px)', borderRadius: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.75rem', fontWeight: 600, color: 'var(--c-muted)' }}>
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

          {/* Travel Weight */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="form-label mb-0">Travel Weight</label>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold tabular-nums ${
                  travelWeight === 0 ? 'text-muted' : 'text-secondary'
                }`}>
                  {travelWeight === 0 ? 'Off' : travelWeight}
                </span>
                <button
                  type="button"
                  title={travelWeight === 0 ? 'Enable travel penalty' : 'Disable travel penalty'}
                  onClick={() => setTravelWeight(v => v === 0 ? 2 : 0)}
                  disabled={phase === 'solving'}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:opacity-50 ${
                    travelWeight > 0
                      ? 'bg-primary border-primary'
                      : 'bg-secondary/8 border-primary/18'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
                    travelWeight > 0 ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>
            <input
              type="range" min={0} max={10} step={1}
              value={travelWeight}
              onChange={e => setTravelWeight(+e.target.value)}
              disabled={phase === 'solving'}
              className="w-full h-1.5 rounded-full appearance-none accent-primary disabled:opacity-50 cursor-pointer"
              style={{
                background: `linear-gradient(to right, #2E2A6B ${travelWeight * 10}%, #D5D3EE ${travelWeight * 10}%)`,
              }}
            />
            <div className="flex justify-between text-[9px] text-muted mt-0.5 px-0.5">
              <span>Off</span>
              <span>Strong</span>
            </div>
            <p className="text-[10px] text-muted mt-1 leading-relaxed">
              Penalises teachers walking far between consecutive classes.
              Set to 0 to disable.
            </p>
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
            <p className="text-[10px] text-muted mt-1.5 leading-relaxed">
              Solver returns best partial result at timeout
            </p>
          </div>

          {/* Generate button */}
          <button
            id="generate-btn"
            onClick={phase === 'solving' ? handleCancel : handleGenerate}
            disabled={workingDays.length === 0}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '11px 18px',
              borderRadius: 12,
              fontSize: '0.9375rem',
              fontWeight: 600,
              border: 'none',
              cursor: workingDays.length === 0 ? 'not-allowed' : 'pointer',
              opacity: workingDays.length === 0 ? 0.5 : 1,
              transition: 'all 0.15s ease',
              fontFamily: 'Figtree, sans-serif',
              background: phase === 'solving' ? 'rgba(220,38,38,0.85)' : '#FFB020',
              color: phase === 'solving' ? '#FFFFFF' : '#1F1B4D',
              boxShadow: phase === 'solving' ? '0 2px 8px rgba(220,38,38,0.25)' : '0 2px 8px rgba(255,176,32,0.30)',
            }}
          >
            {phase === 'solving'
              ? <><X size={15} /> Cancel</>
              : <><Zap size={15} /> Generate timetable</>
            }
          </button>
        </div>

        {/* Past runs */}
        <div className="card p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-body">
              <History size={12} /> Past Runs
            </div>
            <button onClick={loadPastRuns} className="text-muted hover:text-body transition-colors">
              <RefreshCw size={12} />
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            {runsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 size={18} className="text-muted animate-spin" />
              </div>
            ) : pastRuns.length === 0 ? (
              <p className="text-xs text-muted text-center py-6">No runs yet</p>
            ) : (
              <ul className="space-y-1 overflow-y-auto flex-1 min-h-0 pr-0.5">
                {pastRuns.map(run => {
                  const isActive = result?.id === run.id
                  const statusCls =
                    run.status === 'ok'          ? 'bg-emerald-500'  :
                    run.status === 'infeasible'  ? 'bg-red-500'      : 'bg-amber-500'
                  return (
                    <li key={run.id}>
                      <button
                        onClick={() => handleLoadRun(run.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg text-left transition-all group ${
                          isActive
                            ? 'bg-primary/15 border border-secondary/30'
                            : 'hover:bg-ground border border-transparent'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${statusCls}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-body truncate">
                            {run.label ?? fmtDate(run.created_at)}
                          </p>
                          <p className="text-[11px] text-muted mt-0.5">
                            {run.slot_count} slots · {fmtMs(run.solver_wall_ms)}
                          </p>
                        </div>
                        <button
                          onClick={e => handleDeleteRun(run.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-all p-0.5 shrink-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </aside>

      {/* ── RIGHT: Result area ──────────────────────────────────────────── */}
      <div className="flex-1 card p-5 overflow-y-auto min-w-0 flex flex-col" style={{ borderRadius: 18 }}>

        {phase === 'idle' && <IdleState />}

        {phase === 'solving' && <SolvingAnimation onCancel={handleCancel} />}

        {phase === 'done' && result && (
          <div>
            <StatusBanner result={result} onOpenExportModal={() => setExportModalOpen(true)} />

            {/* ── Locked-slots / Regenerate banner ──────────────── */}
            {lockedSlotIds.size > 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-400/40 bg-amber-400/8 mb-4 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Lock size={15} className="text-amber-400 shrink-0" />
                  <p className="text-amber-900">
                    <span className="font-semibold">{lockedSlotIds.size} slot{lockedSlotIds.size !== 1 ? 's' : ''} locked.</span>{' '}
                    The solver will keep these fixed and only re-optimise the rest.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setLockedSlotIds(new Set())}
                    disabled={isRegenerating}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-500/30 text-amber-800 hover:bg-amber-400/15 transition-all disabled:opacity-40"
                    title="Clear all locks"
                  >
                    <X size={11} /> Clear locks
                  </button>
                  <button
                    id="regenerate-btn"
                    onClick={handleRegenerate}
                    disabled={isRegenerating || phase === 'solving'}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-semibold shadow-sm shadow-amber-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRegenerating
                      ? <><Loader2 size={12} className="animate-spin" /> Regenerating…</>
                      : <><RefreshCcw size={12} /> Regenerate</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* ── Pending manual edits banner ───────────────────── */}
            {pendingEdits && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10 mb-4 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                  <p className="text-amber-900">
                    <span className="font-semibold">Manual timetable edits pending.</span>{' '}
                    Save your changes to persist them to the database.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleUndoSwap}
                    disabled={savingEdits || slotHistory.length === 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-800 hover:bg-amber-500/20 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Undo last swap (Ctrl+Z)"
                  >
                    <Undo2 size={12} />
                    Undo ({slotHistory.length})
                  </button>
                  <button
                    onClick={handleDiscardEdits}
                    disabled={savingEdits}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-800 hover:bg-amber-500/20 transition-all text-xs disabled:opacity-50"
                  >
                    <RotateCcw size={12} />
                    Discard
                  </button>
                  <button
                    onClick={handleSaveEdits}
                    disabled={savingEdits}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-all text-xs disabled:opacity-50"
                  >
                    {savingEdits ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {savingEdits ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}

            {result.status === 'ok' && result.slots?.length > 0 && (
              <div>
                {/* ── View-mode tab bar ─────────────────────────────── */}
                <div className="flex items-center gap-1 mb-4 p-1 rounded-xl bg-ground border border-primary/12 w-fit">
                  {VIEW_MODES.map(({ key, label, Icon }) => {
                    const active = viewMode === key
                    return (
                      <button
                        key={key}
                        onClick={() => setViewMode(key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? 'bg-primary text-white shadow-sm'
                            : 'text-muted hover:text-body hover:bg-secondary/8'
                        }`}
                      >
                        <Icon size={12} />
                        {label}
                      </button>
                    )
                  })}
                </div>

                {/* ── Grid (with drag-and-drop + lock enabled) ──────────── */}
                <TimetableViewGrid
                  result={result}
                  subjectMap={subjectMap}
                  teacherMap={teacherMap}
                  sectionMap={sectionMap}
                  roomMap={roomMap}
                  workingDays={workingDays}
                  periodsPerDay={periodsPerDay}
                  viewMode={viewMode}
                  onSlotsChange={handleSlotsChange}
                  teacherUnavailMap={teacherUnavailMap}
                  teacherPrefsMap={teacherPrefsMap}
                  onUndo={handleUndoSwap}
                  canUndo={slotHistory.length > 0}
                  lockedSlotIds={lockedSlotIds}
                  onToggleLock={handleToggleLock}
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

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        timetable={result}
        sectionMap={sectionMap}
        teacherMap={teacherMap}
        subjectMap={subjectMap}
        roomMap={roomMap}
        initialScope={viewMode === 'teacher' ? 'teacher' : viewMode === 'section' ? 'class' : 'master'}
      />
    </div>
  )
}
