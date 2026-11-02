/**
 * TeacherDashboard — the personal view for logged-in teachers.
 *
 * Displays:
 *   1. Welcome header with faculty profile info
 *   2. My Timetable grid & Export modal
 *   3. Daily Commute Path (TeacherCommuteTimeline)
 *   4. Subject Preferences (view & inline editor)
 *   5. Unavailable slots list
 *   6. Schedule Change Request form
 *   7. Request history
 */

import { useEffect, useState } from 'react'
import {
  BookOpen, Clock, SendHorizonal, CheckCircle2, XCircle, Loader2,
  CalendarDays, AlertCircle, ClipboardList, User, Star, Check, X,
  Pencil, Save, RotateCcw, Plus, Trash2, Calendar, Download, FileText, FileSpreadsheet,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { teachersApi, subjectsApi, timetablesApi, classSectionsApi, roomsApi } from '../api'
import TimetableViewGrid from '../components/TimetableViewGrid'
import TeacherCommuteTimeline from '../components/TeacherCommuteTimeline'
import ExportModal from '../components/ExportModal'

const DAYS    = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const PERIODS = Array.from({ length: 8 }, (_, i) => `Period ${i + 1}`)

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  color: '#b45309', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)' },
  approved: { label: 'Approved', color: '#15803d', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)' },
  rejected: { label: 'Rejected', color: '#b91c1c', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)' },
}

/* ──────────────────────────────────────────────
   Preference type config
────────────────────────────────────────────── */
const PREF_CONFIG = {
  preferred: {
    label: 'Preferred',
    Icon: Star,
    badgeBg: 'rgba(34,197,94,0.10)',
    badgeBorder: 'rgba(34,197,94,0.30)',
    color: '#15803d',
  },
  willing: {
    label: 'Willing',
    Icon: Check,
    badgeBg: 'rgba(46,42,107,0.08)',
    badgeBorder: 'rgba(46,42,107,0.20)',
    color: 'var(--c-primary)',
  },
  avoid: {
    label: 'Avoid',
    Icon: X,
    badgeBg: 'rgba(239,68,68,0.10)',
    badgeBorder: 'rgba(239,68,68,0.25)',
    color: '#b91c1c',
  },
}

/* ──────────────────────────────────────────────
   Preference badge (read-only)
────────────────────────────────────────────── */
function PrefBadge({ type }) {
  const cfg = PREF_CONFIG[type] ?? PREF_CONFIG.willing
  const { Icon } = cfg
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--r-chip)',
        fontSize: '0.6875rem',
        fontWeight: 600,
        background: cfg.badgeBg,
        border: `1px solid ${cfg.badgeBorder}`,
        color: cfg.color,
      }}
    >
      <Icon size={10} strokeWidth={2.5} />
      {cfg.label}
    </span>
  )
}

