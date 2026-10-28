/**
 * GlobalSearchModal.jsx — Search teacher schedules, room schedules, or free slots with filters.
 *
 * Supports keyboard shortcut: Ctrl+K / Cmd+K
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, X, Users, DoorOpen, Sparkles, Filter, Clock,
  Calendar, CheckCircle2, AlertCircle, Loader2, ChevronRight,
} from 'lucide-react'
import { timetablesApi } from '../api'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8]

export default function GlobalSearchModal({ isOpen, onClose, timetableId = 'latest' }) {
  const inputRef = useRef(null)

  // Filters
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all') // 'all' | 'teacher' | 'room' | 'free_slots'
  const [dayOfWeek, setDayOfWeek] = useState('') // '' (all) or '0'..'6'
  const [minPeriod, setMinPeriod] = useState(0)
  const [maxPeriod, setMaxPeriod] = useState(7)
  const [roomType, setRoomType] = useState('') // '' | 'classroom' | 'lab' | 'seminar'

  // Results & state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      fetchSearch()
    }
  }, [isOpen])

  // Trigger search on filter changes
  const fetchSearch = useCallback(async () => {
    if (!isOpen) return
    setLoading(true)
    setError(null)
    try {
      const params = {
        q: query || undefined,
        entity_type: tab,
        day_of_week: dayOfWeek !== '' ? Number(dayOfWeek) : undefined,
        min_period: minPeriod,
        max_period: maxPeriod,
        room_type: roomType || undefined,
      }
      const res = await timetablesApi.search(timetableId, params)
      setResults(res.data)
    } catch (err) {
      console.error('Global search error:', err)
      setError('No timetable found or failed to load schedule search.')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [isOpen, timetableId, query, tab, dayOfWeek, minPeriod, maxPeriod, roomType])

  // Debounced search when query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOpen) fetchSearch()
    }, 250)
    return () => clearTimeout(timer)
  }, [query, tab, dayOfWeek, minPeriod, maxPeriod, roomType, isOpen, fetchSearch])

  if (!isOpen) return null

  const hasTeacherResults = results?.teachers && results.teachers.length > 0
  const hasRoomResults = results?.rooms && results.rooms.length > 0
  const hasFreeSlotResults = results?.free_slots && results.free_slots.length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-white/15 bg-gray-900/95 shadow-2xl backdrop-blur-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="p-4 border-b border-white/10 space-y-3 bg-white/[0.02]">
          <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 transition-all">
            <Search size={18} className="text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teacher, room, subject, or class schedule… (e.g. Dr. Turing, L101, CS201)"
              className="w-full bg-transparent text-sm text-gray-100 placeholder-gray-500 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            )}
            <kbd className="hidden sm:inline-block px-2 py-0.5 rounded bg-white/10 text-gray-400 font-mono text-[10px]">
              ESC
            </kbd>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setTab('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${
                tab === 'all'
                  ? 'bg-brand-600 border border-brand-500 text-white shadow-sm shadow-brand-500/30'
                  : 'bg-white/5 border border-white/10 text-gray-400 hover:text-gray-200'
              }`}
            >
              <Sparkles size={13} /> All Schedule Search
            </button>

            <button
              onClick={() => setTab('teacher')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${
                tab === 'teacher'
                  ? 'bg-teal-600 border border-teal-500 text-white shadow-sm shadow-teal-500/30'
                  : 'bg-white/5 border border-white/10 text-gray-400 hover:text-gray-200'
              }`}
            >
              <Users size={13} /> Teachers
            </button>

            <button
              onClick={() => setTab('room')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${
                tab === 'room'
                  ? 'bg-purple-600 border border-purple-500 text-white shadow-sm shadow-purple-500/30'
                  : 'bg-white/5 border border-white/10 text-gray-400 hover:text-gray-200'
              }`}
            >
              <DoorOpen size={13} /> Rooms
            </button>

            <button
              onClick={() => setTab('free_slots')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${
                tab === 'free_slots'
                  ? 'bg-emerald-600 border border-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'bg-white/5 border border-white/10 text-gray-400 hover:text-gray-200'
              }`}
            >
              <Clock size={13} /> Find Free Slots
            </button>
          </div>

          {/* Advanced Filter Bar */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5 text-xs text-gray-300">
            <span className="flex items-center gap-1 font-semibold text-gray-400">
              <Filter size={12} /> Filters:
            </span>

            {/* Day Filter */}
            <div className="flex items-center gap-1">
              <span className="text-gray-400">Day:</span>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
                className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-200 focus:outline-none"
              >
                <option value="" className="bg-gray-900">All Days (Mon-Fri)</option>
                {DAY_NAMES.slice(0, 5).map((d, i) => (
                  <option key={i} value={i} className="bg-gray-900">{d}</option>
                ))}
              </select>
            </div>

            {/* Period Range Filter */}
            <div className="flex items-center gap-1">
              <span className="text-gray-400">Periods:</span>
              <select
                value={minPeriod}
                onChange={(e) => setMinPeriod(Number(e.target.value))}
                className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-200 focus:outline-none"
              >
                {PERIODS.map((p, i) => (
                  <option key={i} value={i} className="bg-gray-900">P{p}</option>
                ))}
              </select>
              <span>to</span>
              <select
                value={maxPeriod}
                onChange={(e) => setMaxPeriod(Number(e.target.value))}
                className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-200 focus:outline-none"
              >
                {PERIODS.map((p, i) => (
                  <option key={i} value={i} className="bg-gray-900">P{p}</option>
                ))}
              </select>
            </div>

            {/* Room Type Filter */}
            <div className="flex items-center gap-1">
              <span className="text-gray-400">Room Type:</span>
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-200 focus:outline-none"
              >
                <option value="" className="bg-gray-900">All Types</option>
                <option value="classroom" className="bg-gray-900">Classroom</option>
                <option value="lab" className="bg-gray-900">Lab</option>
                <option value="seminar" className="bg-gray-900">Seminar</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-400 text-sm">
              <Loader2 size={18} className="animate-spin text-brand-400" />
              Searching schedule matrix…
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-400" />
              {error}
            </div>
          )}

          {!loading && !error && results && (
            <>
              {/* ── TEACHER SCHEDULE RESULTS ── */}
              {(tab === 'all' || tab === 'teacher') && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Users size={14} /> Teacher Schedules ({results.teachers.length})
                    </h4>
                  </div>

                  {!hasTeacherResults ? (
                    <p className="text-xs text-gray-500 italic py-2">No matching teacher schedules found.</p>
                  ) : (
                    <div className="space-y-3">
                      {results.teachers.map((t) => (
                        <div
                          key={t.teacher_id}
                          className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-2.5 hover:bg-white/[0.07] transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-bold text-white">{t.teacher_name}</p>
                              {t.teacher_email && (
                                <p className="text-xs text-gray-400">{t.teacher_email}</p>
                              )}
                            </div>
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-teal-500/15 border border-teal-500/30 text-teal-300">
                              {t.total_occupied_periods} Periods / Week
                            </span>
                          </div>

                          {t.slots.length === 0 ? (
                            <p className="text-xs text-gray-500 italic">No occupied slots match current filters.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {t.slots.map((s) => (
                                <div
                                  key={s.id}
                                  className="px-2.5 py-2 rounded-lg bg-gray-950/60 border border-white/10 text-xs"
                                >
                                  <div className="flex items-center justify-between text-gray-400 text-[10px] font-semibold mb-1">
                                    <span>{DAY_NAMES[s.day_of_week]}</span>
                                    <span className="text-brand-300">P{s.period_index + 1}</span>
                                  </div>
                                  <p className="font-bold text-gray-200 truncate">
                                    {s.subject_name ? `${s.subject_name} (${s.subject_code})` : s.subject_code}
                                  </p>
                                  <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                                    <span>Class: {s.section_name || s.section_code}</span>
                                    <span className="text-gray-300 font-medium">Room: {s.room_code}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── ROOM SCHEDULE RESULTS ── */}
              {(tab === 'all' || tab === 'room') && (
                <div>
                  <div className="flex items-center justify-between mb-3 mt-4">
                    <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                      <DoorOpen size={14} /> Room Schedules ({results.rooms.length})
                    </h4>
                  </div>

                  {!hasRoomResults ? (
                    <p className="text-xs text-gray-500 italic py-2">No matching room schedules found.</p>
                  ) : (
                    <div className="space-y-3">
                      {results.rooms.map((r) => (
                        <div
                          key={r.room_id}
                          className="rounded-xl border border-white/10 bg-white/5 p-3.5 space-y-2.5 hover:bg-white/[0.07] transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{r.room_name} ({r.room_code})</span>
                              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                {r.room_type}
                              </span>
                            </div>
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/10 text-gray-300">
                              {r.total_occupied_periods} Periods Occupied
                            </span>
                          </div>

                          {r.slots.length === 0 ? (
                            <p className="text-xs text-gray-500 italic">No classes scheduled in this room for current filters.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {r.slots.map((s) => (
                                <div
                                  key={s.id}
                                  className="px-2.5 py-2 rounded-lg bg-gray-950/60 border border-white/10 text-xs"
                                >
                                  <div className="flex items-center justify-between text-gray-400 text-[10px] font-semibold mb-1">
                                    <span>{DAY_NAMES[s.day_of_week]}</span>
                                    <span className="text-purple-300">P{s.period_index + 1}</span>
                                  </div>
                                  <p className="font-bold text-gray-200 truncate">
                                    {s.subject_name ? `${s.subject_name} (${s.subject_code})` : s.subject_code}
                                  </p>
                                  <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                                    <span>Class: {s.section_name || s.section_code}</span>
                                    <span className="text-teal-300 truncate max-w-[90px]">{s.teacher_name}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── FREE SLOTS FINDER ── */}
              {(tab === 'all' || tab === 'free_slots') && (
                <div>
                  <div className="flex items-center justify-between mb-3 mt-4">
                    <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={14} /> Available / Free Room Slots ({results.free_slots.length})
                    </h4>
                  </div>

                  {!hasFreeSlotResults ? (
                    <p className="text-xs text-gray-500 italic py-2">No free room slots match your selected filters.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                      {results.free_slots.map((fs, idx) => (
                        <div
                          key={`${fs.room_id}-${fs.day_of_week}-${fs.period_index}-${idx}`}
                          className="px-3 py-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/15 transition-all flex flex-col justify-between"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs text-white">{fs.room_code}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              {fs.room_type}
                            </span>
                          </div>
                          <p className="text-[11px] text-emerald-200 font-medium truncate">{fs.room_name}</p>
                          <div className="flex items-center justify-between text-[10px] text-emerald-300/80 font-mono mt-2 pt-1 border-t border-emerald-500/20">
                            <span>{DAY_SHORT[fs.day_of_week]}</span>
                            <span>Period {fs.period_index + 1}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
