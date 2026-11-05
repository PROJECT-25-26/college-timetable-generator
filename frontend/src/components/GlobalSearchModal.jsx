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

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const hasTeacherResults = results?.teachers && results.teachers.length > 0
  const hasRoomResults = results?.rooms && results.rooms.length > 0
  const hasFreeSlotResults = results?.free_slots && results.free_slots.length > 0

  return (
    <div
      className="modal-overlay"
      style={{ alignItems: 'flex-start', paddingTop: '64px' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search schedules"
    >
      <div
        className="modal-panel max-w-4xl w-full flex flex-col overflow-hidden"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--c-border)',
            background: 'var(--c-surface)',
          }}
          className="space-y-3"
        >
          {/* Main search bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--c-ground)',
              border: '1px solid var(--c-border)',
              transition: 'all 0.15s ease',
            }}
          >
            <Search size={18} color="var(--c-muted)" className="shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teacher, room, subject, or class schedule… (e.g. Dr. Turing, L101, CS201)"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '0.875rem',
                color: 'var(--c-body)',
                fontFamily: 'Figtree, sans-serif',
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--c-muted)',
                  padding: 2,
                }}
                aria-label="Clear query"
              >
                <X size={16} />
              </button>
            )}
            <kbd
              style={{
                display: 'inline-block',
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'var(--c-surface)',
                border: '1px solid var(--c-border)',
                color: 'var(--c-muted)',
                fontSize: '0.6875rem',
                fontFamily: 'monospace',
                fontWeight: 600,
              }}
            >
              ESC
            </kbd>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setTab('all')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 'var(--r-btn)',
                fontWeight: 600,
                fontSize: '0.75rem',
                border: tab === 'all' ? '1px solid var(--c-primary)' : '1px solid var(--c-border)',
                background: tab === 'all' ? 'var(--c-primary)' : 'var(--c-surface)',
                color: tab === 'all' ? '#FFFFFF' : 'var(--c-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Sparkles size={13} strokeWidth={2} /> All schedules
            </button>

            <button
              onClick={() => setTab('teacher')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 'var(--r-btn)',
                fontWeight: 600,
                fontSize: '0.75rem',
                border: tab === 'teacher' ? '1px solid var(--c-primary)' : '1px solid var(--c-border)',
                background: tab === 'teacher' ? 'var(--c-primary)' : 'var(--c-surface)',
                color: tab === 'teacher' ? '#FFFFFF' : 'var(--c-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Users size={13} strokeWidth={2} /> Teachers
            </button>

            <button
              onClick={() => setTab('room')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 'var(--r-btn)',
                fontWeight: 600,
                fontSize: '0.75rem',
                border: tab === 'room' ? '1px solid var(--c-primary)' : '1px solid var(--c-border)',
                background: tab === 'room' ? 'var(--c-primary)' : 'var(--c-surface)',
                color: tab === 'room' ? '#FFFFFF' : 'var(--c-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <DoorOpen size={13} strokeWidth={2} /> Rooms
            </button>

            <button
              onClick={() => setTab('free_slots')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 'var(--r-btn)',
                fontWeight: 600,
                fontSize: '0.75rem',
                border: tab === 'free_slots' ? '1px solid var(--c-primary)' : '1px solid var(--c-border)',
                background: tab === 'free_slots' ? 'var(--c-primary)' : 'var(--c-surface)',
                color: tab === 'free_slots' ? '#FFFFFF' : 'var(--c-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Clock size={13} strokeWidth={2} /> Find free slots
            </button>
          </div>

          {/* Advanced Filter Bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 12,
              paddingTop: 8,
              borderTop: '1px solid var(--c-border)',
              fontSize: '0.75rem',
              color: 'var(--c-muted)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, color: 'var(--c-body)' }}>
              <Filter size={12} strokeWidth={2} /> Filters:
            </span>

            {/* Day Filter */}
            <div className="flex items-center gap-1.5">
              <span>Day:</span>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
                className="form-input"
                style={{ padding: '3px 8px', fontSize: '0.75rem', minHeight: 30 }}
              >
                <option value="">All days (Mon–Fri)</option>
                {DAY_NAMES.slice(0, 5).map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>

            {/* Period Range Filter */}
            <div className="flex items-center gap-1.5">
              <span>Periods:</span>
              <select
                value={minPeriod}
                onChange={(e) => setMinPeriod(Number(e.target.value))}
                className="form-input"
                style={{ padding: '3px 8px', fontSize: '0.75rem', minHeight: 30 }}
              >
                {PERIODS.map((p, i) => (
                  <option key={i} value={i}>P{p}</option>
                ))}
              </select>
              <span>to</span>
              <select
                value={maxPeriod}
                onChange={(e) => setMaxPeriod(Number(e.target.value))}
                className="form-input"
                style={{ padding: '3px 8px', fontSize: '0.75rem', minHeight: 30 }}
              >
                {PERIODS.map((p, i) => (
                  <option key={i} value={i}>P{p}</option>
                ))}
              </select>
            </div>

            {/* Room Type Filter */}
            <div className="flex items-center gap-1.5">
              <span>Room type:</span>
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                className="form-input"
                style={{ padding: '3px 8px', fontSize: '0.75rem', minHeight: 30 }}
              >
                <option value="">All types</option>
                <option value="classroom">Classroom</option>
                <option value="lab">Lab</option>
                <option value="seminar">Seminar</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6" style={{ background: 'var(--c-ground)' }}>
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12" style={{ color: 'var(--c-muted)', fontSize: '0.875rem' }}>
              <Loader2 size={18} className="animate-spin text-primary" />
              Searching schedule matrix…
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--r-btn)',
                background: 'rgba(198,40,40,0.08)',
                border: '1px solid rgba(198,40,40,0.20)',
                color: '#c62828',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && results && (
            <>
              {/* ── TEACHER SCHEDULE RESULTS ── */}
              {(tab === 'all' || tab === 'teacher') && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4
                      style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        color: 'var(--c-body)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        margin: 0,
                      }}
                    >
                      <Users size={14} color="var(--c-primary)" /> Teacher schedules ({results.teachers.length})
                    </h4>
                  </div>

                  {!hasTeacherResults ? (
                    <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                      No matching teacher schedules found.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {results.teachers.map((t) => (
                        <div
                          key={t.teacher_id}
                          className="card"
                          style={{
                            padding: '14px 16px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--c-body)', margin: 0 }}>
                                {t.teacher_name}
                              </p>
                              {t.teacher_email && (
                                <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', margin: 0 }}>
                                  {t.teacher_email}
                                </p>
                              )}
                            </div>
                            <span
                              style={{
                                fontSize: '0.6875rem',
                                fontWeight: 600,
                                padding: '3px 9px',
                                borderRadius: 'var(--r-chip)',
                                background: 'rgba(46,42,107,0.08)',
                                color: 'var(--c-primary)',
                                border: '1px solid var(--c-border)',
                              }}
                            >
                              {t.total_occupied_periods} periods/week
                            </span>
                          </div>

                          {t.slots.length === 0 ? (
                            <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', fontStyle: 'italic', margin: 0 }}>
                              No occupied slots match current filters.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {t.slots.map((s) => (
                                <div
                                  key={s.id}
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: 'var(--r-btn)',
                                    background: 'var(--c-surface)',
                                    border: '1px solid var(--c-border)',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      color: 'var(--c-muted)',
                                      fontSize: '0.6875rem',
                                      fontWeight: 600,
                                      marginBottom: 2,
                                    }}
                                  >
                                    <span>{DAY_NAMES[s.day_of_week]}</span>
                                    <span style={{ color: 'var(--c-primary)', fontWeight: 700 }}>
                                      P{s.period_index + 1}
                                    </span>
                                  </div>
                                  <p style={{ fontWeight: 600, color: 'var(--c-body)', margin: 0 }} className="truncate">
                                    {s.subject_name ? `${s.subject_name} (${s.subject_code})` : s.subject_code}
                                  </p>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      fontSize: '0.6875rem',
                                      color: 'var(--c-muted)',
                                      marginTop: 4,
                                    }}
                                  >
                                    <span>Class: {s.section_name || s.section_code}</span>
                                    <span style={{ color: 'var(--c-body)', fontWeight: 500 }}>
                                      Room: {s.room_code}
                                    </span>
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
                    <h4
                      style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        color: 'var(--c-body)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        margin: 0,
                      }}
                    >
                      <DoorOpen size={14} color="var(--c-primary)" /> Room schedules ({results.rooms.length})
                    </h4>
                  </div>

                  {!hasRoomResults ? (
                    <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                      No matching room schedules found.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {results.rooms.map((r) => (
                        <div
                          key={r.room_id}
                          className="card"
                          style={{
                            padding: '14px 16px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--c-body)' }}>
                                {r.room_name} ({r.room_code})
                              </span>
                              <span
                                style={{
                                  fontSize: '0.625rem',
                                  textTransform: 'uppercase',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'rgba(46,42,107,0.08)',
                                  color: 'var(--c-primary)',
                                  border: '1px solid var(--c-border)',
                                }}
                              >
                                {r.room_type}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: '0.6875rem',
                                fontWeight: 600,
                                padding: '3px 9px',
                                borderRadius: 'var(--r-chip)',
                                background: 'rgba(46,42,107,0.06)',
                                color: 'var(--c-muted)',
                              }}
                            >
                              {r.total_occupied_periods} periods occupied
                            </span>
                          </div>

                          {r.slots.length === 0 ? (
                            <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', fontStyle: 'italic', margin: 0 }}>
                              No classes scheduled in this room for current filters.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {r.slots.map((s) => (
                                <div
                                  key={s.id}
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: 'var(--r-btn)',
                                    background: 'var(--c-surface)',
                                    border: '1px solid var(--c-border)',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      color: 'var(--c-muted)',
                                      fontSize: '0.6875rem',
                                      fontWeight: 600,
                                      marginBottom: 2,
                                    }}
                                  >
                                    <span>{DAY_NAMES[s.day_of_week]}</span>
                                    <span style={{ color: 'var(--c-primary)', fontWeight: 700 }}>
                                      P{s.period_index + 1}
                                    </span>
                                  </div>
                                  <p style={{ fontWeight: 600, color: 'var(--c-body)', margin: 0 }} className="truncate">
                                    {s.subject_name ? `${s.subject_name} (${s.subject_code})` : s.subject_code}
                                  </p>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      fontSize: '0.6875rem',
                                      color: 'var(--c-muted)',
                                      marginTop: 4,
                                    }}
                                  >
                                    <span>Class: {s.section_name || s.section_code}</span>
                                    <span style={{ color: 'var(--c-body)', fontWeight: 500 }} className="truncate max-w-[120px]">
                                      {s.teacher_name}
                                    </span>
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
                    <h4
                      style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        color: 'var(--c-body)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        margin: 0,
                      }}
                    >
                      <Clock size={14} color="#2e7d32" /> Available / free room slots ({results.free_slots.length})
                    </h4>
                  </div>

                  {!hasFreeSlotResults ? (
                    <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                      No free room slots match your selected filters.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                      {results.free_slots.map((fs, idx) => (
                        <div
                          key={`${fs.room_id}-${fs.day_of_week}-${fs.period_index}-${idx}`}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 'var(--r-btn)',
                            border: '1px solid rgba(46,125,50,0.20)',
                            background: 'rgba(46,125,50,0.04)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--c-body)' }}>
                              {fs.room_code}
                            </span>
                            <span
                              style={{
                                fontSize: '0.5625rem',
                                textTransform: 'uppercase',
                                fontWeight: 700,
                                padding: '2px 5px',
                                borderRadius: '4px',
                                background: 'rgba(46,125,50,0.12)',
                                color: '#2e7d32',
                              }}
                            >
                              {fs.room_type}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.6875rem', color: 'var(--c-muted)', margin: '2px 0 0 0' }} className="truncate">
                            {fs.room_name}
                          </p>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.625rem',
                              fontFamily: 'monospace',
                              color: 'var(--c-body)',
                              marginTop: 8,
                              paddingTop: 4,
                              borderTop: '1px solid rgba(46,125,50,0.15)',
                            }}
                          >
                            <span>{DAY_SHORT[fs.day_of_week]}</span>
                            <span style={{ fontWeight: 600 }}>Period {fs.period_index + 1}</span>
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