export default function TeacherDashboard() {
  const { user, requests, addRequest } = useAuth()

  const [teacher, setTeacher]   = useState(null)
  const [allTeachers, setAllTeachers] = useState([])
  const [allSubjects, setAllSubjects] = useState([])
  const [loadErr, setLoadErr]   = useState(null)
  const [busy,    setBusy]      = useState(true)

  // Edit-preferences state
  const [editingPrefs, setEditingPrefs] = useState(false)
  const [prefLinks, setPrefLinks]       = useState([])
  const [savingPrefs, setSavingPrefs]   = useState(false)
  const [prefSaveErr, setPrefSaveErr]   = useState(null)

  // Form state (schedule change request)
  const [form, setForm]     = useState({ day: '0', period: '0', reason: '' })
  const [sending, setSend]  = useState(false)
  const [sent,    setSent]  = useState(false)

  // Timetable state (My Timetable section)
  const [timetable,     setTimetable]     = useState(null)   // TimetableOut | null
  const [ttLoading,     setTtLoading]     = useState(true)
  const [ttErr,         setTtErr]         = useState(null)
  const [subjectMap,    setSubjectMap]    = useState({})
  const [sectionMap,    setSectionMap]    = useState({})
  const [roomMap,       setRoomMap]       = useState({})
  const [teacherMap,    setTeacherMap]    = useState({})
  const [workingDays,   setWorkingDays]   = useState([0, 1, 2, 3, 4])
  const [periodsPerDay, setPeriodsPerDay] = useState(8)
  const [exportModalOpen, setExportModalOpen] = useState(false)

  // Fetch teacher detail + all subjects with fallback matching
  useEffect(() => {
    async function loadData() {
      setBusy(true)
      setLoadErr(null)
      try {
        const subjectsRes = await subjectsApi.list()
        setAllSubjects(subjectsRes.data)

        let activeTeacher = null

        // 1. Try fetching by user.id if available
        if (user?.id && user.id !== 'admin') {
          try {
            const tRes = await teachersApi.get(user.id)
            activeTeacher = tRes.data
          } catch {
            // ID lookup failed (e.g. 404), fall through to list search
          }
        }

        // 2. Fallback: fetch teachers list and find matching profile
        if (!activeTeacher) {
          const teachListRes = await teachersApi.list()
          const list = teachListRes.data ?? []
          if (list.length > 0) {
            activeTeacher =
              list.find((t) => t.id === user?.id) ||
              list.find((t) => t.email && user?.email && t.email.toLowerCase() === user.email.toLowerCase()) ||
              list.find((t) => user?.name && t.name.toLowerCase().includes(user.name.toLowerCase())) ||
              list[0]
          }
        }

        if (activeTeacher) {
          setTeacher(activeTeacher)
          setPrefLinks(
            (activeTeacher.subject_links ?? []).map((l) => ({
              subject_id: l.subject_id,
              preference_rank: l.preference_rank,
              preference_type: l.preference_type ?? 'willing',
            }))
          )
        } else {
          setLoadErr('No teacher profiles exist in the system yet. Please ask an administrator to add teachers in the Teachers page.')
        }
      } catch (err) {
        console.error('Failed to load teacher profile:', err)
        const msg = err.message === 'Network Error' || err.code === 'ERR_NETWORK'
          ? 'Network error: Cannot reach backend server. Please ensure backend service is running.'
          : (err.message ?? 'Could not load your profile.')
        setLoadErr(msg)
      } finally {
        setBusy(false)
      }
    }

    loadData()
  }, [user?.id, user?.email, user?.name])

  // Fetch latest timetable + entity maps for "My Timetable" section
  useEffect(() => {
    async function loadTimetable() {
      setTtLoading(true)
      setTtErr(null)
      try {
        const [subRes, secRes, rmRes, tchRes] = await Promise.all([
          subjectsApi.list(),
          classSectionsApi.list(),
          roomsApi.list(),
          teachersApi.list(),
        ])
        setSubjectMap(Object.fromEntries(
          subRes.data.map(s => [s.id, { name: s.name, code: s.code, lab: s.lab, lab_consecutive_periods: s.lab_consecutive_periods }])
        ))
        setSectionMap(Object.fromEntries(secRes.data.map(s => [s.id, { name: s.name, code: s.code }])))
        setRoomMap(Object.fromEntries(rmRes.data.map(r => [r.id, { code: r.code, name: r.name }])))
        setTeacherMap(Object.fromEntries(tchRes.data.map(t => [t.id, { name: t.name }])))
        setAllTeachers(tchRes.data ?? [])

        // Fetch timetable — try latest() first, fallback to list() -> get(id)
        let ttData = null
        try {
          const ttRes = await timetablesApi.latest()
          ttData = ttRes.data
        } catch {
          // Fallback: list runs and grab the latest one
          const listRes = await timetablesApi.list()
          const runs = listRes.data ?? []
          const okRun = runs.find(r => r.status === 'ok') || runs[0]
          if (okRun) {
            const runRes = await timetablesApi.get(okRun.id)
            ttData = runRes.data
          }
        }

        if (!ttData) {
          setTtErr('no_timetable')
        } else {
          setTimetable(ttData)
          const slots = ttData.slots ?? []
          if (slots.length > 0) {
            const days = [...new Set(slots.map(s => s.day_of_week))]
              .filter(d => d >= 0 && d <= 4)
              .sort((a, b) => a - b)
            const maxPeriod = Math.max(...slots.map(s => s.period_index))
            setWorkingDays(days.length > 0 ? days : [0, 1, 2, 3, 4])
            setPeriodsPerDay(maxPeriod + 1)
          }
        }
      } catch (err) {
        setTtErr('fetch_failed')
      } finally {
        setTtLoading(false)
      }
    }
    loadTimetable()
  }, [])

  const myRequests = requests.filter(r => r.teacherId === user?.id)

  /* ── Preference helpers ── */
  const usedSubjectIds = new Set(prefLinks.map((l) => l.subject_id))
  const availableSubjects = allSubjects.filter((s) => !usedSubjectIds.has(s.id))

  function addSubjectLink() {
    if (availableSubjects.length === 0) return
    setPrefLinks((prev) => [
      ...prev,
      { subject_id: availableSubjects[0].id, preference_rank: prev.length + 1, preference_type: 'willing' },
    ])
  }

  function removeSubjectLink(subjectId) {
    setPrefLinks((prev) => prev.filter((l) => l.subject_id !== subjectId))
  }

  function updatePrefLink(subjectId, field, value) {
    setPrefLinks((prev) =>
      prev.map((l) => l.subject_id === subjectId ? { ...l, [field]: value } : l)
    )
  }

  async function savePreferences() {
    setSavingPrefs(true)
    setPrefSaveErr(null)
    try {
      const res = await teachersApi.updatePreferences(teacher.id, { subject_links: prefLinks })
      setTeacher(res.data)
      setPrefLinks(
        (res.data.subject_links ?? []).map((l) => ({
          subject_id: l.subject_id,
          preference_rank: l.preference_rank,
          preference_type: l.preference_type ?? 'willing',
        }))
      )
      setEditingPrefs(false)
    } catch (err) {
      setPrefSaveErr(err.message ?? 'Failed to save preferences. Please try again.')
    } finally {
      setSavingPrefs(false)
    }
  }

  function cancelEdit() {
    setPrefLinks(
      (teacher?.subject_links ?? []).map((l) => ({
        subject_id: l.subject_id,
        preference_rank: l.preference_rank,
        preference_type: l.preference_type ?? 'willing',
      }))
    )
    setPrefSaveErr(null)
    setEditingPrefs(false)
  }

  /* ── Request submit ── */
  const handleRequestSubmit = async (e) => {
    e.preventDefault()
    if (!form.reason.trim()) return
    setSend(true)
    await new Promise(r => setTimeout(r, 600))
    addRequest({
      teacherId:   user.id,
      teacherName: user.name,
      day:         DAYS[parseInt(form.day)],
      period:      PERIODS[parseInt(form.period)],
      reason:      form.reason.trim(),
    })
    setForm({ day: '0', period: '0', reason: '' })
    setSend(false)
    setSent(true)
    setTimeout(() => setSent(false), 3000)
  }

  return (
    <div className="page-wrapper animate-fade-in" style={{ maxWidth: '1440px' }}>

      {/* Welcome header */}
      <header className="card-padded" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 'var(--r-card)',
              background: 'rgba(46,42,107,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--c-primary)',
              flexShrink: 0,
            }}
          >
            <User size={24} strokeWidth={2} />
          </div>
          <div>
            <h1 className="page-heading" style={{ fontSize: '1.25rem', margin: 0 }}>
              Welcome, {user?.name}
            </h1>
            <p className="page-sub" style={{ margin: '4px 0 0 0' }}>
              {teacher?.department?.name
                ? `Department: ${teacher.department.name} (${teacher.department.code})`
                : 'No department assigned'} · {teacher?.email ?? user?.email}
            </p>
          </div>
        </div>
      </header>

      {/* ─── My Timetable section ─── */}
      <section className="card-padded" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} color="var(--c-primary)" strokeWidth={2} />
            <h2
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--c-body)',
                margin: 0,
              }}
            >
              My timetable
            </h2>
          </div>
          {timetable && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setExportModalOpen(true)}
                className="btn btn-secondary btn-sm"
              >
                <Download size={13} strokeWidth={2} /> Export schedule
              </button>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 'var(--r-chip)',
                  background: 'rgba(34,197,94,0.10)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  color: '#15803d',
                }}
              >
                {timetable.slots?.filter(s => s.teacher_id === (teacher?.id || user?.id)).length ?? 0} periods/week
              </span>
            </div>
          )}
        </div>

        {ttLoading && (
          <div className="flex items-center justify-center gap-3 py-10" style={{ color: 'var(--c-muted)' }}>
            <Loader2 size={18} className="animate-spin text-primary" />
            <span style={{ fontSize: '0.875rem' }}>Loading your schedule…</span>
          </div>
        )}

        {!ttLoading && ttErr === 'no_timetable' && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--r-btn)',
                background: 'rgba(46,42,107,0.06)',
                border: '1px solid var(--c-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--c-muted)',
              }}
            >
              <Calendar size={20} strokeWidth={1.75} />
            </div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--c-body)', margin: 0 }}>
              No timetable generated yet
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', maxWidth: 300, margin: 0 }}>
              Ask your administrator to generate a timetable. Your personal schedule will appear here.
            </p>
          </div>
        )}

        {!ttLoading && ttErr === 'fetch_failed' && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--r-btn)',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.20)',
              color: '#b91c1c',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={15} className="shrink-0" />
            Could not load timetable. Please check your connection.
          </div>
        )}

        {!ttLoading && !ttErr && timetable && (
          (() => {
            const tId = teacher?.id || user?.id
            const hasSlots = timetable.slots?.some(s => s.teacher_id === tId)
            if (!hasSlots) {
              return (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <Calendar size={22} color="var(--c-muted)" strokeWidth={1.75} />
                  <p style={{ fontSize: '0.875rem', color: 'var(--c-muted)', margin: 0 }}>
                    You have no classes assigned in the current timetable.
                  </p>
                </div>
              )
            }
            return (
              <TimetableViewGrid
                result={timetable}
                subjectMap={subjectMap}
                teacherMap={teacherMap}
                sectionMap={sectionMap}
                roomMap={roomMap}
                workingDays={workingDays}
                periodsPerDay={periodsPerDay}
                viewMode="teacher"
                filterById={tId}
              />
            )
          })()
        )}
      </section>

      {/* ─── Daily Commute Path section ─── */}
      {teacher && (
        <div style={{ marginBottom: 24 }}>
          <TeacherCommuteTimeline
            teacher={teacher}
            teachersList={allTeachers}
            onSelectTeacher={setTeacher}
            timetableId={timetable?.id}
          />
        </div>
      )}

      {busy && (
        <div className="card-padded flex items-center justify-center gap-3" style={{ color: 'var(--c-muted)', padding: '40px 0' }}>
          <Loader2 size={18} className="animate-spin text-primary" />
          <span style={{ fontSize: '0.875rem' }}>Loading your profile…</span>
        </div>
      )}

      {loadErr && (
        <div
          className="card-padded flex items-center gap-3"
          style={{
            background: 'rgba(239,68,68,0.06)',
            borderColor: 'rgba(239,68,68,0.20)',
            color: '#b91c1c',
            marginBottom: 24,
          }}
        >
          <AlertCircle size={18} />
          <span style={{ fontSize: '0.8125rem' }}>{loadErr}</span>
        </div>
      )}

      {teacher && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start" style={{ marginBottom: 24 }}>
          {/* ─── Subject Preferences section ─── */}
          <section className="card-padded h-full flex flex-col">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookOpen size={18} color="var(--c-primary)" strokeWidth={2} />
                <h2
                  style={{
                    fontFamily: 'Space Grotesk, sans-serif',
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: 'var(--c-body)',
                    margin: 0,
                  }}
                >
                  Subject preferences
                </h2>
              </div>
              <div>
                {editingPrefs ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={cancelEdit}
                      disabled={savingPrefs}
                      className="btn btn-secondary btn-sm"
                    >
                      <RotateCcw size={12} />
                      Cancel
                    </button>
                    <button
                      onClick={savePreferences}
                      disabled={savingPrefs}
                      className="btn btn-primary btn-sm"
                    >
                      {savingPrefs ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      {savingPrefs ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setPrefSaveErr(null); setEditingPrefs(true) }}
                    className="btn btn-secondary btn-sm"
                  >
                    <Pencil size={12} />
                    Edit preferences
                  </button>
                )}
              </div>
            </div>

            {/* Save error banner */}
            {prefSaveErr && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--r-btn)',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.20)',
                  color: '#b91c1c',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                <AlertCircle size={14} className="shrink-0" />
                {prefSaveErr}
              </div>
            )}

            {editingPrefs ? (
              /* ── Edit mode: add / change preference / remove ── */
              <div className="space-y-3">
                {allSubjects.length === 0 && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--r-btn)',
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.20)',
                      color: '#b45309',
                      fontSize: '0.75rem',
                    }}
                  >
                    No subjects exist yet. Ask an administrator to add subjects first.
                  </div>
                )}

                {prefLinks.length === 0 && allSubjects.length > 0 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', fontStyle: 'italic', margin: 0 }}>
                    No subjects assigned yet. Click "+ Add subject" below.
                  </p>
                )}

                {prefLinks.map((link) => {
                  const otherUsed = new Set(prefLinks.filter((l) => l.subject_id !== link.subject_id).map((l) => l.subject_id))
                  const selectOptions = allSubjects.filter((s) => !otherUsed.has(s.id))

                  return (
                    <div
                      key={link.subject_id}
                      style={{
                        padding: '12px',
                        borderRadius: 'var(--r-card)',
                        background: 'var(--c-ground)',
                        border: '1px solid var(--c-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      {/* Row 1: subject selector + rank + delete */}
                      <div className="flex items-center gap-2">
                        <select
                          value={link.subject_id}
                          onChange={(e) => updatePrefLink(link.subject_id, 'subject_id', e.target.value)}
                          className="form-input flex-1 text-sm"
                        >
                          {selectOptions.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1 shrink-0">
                          <span style={{ fontSize: '0.75rem', color: 'var(--c-muted)' }}>Rank</span>
                          <input
                            type="number"
                            min={1}
                            value={link.preference_rank}
                            onChange={(e) => updatePrefLink(link.subject_id, 'preference_rank', Math.max(1, Number(e.target.value)))}
                            className="form-input w-14 text-center text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSubjectLink(link.subject_id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--c-muted)',
                            cursor: 'pointer',
                            padding: 6,
                          }}
                          title="Remove this subject"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {/* Row 2: preference type toggle */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          paddingTop: 6,
                          borderTop: '1px solid var(--c-border)',
                        }}
                      >
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--c-muted)' }}>
                          Preference:
                        </span>
                        <div className="flex items-center gap-1">
                          {Object.entries(PREF_CONFIG).map(([key, cfg]) => {
                            const { Icon } = cfg
                            const active = link.preference_type === key
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => updatePrefLink(link.subject_id, 'preference_type', key)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '4px 8px',
                                  borderRadius: 'var(--r-btn)',
                                  fontSize: '0.6875rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                  background: active ? cfg.badgeBg : 'var(--c-surface)',
                                  border: active ? `1.5px solid ${cfg.badgeBorder}` : '1px solid var(--c-border)',
                                  color: active ? cfg.color : 'var(--c-muted)',
                                }}
                              >
                                <Icon size={10} strokeWidth={2.5} />
                                {cfg.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Add subject button */}
                {availableSubjects.length > 0 && (
                  <button
                    type="button"
                    onClick={addSubjectLink}
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--c-primary)' }}
                  >
                    <Plus size={13} strokeWidth={2} />
                    Add subject
                  </button>
                )}
                {availableSubjects.length === 0 && prefLinks.length > 0 && allSubjects.length > 0 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', fontStyle: 'italic', margin: 0 }}>
                    All available subjects are already assigned.
                  </p>
                )}
              </div>
            ) : (
              /* ── Read-only mode: subjects with preference badges ── */
              teacher.subject_links.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <BookOpen size={28} color="var(--c-muted)" strokeWidth={1.5} />
                  <p style={{ fontSize: '0.875rem', color: 'var(--c-muted)', margin: 0 }}>
                    No subjects assigned yet.
                  </p>
                  <button
                    onClick={() => { setPrefSaveErr(null); setEditingPrefs(true) }}
                    className="btn btn-secondary btn-sm"
                  >
                    <Plus size={13} />
                    Add your first subject
                  </button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {teacher.subject_links.map(link => (
                    <div
                      key={link.subject_id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--r-card)',
                        background: 'var(--c-surface)',
                        border: '1px solid var(--c-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-body)', margin: 0 }} className="truncate">
                          {link.subject?.name ?? link.subject_id}
                        </p>
                        <p style={{ fontSize: '0.6875rem', color: 'var(--c-muted)', margin: '2px 0 0 0' }}>
                          {link.subject?.code} · {link.subject?.weekly_periods} periods/wk
                          {link.preference_rank > 0 && ` · Rank ${link.preference_rank}`}
                        </p>
                      </div>
                      <PrefBadge type={link.preference_type ?? 'willing'} />
                    </div>
                  ))}
                </div>
              )
            )}
          </section>

          {/* Unavailable slots */}
          <section className="card-padded h-full flex flex-col">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Clock size={18} color="var(--c-primary)" strokeWidth={2} />
              <h2
                style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: 'var(--c-body)',
                  margin: 0,
                }}
              >
                My unavailable slots
              </h2>
            </div>
            {teacher.unavailable_slots.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--c-muted)', margin: 0 }}>
                No unavailable slots recorded. Contact your admin to update these.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {teacher.unavailable_slots.map(slot => (
                  <span
                    key={slot.id}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--r-chip)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: 'rgba(46,42,107,0.06)',
                      border: '1px solid var(--c-border)',
                      color: 'var(--c-body)',
                    }}
                  >
                    {DAYS[slot.day_of_week]} — Period {slot.period_index + 1}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ─── Requests & Change Workflow Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Schedule change request form */}
        <section className="card-padded h-full flex flex-col">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <CalendarDays size={18} color="var(--c-primary)" strokeWidth={2} />
            <h2
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--c-body)',
                margin: 0,
              }}
            >
              Request a schedule change
            </h2>
          </div>

          <form onSubmit={handleRequestSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="req-day" className="form-label" style={{ marginBottom: 6, display: 'block' }}>Day</label>
                <select
                  id="req-day"
                  value={form.day}
                  onChange={e => setForm(f => ({ ...f, day: e.target.value }))}
                  className="form-input"
                >
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="req-period" className="form-label" style={{ marginBottom: 6, display: 'block' }}>Period</label>
                <select
                  id="req-period"
                  value={form.period}
                  onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
                  className="form-input"
                >
                  {PERIODS.map((p, i) => <option key={i} value={i}>{p}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="req-reason" className="form-label" style={{ marginBottom: 6, display: 'block' }}>Reason / details</label>
              <textarea
                id="req-reason"
                rows={3}
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Describe why you need this change…"
                className="form-input resize-none"
                required
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                id="req-submit-btn"
                type="submit"
                disabled={sending || !form.reason.trim()}
                className="btn btn-primary"
                style={{ minHeight: 44 }}
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizonal size={14} />}
                {sending ? 'Sending…' : 'Submit request'}
              </button>

              {sent && (
                <span className="flex items-center gap-1.5 text-sm" style={{ color: '#15803d', fontWeight: 600 }}>
                  <CheckCircle2 size={16} /> Request submitted!
                </span>
              )}
            </div>
          </form>
        </section>

        {/* My request history */}
        <section className="card-padded h-full flex flex-col">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClipboardList size={18} color="var(--c-primary)" strokeWidth={2} />
              <h2
                style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: 'var(--c-body)',
                  margin: 0,
                }}
              >
                My requests
              </h2>
            </div>
            {myRequests.length > 0 && (
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 'var(--r-chip)',
                  background: 'rgba(46,42,107,0.08)',
                  color: 'var(--c-primary)',
                }}
              >
                {myRequests.length}
              </span>
            )}
          </div>

          {myRequests.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--c-muted)', margin: 0 }}>
              No requests submitted yet.
            </p>
          ) : (
            <div className="space-y-3">
              {myRequests.map(req => {
                const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending
                return (
                  <div
                    key={req.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 'var(--r-card)',
                      background: cfg.bg,
                      border: `1px solid ${cfg.border}`,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div className="shrink-0 mt-0.5">
                      {req.status === 'approved' && <CheckCircle2 size={16} color={cfg.color} strokeWidth={2} />}
                      {req.status === 'rejected' && <XCircle     size={16} color={cfg.color} strokeWidth={2} />}
                      {req.status === 'pending'  && <Clock       size={16} color={cfg.color} strokeWidth={2} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-body)', margin: 0 }}>
                          {req.day} — {req.period}
                        </p>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: cfg.color }}>
                          {cfg.label}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', margin: '4px 0 0 0' }} className="line-clamp-2">
                        {req.reason}
                      </p>
                      <p style={{ fontSize: '0.6875rem', color: 'var(--c-muted)', opacity: 0.8, margin: '4px 0 0 0' }}>
                        {new Date(req.submittedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        timetable={timetable}
        sectionMap={sectionMap}
        teacherMap={teacherMap}
        subjectMap={subjectMap}
        roomMap={roomMap}
        initialScope="teacher"
        initialEntityId={teacher?.id || user?.id || ''}
      />
    </div>
  )
}
