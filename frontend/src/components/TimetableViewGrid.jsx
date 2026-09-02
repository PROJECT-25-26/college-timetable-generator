/**
 * TimetableViewGrid — reusable timetable grid component.
 *
 * viewMode:
 *   'section' — tabs = class sections; cell shows subject + teacher
 *   'teacher' — tabs = teachers;       cell shows subject + section
 *   'room'    — tabs = rooms;           cell shows subject + section + teacher
 *
 * Props:
 *   result         TimetableOut (must have .slots[])
 *   subjectMap     id → { name, code, lab, lab_consecutive_periods }
 *   teacherMap     id → { name }
 *   sectionMap     id → { name, code }
 *   roomMap        id → { code, name }
 *   workingDays    number[]  (0-based, e.g. [0,1,2,3,4])
 *   periodsPerDay  number
 *   viewMode       'section' | 'teacher' | 'room'
 *   filterById     optional string — if set, only that entity's tab is shown (for teacher self-view)
 */

import { useState, useRef } from 'react'

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

/** Build palette map: subject_id → colour entry */
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

/** Unique entity IDs for tabs, optionally filtered to one */
function getTabIds(slots, viewMode, filterById) {
  const seen = new Set()
  const ids = []
  for (const s of slots) {
    const id =
      viewMode === 'section' ? s.section_id :
      viewMode === 'teacher' ? s.teacher_id :
      /* room */               s.room_id
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  if (filterById) return ids.filter(id => id === filterById)
  return ids
}

/** Display label for a tab */
function tabLabel(id, viewMode, sectionMap, teacherMap, roomMap) {
  if (viewMode === 'section') return sectionMap[id]?.name ?? id
  if (viewMode === 'teacher') return teacherMap[id]?.name ?? id
  return roomMap[id]?.code ?? roomMap[id]?.name ?? id
}

/**
 * Build grid lookup structures from the activeSlots for one entity tab.
 *
 * The backend saves EACH period of a lab block as a separate slot record
 * (e.g. a 3-period lab block → 3 slot rows with consecutive period_index values).
 * We detect those consecutive same-subject/room/section runs on the same day
 * and merge them into a single rowSpan anchor cell.
 *
 * Returns:
 *   byKey      Map<"day:period", slot>   — slot lookup (all periods)
 *   coveredSet Set<"day:period">         — non-anchor periods of multi-period blocks (skip these)
 *   spanMap    Map<"day:period", number> — rowSpan for each anchor cell (≥2 means lab)
 */
function buildGridMaps(activeSlots) {
  // 1. Index every slot by (day, period)
  const byKey = new Map()
  for (const s of activeSlots) {
    byKey.set(`${s.day_of_week}:${s.period_index}`, s)
  }

  const coveredSet = new Set()
  const spanMap    = new Map()

  // 2. Group by (day | subject_id | room_id | section_id) to find candidates
  const groups = new Map()
  for (const s of activeSlots) {
    const gk = `${s.day_of_week}|${s.subject_id}|${s.room_id}|${s.section_id}`
    if (!groups.has(gk)) groups.set(gk, { day: s.day_of_week, periods: [] })
    groups.get(gk).periods.push(s.period_index)
  }

  // 3. For each group, find consecutive runs ≥ 2 and mark them
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

// ── Main component ────────────────────────────────────────────────────────────
export default function TimetableViewGrid({
  result,
  subjectMap,
  teacherMap,
  sectionMap,
  roomMap,
  workingDays,
  periodsPerDay,
  viewMode = 'section',
  filterById,
}) {
  const paletteRef = useRef(null)
  paletteRef.current = buildPaletteMap(result.slots)

  const tabIds = getTabIds(result.slots, viewMode, filterById)
  const [activeId, setActiveId] = useState(() => tabIds[0] ?? null)

  // Keep activeId valid when tabs change (e.g. switching viewMode)
  const resolvedActiveId = tabIds.includes(activeId) ? activeId : (tabIds[0] ?? null)

  // Slots for the active tab entity
  const activeSlots = result.slots.filter(s => {
    if (viewMode === 'section') return s.section_id === resolvedActiveId
    if (viewMode === 'teacher') return s.teacher_id === resolvedActiveId
    return s.room_id === resolvedActiveId
  })

  // Build grid lookup maps — handles lab rowspan merging from actual slot data
  const { byKey, coveredSet, spanMap } = buildGridMaps(activeSlots)

  const periods = Array.from({ length: periodsPerDay }, (_, i) => i)

  if (tabIds.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">No slots in this timetable.</p>
    )
  }

  return (
    <div>
      {/* ── Entity tabs ──────────────────────────────────────────────────── */}
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
              {workingDays.map(d => (
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

                {workingDays.map(d => {
                  const cellKey = `${d}:${p}`

                  // This cell is part of a lab block started in an earlier row — skip it
                  if (coveredSet.has(cellKey)) return null

                  const slot = byKey.get(cellKey)
                  if (!slot) {
                    return (
                      <td
                        key={d}
                        className="py-1.5 px-1 border-r border-b border-white/10 last:border-r-0 align-top min-w-[90px] h-full"
                      />
                    )
                  }

                  const subj    = subjectMap[slot.subject_id]
                  const teacher = teacherMap[slot.teacher_id]
                  const section = sectionMap[slot.section_id]
                  const room    = roomMap[slot.room_id]
                  const pal     = paletteRef.current[slot.subject_id] ?? PALETTES[0]

                  // rowSpan from detected consecutive same-subject blocks
                  const rowSpan = spanMap.get(cellKey) ?? 1
                  const isLab   = rowSpan > 1

                  // Secondary info line depends on view mode
                  let secondaryLine = null
                  if (viewMode === 'section') {
                    secondaryLine = teacher?.name
                  } else if (viewMode === 'teacher') {
                    secondaryLine = section?.name ?? section?.code
                  } else {
                    // room view: section + teacher
                    const sec = section?.name ?? section?.code
                    const tch = teacher?.name
                    secondaryLine = [sec, tch].filter(Boolean).join(' · ')
                  }

                  // Room code shown as a small hint in section / teacher views
                  const roomLine = viewMode !== 'room' && room ? room.code : null

                  return (
                    <td
                      key={d}
                      rowSpan={rowSpan}
                      className="py-1 px-1 border-r border-b border-white/10 last:border-r-0 align-top min-w-[90px] h-full"
                      style={{ height: rowSpan > 1 ? `${rowSpan * 56}px` : '100%' }}
                    >
                      <div
                        className="relative rounded-lg px-2 py-1.5 border h-full flex flex-col justify-between"
                        style={{ background: pal.bg, borderColor: pal.bd }}
                      >
                        <div>
                          {/* LAB badge */}
                          {isLab && (
                            <span
                              className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1 rounded shadow-sm"
                              style={{ background: pal.bd, color: pal.tx }}
                            >
                              LAB
                            </span>
                          )}

                          {/* Subject name */}
                          <p
                            className="font-semibold leading-tight truncate pr-4"
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
