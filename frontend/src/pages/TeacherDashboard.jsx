/**
 * TeacherDashboard — the personal view for logged-in teachers.
 *
 * Displays:
 *   1. Welcome card with teacher info
 *   2. Subject Preferences — add, edit preference, delete (inline editor)
 *   3. Unavailable slots list
 *   4. Schedule Change Request form
 *   5. Request history (from shared AuthContext)
 */

import { useEffect, useState } from 'react'
import {
  BookOpen, Clock, SendHorizonal, CheckCircle2, XCircle, Loader2,
  CalendarDays, AlertCircle, ClipboardList, User, Star, Check, X,
  Pencil, Save, RotateCcw, Plus, Trash2, Calendar,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { teachersApi, subjectsApi, timetablesApi, classSectionsApi, roomsApi } from '../api'
import TimetableViewGrid from '../components/TimetableViewGrid'

const DAYS    = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const PERIODS = Array.from({ length: 8 }, (_, i) => `Period ${i + 1}`)

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  color: 'text-amber-400',  bg: 'bg-amber-500/10  border-amber-500/20'  },
  approved: { label: 'Approved', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  rejected: { label: 'Rejected', color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/20'    },
}

/* ──────────────────────────────────────────────
   Preference type config
────────────────────────────────────────────── */
const PREF_CONFIG = {
  preferred: {
    label: 'Preferred',
    Icon: Star,
    badgeClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    btnActive: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
    btnInactive: 'bg-white/4 border-white/10 text-gray-500 hover:text-emerald-400 hover:border-emerald-500/30',
  },
  willing: {
    label: 'Willing',
    Icon: Check,
    badgeClass: 'bg-brand-500/15 border-brand-500/30 text-brand-300',
    btnActive: 'bg-brand-500/20 border-brand-500/50 text-brand-300',
    btnInactive: 'bg-white/4 border-white/10 text-gray-500 hover:text-brand-400 hover:border-brand-500/30',
  },
  avoid: {
    label: 'Avoid',
    Icon: X,
    badgeClass: 'bg-red-500/15 border-red-500/30 text-red-300',
    btnActive: 'bg-red-500/20 border-red-500/50 text-red-300',
    btnInactive: 'bg-white/4 border-white/10 text-gray-500 hover:text-red-400 hover:border-red-500/30',
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
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.badgeClass}`}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  )
}


export default function TeacherDashboard() {
  const { user, requests, addRequest } = useAuth()

  const [teacher, setTeacher]   = useState(null)
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
            const days = [...new Set(slots.map(s => s.day_of_week))].sort((a, b) => a - b)
            const maxPeriod = Math.max(...slots.map(s => s.period_index))
            setWorkingDays(days)
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
    <div className="space-y-6 max-w-5xl animate-fade-in">

      {/* Welcome banner */}
      <div className="glass-card p-6 flex items-center gap-5">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/30 shrink-0">
          <User size={26} className="text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Welcome, {user?.name}</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {teacher?.department?.name
              ? `Department: ${teacher.department.name} (${teacher.department.code})`
              : 'No department assigned'} · {teacher?.email ?? user?.email}
          </p>
        </div>
      </div>

      {/* ─── My Timetable section ─── */}
      <section className="glass-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Calendar size={17} className="text-brand-400" />
          <h3 className="text-sm font-semibold text-gray-200">My Timetable</h3>
          {timetable && (
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              {timetable.slots?.filter(s => s.teacher_id === (teacher?.id || user?.id)).length ?? 0} periods/week
            </span>
          )}
        </div>

        {ttLoading && (
          <div className="flex items-center justify-center gap-3 py-10 text-gray-500">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading your schedule…</span>
          </div>
        )}

        {!ttLoading && ttErr === 'no_timetable' && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Calendar size={22} className="text-gray-600" />
            </div>
            <p className="text-gray-400 text-sm font-medium">No timetable generated yet</p>
            <p className="text-gray-600 text-xs max-w-xs">
              Ask your administrator to generate a timetable. Your personal schedule will appear here.
            </p>
          </div>
        )}

        {!ttLoading && ttErr === 'fetch_failed' && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            <AlertCircle size={14} className="shrink-0" />
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
                  <Calendar size={24} className="text-gray-600" />
                  <p className="text-gray-400 text-sm">You have no classes assigned in the current timetable.</p>
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

      {busy && (
        <div className="glass-card p-10 flex items-center justify-center gap-3 text-gray-400">
          <Loader2 size={20} className="animate-spin" />
          Loading your profile…
        </div>
      )}

      {loadErr && (
        <div className="glass-card p-6 flex items-center gap-3 text-red-400 border-red-500/20">
          <AlertCircle size={18} />
          {loadErr}
        </div>
      )}

      {teacher && (
        <>
          {/* ─── Subject Preferences section ─── */}
          <section className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={17} className="text-brand-400" />
              <h3 className="text-sm font-semibold text-gray-200">Subject Preferences</h3>
              <div className="ml-auto flex items-center gap-2">
                {editingPrefs ? (
                  <>
                    <button
                      onClick={cancelEdit}
                      disabled={savingPrefs}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw size={12} />
                      Cancel
                    </button>
                    <button
                      onClick={savePreferences}
                      disabled={savingPrefs}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-xs text-white font-medium transition-colors disabled:opacity-50"
                    >
                      {savingPrefs ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      {savingPrefs ? 'Saving…' : 'Save changes'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setPrefSaveErr(null); setEditingPrefs(true) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    <Pencil size={12} />
                    Edit Preferences
                  </button>
                )}
              </div>
            </div>

            {/* Save error banner */}
            {prefSaveErr && (
              <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertCircle size={14} className="shrink-0" />
                {prefSaveErr}
              </div>
            )}

            {editingPrefs ? (
              /* ── Edit mode: add / change preference / remove ── */
              <div className="space-y-3">
                {allSubjects.length === 0 && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                    No subjects exist yet. Ask an administrator to add subjects first.
                  </div>
                )}

                {prefLinks.length === 0 && allSubjects.length > 0 && (
                  <p className="text-xs text-gray-400 italic">No subjects assigned yet. Click "+ Add subject" below.</p>
                )}

                {prefLinks.map((link) => {
                  const subject =
                    allSubjects.find((s) => s.id === link.subject_id) ??
                    teacher.subject_links.find((l) => l.subject_id === link.subject_id)?.subject
                  const otherUsed = new Set(prefLinks.filter((l) => l.subject_id !== link.subject_id).map((l) => l.subject_id))
                  const selectOptions = allSubjects.filter((s) => !otherUsed.has(s.id))

                  return (
                    <div
                      key={link.subject_id}
                      className="flex flex-col gap-2.5 p-3 rounded-xl bg-white/5 border border-white/10"
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
                          <span className="text-xs text-gray-400">Rank</span>
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
                          className="p-1.5 text-gray-400 hover:text-red-400 transition-colors shrink-0"
                          title="Remove this subject"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {/* Row 2: preference type toggle */}
                      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                        <span className="text-xs text-gray-400 font-medium">Preference:</span>
                        <div className="flex items-center gap-1">
                          {Object.entries(PREF_CONFIG).map(([key, cfg]) => {
                            const { Icon } = cfg
                            const active = link.preference_type === key
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => updatePrefLink(link.subject_id, 'preference_type', key)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-all ${
                                  active ? cfg.btnActive : cfg.btnInactive
                                }`}
                                title={cfg.label}
                              >
                                <Icon size={10} />
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
                    className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors pt-1"
                  >
                    <Plus size={13} />
                    Add subject
                  </button>
                )}
                {availableSubjects.length === 0 && prefLinks.length > 0 && allSubjects.length > 0 && (
                  <p className="text-xs text-gray-500 italic">All available subjects are already assigned.</p>
                )}
              </div>
            ) : (
              /* ── Read-only mode: subjects with preference badges ── */
              teacher.subject_links.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <BookOpen size={32} className="text-gray-700" />
                  <p className="text-gray-500 text-sm">No subjects assigned yet.</p>
                  <button
                    onClick={() => { setPrefSaveErr(null); setEditingPrefs(true) }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600/20 border border-brand-500/30 text-brand-300 text-xs font-medium hover:bg-brand-600/30 transition-colors"
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
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500/30 to-purple-500/30 flex items-center justify-center shrink-0">
                        <BookOpen size={14} className="text-brand-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-200 truncate">
                          {link.subject?.name ?? link.subject_id}
                        </p>
                        <p className="text-xs text-gray-500">
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
          <section className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={17} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-gray-200">My Unavailable Slots</h3>
            </div>
            {teacher.unavailable_slots.length === 0 ? (
              <p className="text-gray-500 text-sm">No unavailable slots recorded. Contact your admin to update these.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {teacher.unavailable_slots.map(slot => (
                  <span
                    key={slot.id}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-300"
                  >
                    {DAYS[slot.day_of_week]} — Period {slot.period_index + 1}
                  </span>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Schedule change request form */}
      <section className="glass-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <CalendarDays size={17} className="text-sky-400" />
          <h3 className="text-sm font-semibold text-gray-200">Request a Schedule Change</h3>
        </div>

        <form onSubmit={handleRequestSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="req-day" className="form-label">Day</label>
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
              <label htmlFor="req-period" className="form-label">Period</label>
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
            <label htmlFor="req-reason" className="form-label">Reason / Details</label>
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

          <div className="flex items-center gap-3">
            <button
              id="req-submit-btn"
              type="submit"
              disabled={sending || !form.reason.trim()}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
                'bg-gradient-to-r from-sky-600 to-brand-600 text-white',
                'hover:from-sky-500 hover:to-brand-500 hover:shadow-lg hover:shadow-sky-500/25',
                (sending || !form.reason.trim()) ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizonal size={14} />}
              {sending ? 'Sending…' : 'Submit Request'}
            </button>

            {sent && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-400 animate-fade-in">
                <CheckCircle2 size={14} /> Request submitted!
              </span>
            )}
          </div>
        </form>
      </section>

      {/* My request history */}
      <section className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList size={17} className="text-purple-400" />
          <h3 className="text-sm font-semibold text-gray-200">My Requests</h3>
          {myRequests.length > 0 && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-400">
              {myRequests.length}
            </span>
          )}
        </div>

        {myRequests.length === 0 ? (
          <p className="text-gray-500 text-sm">No requests submitted yet.</p>
        ) : (
          <div className="space-y-3">
            {myRequests.map(req => {
              const cfg = STATUS_CONFIG[req.status]
              return (
                <div
                  key={req.id}
                  className={`flex items-start gap-3 p-4 rounded-xl border ${cfg.bg} transition-all`}
                >
                  <div className="shrink-0 mt-0.5">
                    {req.status === 'approved' && <CheckCircle2 size={16} className="text-emerald-400" />}
                    {req.status === 'rejected' && <XCircle     size={16} className="text-red-400"     />}
                    {req.status === 'pending'  && <Clock       size={16} className="text-amber-400"   />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-200">
                        {req.day} — {req.period}
                      </p>
                      <span className={`text-xs font-semibold ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{req.reason}</p>
                    <p className="text-xs text-gray-600 mt-1">
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
  )
}
