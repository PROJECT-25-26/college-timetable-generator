/**
 * TeacherDashboard — the personal view for logged-in teachers.
 *
 * Displays:
 *   1. Welcome card with teacher info
 *   2. Assigned subjects (fetched from /api/v1/teachers/:id)
 *   3. Unavailable slots list
 *   4. Schedule Change Request form
 *   5. Request history (from shared AuthContext)
 */

import { useEffect, useState } from 'react'
import {
  BookOpen, Clock, SendHorizonal, CheckCircle2, XCircle, Loader2,
  CalendarDays, AlertCircle, ClipboardList, User
} from 'lucide-react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const DAYS    = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const PERIODS = Array.from({ length: 8 }, (_, i) => `Period ${i + 1}`)

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  color: 'text-amber-400',  bg: 'bg-amber-500/10  border-amber-500/20'  },
  approved: { label: 'Approved', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  rejected: { label: 'Rejected', color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/20'    },
}

export default function TeacherDashboard() {
  const { user, requests, addRequest } = useAuth()

  const [teacher, setTeacher]   = useState(null)
  const [loadErr, setLoadErr]   = useState(null)
  const [busy,    setBusy]      = useState(true)

  // Form state
  const [form, setForm]     = useState({ day: '0', period: '0', reason: '' })
  const [sending, setSend]  = useState(false)
  const [sent,    setSent]  = useState(false)

  // Fetch teacher detail
  useEffect(() => {
    if (!user?.id) return
    axios.get(`/api/v1/teachers/${user.id}`)
      .then(r => setTeacher(r.data))
      .catch(() => setLoadErr('Could not load your profile.'))
      .finally(() => setBusy(false))
  }, [user?.id])

  const myRequests = requests.filter(r => r.teacherId === user?.id)

  const handleRequestSubmit = async (e) => {
    e.preventDefault()
    if (!form.reason.trim()) return
    setSend(true)
    // Simulate a brief async call
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
    <div className="space-y-6 max-w-4xl animate-fade-in">

      {/* Welcome banner */}
      <div className="glass-card p-6 flex items-center gap-5">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/30 shrink-0">
          <User size={26} className="text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Welcome, {user?.name}</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {teacher?.department_id
              ? `Department ID: ${teacher.department_id}`
              : 'No department assigned'} · {teacher?.email ?? user?.email}
          </p>
        </div>
      </div>

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
          {/* Assigned subjects */}
          <section className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={17} className="text-brand-400" />
              <h3 className="text-sm font-semibold text-gray-200">Assigned Subjects</h3>
            </div>
            {teacher.subject_links.length === 0 ? (
              <p className="text-gray-500 text-sm">No subjects assigned yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {teacher.subject_links.map(link => (
                  <div
                    key={link.subject_id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 group hover:bg-white/8 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500/30 to-purple-500/30 flex items-center justify-center shrink-0">
                      <BookOpen size={14} className="text-brand-300" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200 truncate">
                        {link.subject?.name ?? link.subject_id}
                      </p>
                      <p className="text-xs text-gray-500">
                        {link.subject?.code} · {link.subject?.weekly_periods} periods/wk
                        {link.preference_rank > 1 && ` · Preference rank ${link.preference_rank}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Unavailable slots */}
          <section className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={17} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-gray-200">My Unavailable Slots</h3>
            </div>
            {teacher.unavailable_slots.length === 0 ? (
              <p className="text-gray-500 text-sm">No unavailable slots recorded.</p>
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
