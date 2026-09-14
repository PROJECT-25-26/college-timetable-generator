/**
 * TimetableViewGrid — reusable timetable grid component with drag-and-drop swap
 * and per-slot lock toggle.
 *
 * viewMode:
 *   'section' — tabs = class sections; cell shows subject + teacher
 *   'teacher' — tabs = teachers;       cell shows subject + section
 *   'room'    — tabs = rooms;           cell shows subject + section + teacher
 *
 * Props:
 *   result              TimetableOut (must have .slots[])
 *   subjectMap          id → { name, code, lab, lab_consecutive_periods, required_lab_type }
 *   teacherMap          id → { name, max_periods_per_week }
 *   sectionMap          id → { name, code, homeroom_id }
 *   roomMap             id → { code, name, room_type, lab_type }
 *   workingDays         number[]  (0-based, e.g. [0,1,2,3,4])
 *   periodsPerDay       number
 *   viewMode            'section' | 'teacher' | 'room'
 *   filterById          optional string — if set, only that entity's tab shown
 *
 *   Drag-and-drop props (all optional — omit to make grid read-only):
 *   onSlotsChange       (newSlots: Slot[]) => void  — called after successful swap
 *   teacherUnavailMap   teacherId → [{day_of_week, period_index}]
 *   teacherPrefsMap     teacherId → [{subject_id, preference_type}]
 *
 *   Lock props:
 *   lockedSlotIds       Set<string>  — slot IDs currently locked
 *   onToggleLock        (slotId: string) => void — toggle lock on a slot
 *
 *   Undo prop:
 *   onUndo              () => void
 *   canUndo             boolean
 */

import { useState, useRef, useCallback } from 'react'
import { Undo2, Lock, LockOpen } from 'lucide-react'
import { useToast } from '../hooks/useToast'
import { validateSwap, applySwap } from '../utils/swapValidator'


