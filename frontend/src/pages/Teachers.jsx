import { useEffect, useState } from 'react'
import { Plus, Trash2, Star, Check, X, Upload } from 'lucide-react'
import { teachersApi, departmentsApi, subjectsApi } from '../api'
import { useToast } from '../hooks/useToast'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Badge from '../components/Badge'
import CsvImportModal from '../components/CsvImportModal'

/* ──────────────────────────────────────────────
   Constants / helpers
────────────────────────────────────────────── */
const DAYS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const PERIODS = Array.from({ length: 8 }, (_, i) => i) // P0–P7

const PREF_TYPES = [
  {
    value: 'preferred',
    label: 'Preferred',
    icon: Star,
    activeClass: 'bg-emerald-50 border-emerald-300 text-emerald-800',
    inactiveClass: 'bg-ground border-primary/12 text-muted hover:text-emerald-400 hover:border-emerald-500/30',
  },
  {
    value: 'willing',
    label: 'Willing',
    icon: Check,
    activeClass: 'bg-secondary/15 border-secondary/50 text-secondary',
    inactiveClass: 'bg-ground border-primary/12 text-muted hover:text-secondary hover:border-secondary/30',
  },
  {
    value: 'avoid',
    label: 'Avoid',
    icon: X,
    activeClass: 'bg-red-50 border-red-300 text-red-700',
    inactiveClass: 'bg-ground border-primary/12 text-muted hover:text-red-400 hover:border-red-500/30',
  },
]

const PREF_BADGE = {
  preferred: { variant: 'success', label: 'Preferred' },
  willing:   { variant: 'brand',   label: 'Willing'   },
  avoid:     { variant: 'danger',  label: 'Avoid'     },
}

const EMPTY_FORM = () => ({
  name: '',
  email: '',
  department_id: '',
  max_periods_per_week: 25,
  subject_links: [],
  unavailable_slots: [],
})

/* ──────────────────────────────────────────────
   Teacher CSV template (shown in import wizard)
────────────────────────────────────────────── */
const TEACHER_CSV_TEMPLATE = `name,email,department_code,max_periods_per_week,max_periods_per_day,unavailable_slots,subject_1,subject_2,subject_3
Dr. Alice,alice@college.edu,CS,20,5,,MATH101:preferred,CS101:preferred,PHY201:willing
Dr. Bob,,EE,25,5,Mon:1,EE101:preferred,MATH101:willing,PHY201:avoid
Dr. Carol,carol@college.edu,CS,20,5,"Mon:1,Wed:3",CS101:preferred,PHY201:willing,
`

const TEACHER_CSV_HINT =
  'Columns: name (required), email, department_code, max_periods_per_week, ' +
  'max_periods_per_day (accepted, ignored), ' +
  'unavailable_slots (e.g. Mon:1,Wed:3 — leave blank if none), ' +
  'then any number of subject columns in the format SUBJECT_CODE:preferred|willing|avoid. ' +
  'Preference rank is determined by column order (left = rank 1). ' +
  'Blank subject cells are skipped.'

function slotKey(day, period) { return `${day}-${period}` }

