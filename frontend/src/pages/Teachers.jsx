import { useEffect, useState } from 'react'
import { Plus, Trash2, UserCircle2 } from 'lucide-react'
import { teachersApi, departmentsApi, subjectsApi } from '../api'
import { useToast } from '../hooks/useToast'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Badge from '../components/Badge'

/* ──────────────────────────────────────────────
   Constants / helpers
────────────────────────────────────────────── */
const DAYS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const PERIODS = Array.from({ length: 8 }, (_, i) => i) // P0–P7

const EMPTY_FORM = () => ({
  name: '',
  email: '',
  department_id: '',
  max_periods_per_day: 6,
  max_periods_per_week: 25,
  subject_links: [],
  unavailable_slots: [],
})

function slotKey(day, period) { return `${day}-${period}` }

/* ──────────────────────────────────────────────
   Subject-Links list builder
────────────────────────────────────────────── */
function SubjectLinks({ links, subjects, onChange }) {
  const usedIds = new Set(links.map((l) => l.subject_id))
  const available = subjects.filter((s) => !usedIds.has(s.id))

  function addLink() {
    if (available.length === 0) return
    onChange([...links, { subject_id: available[0].id, preference_rank: links.length + 1 }])
  }
  function removeLink(idx) {
    onChange(links.filter((_, i) => i !== idx))
  }
  function updateLink(idx, field, value) {
    onChange(links.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  return (
    <div className="space-y-2">
      {links.map((link, idx) => {
        const subject = subjects.find((s) => s.id === link.subject_id)
        return (
          <div key={idx} className="flex items-center gap-2">
            <select
              value={link.subject_id}
              onChange={(e) => updateLink(idx, 'subject_id', e.target.value)}
              className="form-input flex-1"
            >
              {subject && <option value={subject.id}>{subject.name} ({subject.code})</option>}
              {available.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 whitespace-nowrap">Rank</span>
              <input
                type="number"
                min={1}
                value={link.preference_rank}
                onChange={(e) => updateLink(idx, 'preference_rank', Number(e.target.value))}
                className="form-input w-16 text-center"
              />
            </div>
            <button
              type="button"
              onClick={() => removeLink(idx)}
              className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={addLink}
        disabled={available.length === 0}
        className="text-xs text-brand-400 hover:text-brand-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        + Add subject
      </button>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Unavailable slot grid
────────────────────────────────────────────── */
function UnavailableGrid({ slots, onChange }) {
  const set = new Set(slots.map((s) => slotKey(s.day_of_week, s.period_index)))

  function toggle(day, period) {
    const key = slotKey(day, period)
    if (set.has(key)) {
      onChange(slots.filter((s) => !(s.day_of_week === day && s.period_index === period)))
    } else {
      onChange([...slots, { day_of_week: day, period_index: period }])
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="w-10" />
            {DAYS.map((d) => (
              <th key={d} className="text-center text-gray-500 font-medium pb-1.5">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((p) => (
            <tr key={p}>
              <td className="text-gray-600 text-right pr-2">P{p + 1}</td>
              {DAYS.map((_, d) => {
                const blocked = set.has(slotKey(d, p))
                return (
                  <td key={d} className="p-0.5">
                    <button
                      type="button"
                      onClick={() => toggle(d, p)}
                      className={`w-full h-7 rounded transition-colors ${
                        blocked
                          ? 'bg-red-500/30 border border-red-500/50 text-red-400'
                          : 'bg-white/4 border border-white/8 hover:bg-white/10 text-gray-700 hover:text-gray-500'
                      }`}
                      title={`${DAYS[d]} Period ${p + 1} — ${blocked ? 'blocked' : 'available'}`}
                    >
                      {blocked ? '✕' : ''}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-600 mt-2">Click cells to mark unavailable slots (shown in red)</p>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Full teacher form
────────────────────────────────────────────── */
function TeacherForm({ form, errors, onChange, departments, subjects }) {
  return (
    <div className="space-y-5">
      {/* Basic info */}
      <div className="space-y-4">
        <div>
          <label className="form-label">Full Name *</label>
          <input
            className={`form-input ${errors.name ? 'error' : ''}`}
            placeholder="e.g. Dr. Jane Smith"
            value={form.name}
            maxLength={120}
            onChange={(e) => onChange('name', e.target.value)}
            autoFocus
          />
          {errors.name && <p className="form-error">{errors.name}</p>}
        </div>
        <div>
          <label className="form-label">Email (optional)</label>
          <input
            type="email"
            className={`form-input ${errors.email ? 'error' : ''}`}
            placeholder="jane@college.edu"
            value={form.email}
            onChange={(e) => onChange('email', e.target.value)}
          />
          {errors.email && <p className="form-error">{errors.email}</p>}
        </div>
        <div>
          <label className="form-label">Department (optional)</label>
          <select
            className="form-input"
            value={form.department_id}
            onChange={(e) => onChange('department_id', e.target.value)}
          >
            <option value="">— None —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Max Periods / Day</label>
            <input
              type="number"
              min={1}
              className={`form-input ${errors.max_periods_per_day ? 'error' : ''}`}
              value={form.max_periods_per_day}
              onChange={(e) => onChange('max_periods_per_day', Number(e.target.value))}
            />
            {errors.max_periods_per_day && <p className="form-error">{errors.max_periods_per_day}</p>}
          </div>
          <div>
            <label className="form-label">Max Periods / Week</label>
            <input
              type="number"
              min={1}
              className={`form-input ${errors.max_periods_per_week ? 'error' : ''}`}
              value={form.max_periods_per_week}
              onChange={(e) => onChange('max_periods_per_week', Number(e.target.value))}
            />
            {errors.max_periods_per_week && <p className="form-error">{errors.max_periods_per_week}</p>}
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="border-t border-white/10 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Subject Preferences</p>
        <SubjectLinks
          links={form.subject_links}
          subjects={subjects}
          onChange={(v) => onChange('subject_links', v)}
        />
      </div>

      {/* Unavailability grid */}
      <div className="border-t border-white/10 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Unavailable Slots</p>
        <UnavailableGrid
          slots={form.unavailable_slots}
          onChange={(v) => onChange('unavailable_slots', v)}
        />
      </div>
    </div>
  )
}

function validate(form) {
  const e = {}
  if (!form.name.trim()) e.name = 'Name is required'
  if (form.max_periods_per_day < 1) e.max_periods_per_day = 'Must be at least 1'
  if (form.max_periods_per_week < form.max_periods_per_day)
    e.max_periods_per_week = `Must be ≥ max/day (${form.max_periods_per_day})`
  return e
}

/* ──────────────────────────────────────────────
   Table columns
────────────────────────────────────────────── */
function SubjectPills({ links }) {
  if (!links?.length) return <span className="text-gray-600 text-xs">—</span>
  const show = links.slice(0, 3)
  const more = links.length - show.length
  return (
    <div className="flex flex-wrap gap-1">
      {show.map((l) => (
        <Badge key={l.subject_id} variant="brand">{l.subject?.code ?? '…'}</Badge>
      ))}
      {more > 0 && <Badge variant="default">+{more}</Badge>}
    </div>
  )
}

const COLUMNS = (departments) => [
  { key: 'name', label: 'Name' },
  {
    key: 'department_id',
    label: 'Department',
    render: (v) => {
      const d = departments.find((dep) => dep.id === v)
      return d ? <Badge variant="default">{d.code}</Badge> : <span className="text-gray-600 text-xs">—</span>
    },
  },
  {
    key: 'max_periods_per_day',
    label: 'Max Periods',
    render: (v, row) => (
      <span className="text-gray-400 text-xs">{v}/day · {row.max_periods_per_week}/week</span>
    ),
  },
  {
    key: 'subject_links',
    label: 'Subjects',
    sortable: false,
    render: (v) => <SubjectPills links={v} />,
  },
]

/* ──────────────────────────────────────────────
   Page
────────────────────────────────────────────── */
export default function Teachers() {
  const { toast } = useToast()
  const [rows, setRows]           = useState([])
  const [departments, setDepts]   = useState([])
  const [subjects, setSubjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [errors, setErrors]       = useState({})
  const [saving, setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [teachRes, deptRes, subRes] = await Promise.all([
        teachersApi.list(),
        departmentsApi.list(),
        subjectsApi.list(),
      ])
      setRows(teachRes.data)
      setDepts(deptRes.data)
      setSubjects(subRes.data)
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM()); setErrors({}); setModalOpen(true)
  }
  function openEdit(row) {
    setEditing(row)
    setForm({
      name: row.name,
      email: row.email ?? '',
      department_id: row.department_id ?? '',
      max_periods_per_day: row.max_periods_per_day,
      max_periods_per_week: row.max_periods_per_week,
      subject_links: (row.subject_links ?? []).map((l) => ({
        subject_id: l.subject_id,
        preference_rank: l.preference_rank,
      })),
      unavailable_slots: (row.unavailable_slots ?? []).map((s) => ({
        day_of_week: s.day_of_week,
        period_index: s.period_index,
      })),
    })
    setErrors({}); setModalOpen(true)
  }
  function handleChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function handleSave() {
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    const payload = {
      ...form,
      department_id: form.department_id || null,
      email: form.email || null,
    }
    try {
      if (editing) {
        const res = await teachersApi.update(editing.id, payload)
        setRows((prev) => prev.map((r) => r.id === editing.id ? res.data : r))
        toast.success(`Teacher "${res.data.name}" updated`)
      } else {
        const res = await teachersApi.create(payload)
        setRows((prev) => [...prev, res.data])
        toast.success(`Teacher "${res.data.name}" created`)
      }
      setModalOpen(false)
    } catch (err) {
      toast.error(err.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await teachersApi.remove(deleteTarget.id)
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      toast.success(`Teacher "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.message ?? 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Teachers</h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage staff, subject preferences, and availability</p>
        </div>
        <button
          id="teacher-add-btn"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-brand-600 hover:bg-brand-500 transition-colors"
        >
          <Plus size={16} />
          Add Teacher
        </button>
      </div>

      <DataTable
        columns={COLUMNS(departments)}
        data={rows}
        loading={loading}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        searchKeys={['name', 'email']}
        emptyTitle="No teachers yet"
        emptyMessage="Add teachers and assign their subject preferences."
        onAdd={openCreate}
        addLabel="Add Teacher"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Teacher' : 'New Teacher'}
        onSubmit={handleSave}
        submitLabel={editing ? 'Save Changes' : 'Create'}
        loading={saving}
        size="lg"
      >
        <TeacherForm
          form={form}
          errors={errors}
          onChange={handleChange}
          departments={departments}
          subjects={subjects}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entityName={deleteTarget?.name ?? ''}
        entityType="teacher"
        loading={deleting}
      />
    </div>
  )
}