// ── Constants ─────────────────────────────────────────────────────────────────
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// 10-colour subject palette
const PALETTES = [
  { bg: 'rgba(99,102,241,.18)',  bd: 'rgba(99,102,241,.4)',  tx: '#a5b4fc' },
  { bg: 'rgba(139,92,246,.18)', bd: 'rgba(139,92,246,.4)',  tx: '#c4b5fd' },
  { bg: 'rgba(14,165,233,.18)', bd: 'rgba(14,165,233,.4)',  tx: '#7dd3fc' },
  { bg: 'rgba(16,185,129,.18)', bd: 'rgba(16,185,129,.4)',  tx: '#6ee7b7' },
  { bg: 'rgba(245,158,11,.18)', bd: 'rgba(245,158,11,.4)',  tx: '#fcd34d' },
  { bg: 'rgba(239,68,68,.18)',  bd: 'rgba(239,68,68,.4)',   tx: '#fca5a5' },
  { bg: 'rgba(236,72,153,.18)', bd: 'rgba(236,72,153,.4)',  tx: '#f9a8d4' },
  { bg: 'rgba(20,184,166,.18)', bd: 'rgba(20,184,166,.4)',  tx: '#5eead4' },
  { bg: 'rgba(168,85,247,.18)', bd: 'rgba(168,85,247,.4)',  tx: '#d8b4fe' },
  { bg: 'rgba(251,146,60,.18)', bd: 'rgba(251,146,60,.4)',  tx: '#fdba74' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPaletteMap(slots) {
  const map = {}
  let idx = 0
  for (const s of slots) {
    if (s.subject_id && !(s.subject_id in map)) {
      map[s.subject_id] = PALETTES[idx % PALETTES.length]
      idx++
    }
  }
  return map
}

function getTabIds(slots, viewMode, filterById) {
  const seen = new Set()
  const ids  = []
  for (const s of slots) {
    const id =
      viewMode === 'section' ? s.section_id :
      viewMode === 'teacher' ? s.teacher_id :
      /* room */               s.room_id
    if (id && !seen.has(id)) { seen.add(id); ids.push(id) }
  }
  if (filterById) return ids.filter(id => id === filterById)
  return ids
}

function tabLabel(id, viewMode, sectionMap, teacherMap, roomMap) {
  if (viewMode === 'section') return sectionMap[id]?.name ?? id
  if (viewMode === 'teacher') return teacherMap[id]?.name ?? id
  return roomMap[id]?.code ?? roomMap[id]?.name ?? id
}

/**
 * Build grid lookup structures for one entity tab.
 * Handles lab rowspan merging ONLY for lab subjects.
 */
function buildGridMaps(activeSlots, subjectMap) {
  const byKey = new Map()
  for (const s of activeSlots) {
    byKey.set(`${s.day_of_week}:${s.period_index}`, s)
  }

  const coveredSet = new Set()
  const spanMap    = new Map()

  const groups = new Map()
  for (const s of activeSlots) {
    const subj = subjectMap[s.subject_id]
    // Only lab subjects merge into multi-period blocks
    if (!subj?.lab) continue

    const gk = `${s.day_of_week}|${s.subject_id}|${s.room_id}|${s.section_id}`
    if (!groups.has(gk)) groups.set(gk, { day: s.day_of_week, periods: [] })
    groups.get(gk).periods.push(s.period_index)
  }

  for (const { day, periods } of groups.values()) {
    if (periods.length < 2) continue
    periods.sort((a, b) => a - b)
    let runStart = 0
    for (let i = 1; i <= periods.length; i++) {
      const isEnd = i === periods.length || periods[i] !== periods[i - 1] + 1
      if (isEnd) {
        const runLen = i - runStart
        if (runLen > 1) {
          const anchor = periods[runStart]
          spanMap.set(`${day}:${anchor}`, runLen)
          for (let o = 1; o < runLen; o++) {
            coveredSet.add(`${day}:${anchor + o}`)
          }
        }
        runStart = i
      }
    }
  }

  return { byKey, coveredSet, spanMap }
}

function SwapToast({ message, kind, onDismiss }) {
  const colours = {
    error:   'bg-red-500/15 border-red-500/40 text-red-300',
    warning: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
    success: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  }
  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-xs mb-3 animate-fade-in ${colours[kind] ?? colours.error}`}
      role="alert"
    >
      <span className="flex-1 leading-snug">{message}</span>
      <button
        onClick={onDismiss}
        className="text-current opacity-60 hover:opacity-100 transition-opacity shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TimetableViewGrid({
  result,
  subjectMap        = {},
  teacherMap        = {},
  sectionMap        = {},
  roomMap           = {},
  workingDays       = [0, 1, 2, 3, 4],
  periodsPerDay     = 8,
  viewMode          = 'section',
  filterById,
  // Drag-and-drop & Undo
  onSlotsChange,
  teacherUnavailMap = {},
  teacherPrefsMap   = {},
  onUndo,
  canUndo           = false,
  // Lock
  lockedSlotIds     = new Set(),
  onToggleLock,
}) {
  const { toast } = useToast()
  const paletteRef = useRef(null)
  paletteRef.current = buildPaletteMap(result.slots)

  // Ensure workingDays only contains valid 0-4 (Mon-Fri) indices, preventing extra columns after Friday
  const sanitizedWorkingDays = (
    workingDays && workingDays.length > 0 ? workingDays : [0, 1, 2, 3, 4]
  ).filter(d => d >= 0 && d <= 4)

  const tabIds = getTabIds(result.slots, viewMode, filterById)
  const [activeId, setActiveId] = useState(() => tabIds[0] ?? null)

  const resolvedActiveId = tabIds.includes(activeId) ? activeId : (tabIds[0] ?? null)

  // Local slot state — diverges from result.slots when user makes manual swaps
  const [localSlots, setLocalSlots] = useState(result.slots)

  const prevResultRef = useRef(result)
  if (prevResultRef.current !== result) {
    prevResultRef.current = result
    setLocalSlots(result.slots)
  }

  // Drag-and-drop refs
  const dragSlotRef    = useRef(null)
  const dragCellRef    = useRef(null)
  const [dragOverKey, setDragOverKey]   = useState(null)
  const [dropHintKind, setDropHintKind] = useState(null)

  const [notification, setNotification] = useState(null)

  const isDnDEnabled = !!onSlotsChange
  const isLockEnabled = !!onToggleLock

  const activeSlots = localSlots.filter(s => {
    if (viewMode === 'section') return s.section_id === resolvedActiveId
    if (viewMode === 'teacher') return s.teacher_id === resolvedActiveId
    return s.room_id === resolvedActiveId
  })

  const { byKey, coveredSet, spanMap } = buildGridMaps(activeSlots, subjectMap)
  const periods = Array.from({ length: periodsPerDay }, (_, i) => i)

  // ── DnD handlers ─────────────────────────────────────────────────────────

  const handleDragStart = useCallback((e, slot, day, period) => {
    dragSlotRef.current = slot
    dragCellRef.current = { day_of_week: day, period_index: period }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `${day}:${period}`)
  }, [])

  const handleDragOver = useCallback((e, day, period) => {
    e.preventDefault()
    const key = `${day}:${period}`
    if (dragOverKey !== key) {
      setDragOverKey(key)

      if (dragSlotRef.current) {
        const targetSlot = localSlots.find(
          s => s.day_of_week === day && s.period_index === period
        ) ?? null
        const meta = { subjectMap, teacherMap, sectionMap, roomMap, teacherUnavailMap, teacherPrefsMap, workingDays: sanitizedWorkingDays, periodsPerDay }
        const { ok, violations, warnings } = validateSwap(
          dragSlotRef.current,
          targetSlot,
          { day_of_week: day, period_index: period },
          localSlots,
          meta
        )
        if (!ok) setDropHintKind('error')
        else if (warnings.length > 0) setDropHintKind('warn')
        else setDropHintKind('ok')
      }
    }
    e.dataTransfer.dropEffect = 'move'
  }, [dragOverKey, localSlots, subjectMap, teacherMap, sectionMap, roomMap, teacherUnavailMap, teacherPrefsMap, sanitizedWorkingDays, periodsPerDay])

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverKey(null)
      setDropHintKind(null)
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    dragSlotRef.current = null
    dragCellRef.current = null
    setDragOverKey(null)
    setDropHintKind(null)
  }, [])

  const handleDrop = useCallback((e, targetDay, targetPeriod) => {
    e.preventDefault()
    setDragOverKey(null)
    setDropHintKind(null)

    const srcSlot = dragSlotRef.current
    if (!srcSlot) return

    // Block drag of locked slots
    if (lockedSlotIds.has(srcSlot.id)) {
      const msg = '🔒 This slot is locked. Unlock it first before swapping.'
      setNotification({ message: msg, kind: 'error' })
      toast.error(msg, 5000)
      dragSlotRef.current = null
      dragCellRef.current = null
      return
    }

    const targetSlot = localSlots.find(
      s => s.day_of_week === targetDay && s.period_index === targetPeriod
    ) ?? null

    // Block drop onto locked slots
    if (targetSlot && lockedSlotIds.has(targetSlot.id)) {
      const msg = '🔒 Target slot is locked. Unlock it first before swapping.'
      setNotification({ message: msg, kind: 'error' })
      toast.error(msg, 5000)
      dragSlotRef.current = null
      dragCellRef.current = null
      return
    }

    const targetCell = { day_of_week: targetDay, period_index: targetPeriod }
    const meta = { subjectMap, teacherMap, sectionMap, roomMap, teacherUnavailMap, teacherPrefsMap, workingDays: sanitizedWorkingDays, periodsPerDay }

    const { ok, violations, warnings } = validateSwap(srcSlot, targetSlot, targetCell, localSlots, meta)

    if (!ok) {
      const errMsg = violations[0] ?? 'Swap not allowed due to hard constraint violation'
      setNotification({ message: errMsg, kind: 'error' })
      toast.error(errMsg, 6000)
      dragSlotRef.current = null
      dragCellRef.current = null
      return
    }

    const newSlots = applySwap(srcSlot, targetSlot, targetCell, localSlots, subjectMap)
    setLocalSlots(newSlots)
    onSlotsChange?.(newSlots)

    if (warnings.length > 0) {
      const warnMsg = `Swap applied — ${warnings[0]}`
      setNotification({ message: warnMsg, kind: 'warning' })
      toast.warning(warnMsg, 5000)
    } else {
      const succMsg = targetSlot ? 'Periods swapped successfully!' : 'Slot moved successfully!'
      setNotification({ message: succMsg, kind: 'success' })
      toast.success(succMsg)
    }

    dragSlotRef.current = null
    dragCellRef.current = null
  }, [localSlots, lockedSlotIds, subjectMap, teacherMap, sectionMap, roomMap, teacherUnavailMap, teacherPrefsMap, sanitizedWorkingDays, periodsPerDay, onSlotsChange, toast])


  // ── Render ────────────────────────────────────────────────────────────────

  if (tabIds.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-8">No slots in this timetable.</p>
  }

  return (
    <div>
      {/* ── Notification banner ──────────────────────────────────────────── */}
      {notification && (
        <SwapToast
          message={notification.message}
          kind={notification.kind}
          onDismiss={() => setNotification(null)}
        />
      )}

      {/* ── DnD legend & Undo ────────────────────────────────────────────── */}
      {isDnDEnabled && (
        <div className="flex items-center justify-between mb-2 gap-2">
          <p className="text-[10px] text-gray-600 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-brand-500/60" />
            Drag a period cell to swap it with another. Lab blocks move together. (Press <kbd className="px-1 py-0.5 rounded bg-white/10 text-gray-400 font-mono text-[9px]">Ctrl+Z</kbd> to undo)
            {isLockEnabled && (
              <span className="ml-2 flex items-center gap-1">
                · Click <Lock size={9} className="inline text-amber-400 mx-0.5" /> to lock a slot before regenerating
              </span>
            )}
          </p>
          {onUndo && (
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-[11px] font-medium text-gray-300 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              title="Undo last swap (Ctrl+Z)"
            >
              <Undo2 size={11} />
              Undo Swap
            </button>
          )}
        </div>
      )}

      {/* ── Entity tabs ───────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap mb-4">
        {tabIds.map(id => {
          const active = id === resolvedActiveId
          return (
            <button
              key={id}
              onClick={() => setActiveId(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                active
                  ? 'bg-brand-600 border-brand-500 text-white shadow-sm shadow-brand-500/30'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
              }`}
            >
              {tabLabel(id, viewMode, sectionMap, teacherMap, roomMap)}
            </button>
          )
        })}
      </div>

      {/* ── Weekly grid ──────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-14 py-2 px-2 text-left text-gray-500 font-medium bg-white/5 border-b border-r border-white/10">
                #
              </th>
              {sanitizedWorkingDays.map(d => (
                <th
                  key={d}
                  className="py-2 px-2 text-center font-semibold text-gray-300 bg-white/5 border-b border-r border-white/10 last:border-r-0"
                >
                  {DAY_LABELS[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map(p => (
              <tr key={p} className={`h-14 ${p % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                {/* Period label */}
                <td className="py-1.5 px-2 text-center text-gray-600 font-mono border-r border-b border-white/10 bg-white/[0.03] h-full">
                  P{p + 1}
                </td>

                {sanitizedWorkingDays.map(d => {
                  const cellKey = `${d}:${p}`
                  const isHovered  = dragOverKey === cellKey
                  const hintKind   = isHovered ? dropHintKind : null

                  // IMPORTANT: Non-anchor lab cells MUST ALWAYS return null so no extra td is rendered into table rows
                  if (coveredSet.has(cellKey)) return null

                  const slot    = byKey.get(cellKey)
                  const rowSpan = spanMap.get(cellKey) ?? 1
                  const isLab   = rowSpan > 1

                  // ── Empty cell ──────────────────────────────────────────
                  if (!slot) {
                    const emptyCellBorder =
                      hintKind === 'ok'    ? 'ring-2 ring-inset ring-emerald-500/50 bg-emerald-500/5' :
                      hintKind === 'warn'  ? 'ring-2 ring-inset ring-amber-500/50 bg-amber-500/5' :
                      hintKind === 'error' ? 'ring-2 ring-inset ring-red-500/50 bg-red-500/5' : ''

                    return (
                      <td
                        key={d}
                        className={`py-1.5 px-1 border-r border-b border-white/10 last:border-r-0 align-top min-w-[90px] h-full transition-all ${emptyCellBorder}`}
                        onDragOver={isDnDEnabled ? e => handleDragOver(e, d, p) : undefined}
                        onDragLeave={isDnDEnabled ? handleDragLeave : undefined}
                        onDrop={isDnDEnabled ? e => handleDrop(e, d, p) : undefined}
                      />
                    )
                  }

                  // ── Occupied cell ───────────────────────────────────────
                  const subj    = subjectMap[slot.subject_id]
                  const teacher = teacherMap[slot.teacher_id]
                  const section = sectionMap[slot.section_id]
                  const room    = roomMap[slot.room_id]
                  const pal     = paletteRef.current[slot.subject_id] ?? PALETTES[0]

                  // Determine lock state — prefer server-persisted is_locked, then client lockedSlotIds
                  const isSlotLocked = lockedSlotIds.has(slot.id) || slot.is_locked === true

                  let secondaryLine = null
                  if (viewMode === 'section') {
                    secondaryLine = teacher?.name
                  } else if (viewMode === 'teacher') {
                    secondaryLine = section?.name ?? section?.code
                  } else {
                    const sec = section?.name ?? section?.code
                    const tch = teacher?.name
                    secondaryLine = [sec, tch].filter(Boolean).join(' · ')
                  }

                  const roomLine = viewMode !== 'room' && room ? room.code : null

                  const isDragging =
                    dragSlotRef.current &&
                    dragSlotRef.current.day_of_week  === d &&
                    dragSlotRef.current.period_index === p

                  const cellRing =
                    isSlotLocked                  ? 'ring-2 ring-amber-400/60' :
                    hintKind === 'ok'             ? 'ring-2 ring-emerald-500/70' :
                    hintKind === 'warn'           ? 'ring-2 ring-amber-500/70' :
                    hintKind === 'error'          ? 'ring-2 ring-red-500/70' : ''

                  const labBlockLabel = isLab && blockSizeFromSubject(subjectMap, slot.subject_id)

                  return (
                    <td
                      key={d}
                      rowSpan={rowSpan}
                      className={`py-1 px-1 border-r border-b border-white/10 last:border-r-0 align-top min-w-[90px] h-full transition-all ${cellRing}`}
                      style={{ height: rowSpan > 1 ? `${rowSpan * 56}px` : '100%' }}
                      onDragOver={isDnDEnabled ? e => handleDragOver(e, d, p) : undefined}
                      onDragLeave={isDnDEnabled ? handleDragLeave : undefined}
                      onDrop={isDnDEnabled ? e => handleDrop(e, d, p) : undefined}
                    >
                      <div
                        className={`relative rounded-lg px-2 py-1.5 border h-full flex flex-col justify-between transition-all select-none group ${
                          isDnDEnabled && !isSlotLocked ? 'cursor-grab active:cursor-grabbing' : ''
                        } ${isDragging ? 'opacity-40 border-dashed scale-95' : ''} ${
                          isSlotLocked ? 'opacity-90' : ''
                        }`}
                        style={{
                          background: isSlotLocked
                            ? `linear-gradient(135deg, ${pal.bg}, rgba(251,191,36,.08))`
                            : pal.bg,
                          borderColor: isSlotLocked ? 'rgba(251,191,36,.5)' : pal.bd,
                        }}
                        draggable={isDnDEnabled && !isSlotLocked}
                        onDragStart={isDnDEnabled && !isSlotLocked ? e => handleDragStart(e, slot, d, p) : undefined}
                        onDragEnd={isDnDEnabled ? handleDragEnd : undefined}
                      >
                        <div>
                          {/* LAB badge */}
                          {isLab && (
                            <span
                              className="absolute top-1.5 right-6 text-[9px] font-bold px-1 rounded shadow-sm"
                              style={{ background: pal.bd, color: pal.tx }}
                            >
                              LAB {labBlockLabel ? `×${labBlockLabel}` : ''}
                            </span>
                          )}

                          {/* Subject name */}
                          <p
                            className="font-semibold leading-tight truncate pr-6"
                            style={{ color: pal.tx }}
                          >
                            {subj?.name ?? subj?.code ?? '—'}
                          </p>

                          {/* Secondary info */}
                          {secondaryLine && (
                            <p className="text-[10px] text-gray-300 truncate mt-0.5 font-medium">
                              {secondaryLine}
                            </p>
                          )}
                        </div>

                        {/* Room code at bottom */}
                        {roomLine && (
                          <p className="text-[9px] text-gray-400 truncate mt-1 border-t border-white/10 pt-0.5">
                            {roomLine}
                          </p>
                        )}

                        {/* ── Lock toggle button ───────────────────────── */}
                        {isLockEnabled && (
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              onToggleLock(slot.id, slot, isLab, spanMap.get(cellKey) ?? 1)
                            }}
                            title={isSlotLocked ? 'Unlock this slot' : 'Lock this slot (pin for regeneration)'}
                            aria-label={isSlotLocked ? 'Unlock slot' : 'Lock slot'}
                            className={`absolute top-1 right-1 p-0.5 rounded transition-all z-10 ${
                              isSlotLocked
                                ? 'text-amber-400 opacity-100 hover:text-amber-300 bg-amber-400/10'
                                : 'text-gray-600 opacity-0 group-hover:opacity-100 hover:text-amber-400 hover:bg-amber-400/10'
                            }`}
                          >
                            {isSlotLocked
                              ? <Lock size={10} />
                              : <LockOpen size={10} />
                            }
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function blockSizeFromSubject(subjectMap, subjectId) {
  const s = subjectMap[subjectId]
  return s?.lab ? (s.lab_consecutive_periods ?? null) : null
}