/* ──────────────────────────────────────────────
   Subject-Links list builder  (enhanced)
────────────────────────────────────────────── */
function SubjectLinks({ links, subjects, onChange }) {
  const usedIds = new Set(links.map((l) => l.subject_id))
  const available = subjects.filter((s) => !usedIds.has(s.id))

  function addLink() {
    if (available.length === 0) return
    onChange([
      ...links,
      { subject_id: available[0].id, preference_rank: links.length + 1, preference_type: 'willing' },
    ])
  }
  function removeLink(idx) {
    onChange(links.filter((_, i) => i !== idx))
  }
  function updateLink(idx, field, value) {
    onChange(links.map((l, i) => (i === idx ? { ...l, [field]: value } : l)))
  }

  return (
    <div className="space-y-3">
      {subjects.length === 0 ? (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          No subjects exist in the system yet. Please create subjects in the <strong>Subjects</strong> page first before assigning preferences.
        </div>
      ) : links.length === 0 ? (
        <p className="text-xs text-muted italic">No subjects assigned yet. Click "+ Add subject & preference" below to select a subject.</p>
      ) : null}

      {links.map((link, idx) => {
        const subject = subjects.find((s) => s.id === link.subject_id)
        return (
          <div
            key={idx}
            className="flex flex-col gap-2.5 p-3 rounded-xl bg-ground border border-primary/12"
          >
            {/* Row 1: subject select + rank + delete */}
            <div className="flex items-center gap-2">
              <select
                value={link.subject_id}
                onChange={(e) => updateLink(idx, 'subject_id', e.target.value)}
                className="form-input flex-1 text-sm"
              >
                <option value={link.subject_id}>
                  {subject ? `${subject.name} (${subject.code})` : 'Select a subject...'}
                </option>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted whitespace-nowrap">Rank</span>
                <input
                  type="number"
                  min={1}
                  value={link.preference_rank}
                  onChange={(e) => updateLink(idx, 'preference_rank', Math.max(1, Number(e.target.value)))}
                  className="form-input w-16 text-center text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => removeLink(idx)}
                className="p-1.5 text-muted hover:text-red-400 transition-colors shrink-0"
                title="Remove subject"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Row 2: preference type toggle */}
            <div className="flex items-center gap-2 pt-1 border-t border-primary/8">
              <span className="text-xs font-medium text-muted mr-1">Preference Level:</span>
              <div className="flex items-center gap-1.5">
                {PREF_TYPES.map((pt) => {
                  const Icon = pt.icon
                  const active = link.preference_type === pt.value
                  return (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => updateLink(idx, 'preference_type', pt.value)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                        active ? pt.activeClass : pt.inactiveClass
                      }`}
                      title={`Set preference level to ${pt.label}`}
                    >
                      <Icon size={12} />
                      {pt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}

      {subjects.length > 0 && available.length === 0 && links.length > 0 && (
        <p className="text-xs text-muted italic">All available subjects have been assigned to this teacher.</p>
      )}

      {subjects.length > 0 && available.length > 0 && (
        <button
          type="button"
          onClick={addLink}
          className="flex items-center gap-1 text-xs font-medium text-secondary hover:text-secondary transition-colors pt-1"
        >
          + Add subject & preference
        </button>
      )}
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
              <th key={d} className="text-center text-muted font-medium pb-1.5">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((p) => (
            <tr key={p}>
              <td className="text-muted text-right pr-2">P{p + 1}</td>
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
                          : 'bg-ground border border-primary/10 hover:bg-secondary/8 text-muted hover:text-muted'
                      }`}
                      title={`${DAYS[d]} Period ${p + 1} — ${blocked ? 'blocked' : 'available'}`}
                    >
                      {blocked ? '×' : ''}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted mt-2">Click cells to mark unavailable slots (shown in red)</p>
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

      {/* Subject preferences */}
      <div className="border-t border-primary/12 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest">
            Subject Preferences
          </p>
          <span className="text-xs text-muted">— configure preferred, willing, or avoid preferences below per subject</span>
        </div>
        <SubjectLinks
          links={form.subject_links}
          subjects={subjects}
          onChange={(v) => onChange('subject_links', v)}
        />
      </div>

      {/* Unavailability grid */}
      <div className="border-t border-primary/12 pt-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Unavailable Slots</p>
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
  if (form.max_periods_per_week < 1) e.max_periods_per_week = 'Must be at least 1'
  return e
}

/* ──────────────────────────────────────────────
   Table columns
────────────────────────────────────────────── */
function SubjectPills({ links }) {
  if (!links?.length) return <span className="text-muted text-xs">—</span>
  const show = links.slice(0, 3)
  const more = links.length - show.length

  const prefColor = (type) => {
    if (type === 'preferred') return 'bg-emerald-50 border border-emerald-200 text-emerald-800'
    if (type === 'avoid')     return 'bg-red-50 border border-red-200 text-red-700'
    return 'bg-secondary/12 border border-secondary/30 text-secondary'
  }

  return (
    <div className="flex flex-wrap gap-1">
      {show.map((l) => (
        <span
          key={l.subject_id}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${prefColor(l.preference_type)}`}
          title={l.preference_type ?? 'willing'}
        >
          {l.preference_type === 'preferred' && <Star size={9} />}
          {l.preference_type === 'avoid'     && <X    size={9} />}
          {l.subject?.code ?? '…'}
        </span>
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
      return d ? <Badge variant="default">{d.code}</Badge> : <span style={{ color: 'var(--c-muted)', fontSize: '0.875rem' }}>—</span>
    },
  },
  {
    key: 'max_periods_per_week',
    label: 'Max periods',
    render: (v) => (
      <span style={{ color: 'var(--c-muted)', fontSize: '0.875rem' }}>{v}/week</span>
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
  const [csvOpen, setCsvOpen]           = useState(false)

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
      max_periods_per_week: row.max_periods_per_week,
      subject_links: (row.subject_links ?? []).map((l) => ({
        subject_id: l.subject_id,
        preference_rank: l.preference_rank,
        preference_type: l.preference_type ?? 'willing',
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
      console.error('Save teacher failed:', err)
      const msg = err.message === 'Network Error' || err.code === 'ERR_NETWORK'
        ? 'Network error: Cannot reach backend server. Please verify backend service is running.'
        : (err.message ?? 'Save failed')
      toast.error(msg)
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

  const totalCapacity = rows.reduce((sum, t) => sum + (t.max_periods_per_week || 0), 0)
  const avgCapacity = (totalCapacity / (rows.length || 1)).toFixed(1)
  const withConstraints = rows.filter((t) => t.unavailable_slots?.length > 0).length

  return (
    <div className="page-wrapper">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-heading">Teachers</h1>
          <p className="page-sub">Manage faculty staff, subject competency preferences, and unavailable period slots</p>
        </div>
        <div className="page-header-actions">
          <button
            id="teacher-import-csv-btn"
            onClick={() => setCsvOpen(true)}
            className="btn btn-secondary btn-sm"
          >
            <Upload size={14} />
            Import CSV
          </button>
          <button
            id="teacher-add-btn"
            onClick={openCreate}
            className="btn btn-primary btn-sm"
          >
            <Plus size={14} />
            Add teacher
          </button>
        </div>
      </div>

      {/* Stats row */}
      {rows.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}>
          {[
            { label: 'Total faculty', val: rows.length, color: '#2E2A6B' },
            { label: 'Weekly capacity', val: `${totalCapacity} periods`, color: '#8F8CD6' },
            { label: 'Avg cap/teacher', val: `${avgCapacity} p/wk`, color: '#2E2A6B' },
            { label: 'With slot constraints', val: withConstraints, color: '#FFB020' },
          ].map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="stat-card-icon" style={{ background: `${stat.color}12` }}>
                <span style={{ width: 18, height: 18, display: 'block', borderRadius: 4, background: stat.color, opacity: 0.7 }} />
              </div>
              <div>
                <p className="stat-card-value">{stat.val}</p>
                <p className="stat-card-label">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

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
        addLabel="Add teacher"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit teacher' : 'New teacher'}
        onSubmit={handleSave}
        submitLabel={editing ? 'Save changes' : 'Create'}
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

      <CsvImportModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onSuccess={() => { setCsvOpen(false); load() }}
        importFn={teachersApi.importCsv}
        title="Import teachers from CSV"
        hint={TEACHER_CSV_HINT}
        templateRows={TEACHER_CSV_TEMPLATE}
        templateFilename="teachers_template.csv"
      />
    </div>
  )
}
