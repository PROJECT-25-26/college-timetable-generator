import { useEffect, useState } from 'react'
import { Plus, FlaskConical } from 'lucide-react'
import { subjectsApi } from '../api'
import { useToast } from '../hooks/useToast'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Badge from '../components/Badge'

const EMPTY = {
  name: '',
  code: '',
  lab: false,
  weekly_periods: 3,
  max_periods_per_day: 2,
  lab_consecutive_periods: 2,
  weekly_lab_sessions: 1,
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`toggle-track ${checked ? 'bg-brand-600' : 'bg-gray-700'}`}
    >
      <span className={`toggle-thumb ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

function PeriodSlider({ label, value, onChange, min = 1, max = 30 }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-brand-500"
        />
        <span className="w-10 text-center text-sm font-semibold text-brand-300 bg-brand-500/10 border border-brand-500/20 rounded-lg py-1">
          {value}
        </span>
      </div>
    </div>
  )
}

function SubjectForm({ form, errors, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="form-label">Subject Name *</label>
        <input
          className={`form-input ${errors.name ? 'error' : ''}`}
          placeholder="e.g. Data Structures"
          value={form.name}
          maxLength={120}
          onChange={(e) => onChange('name', e.target.value)}
          autoFocus
        />
        {errors.name && <p className="form-error">{errors.name}</p>}
      </div>
      <div>
        <label className="form-label">Subject Code *</label>
        <input
          className={`form-input font-mono ${errors.code ? 'error' : ''}`}
          placeholder="e.g. CS201"
          value={form.code}
          maxLength={20}
          onChange={(e) => onChange('code', e.target.value.toUpperCase())}
        />
        {errors.code && <p className="form-error">{errors.code}</p>}
      </div>

      <div className="flex items-center justify-between py-2 px-3 bg-white/3 rounded-xl border border-white/8">
        <div className="flex items-center gap-2">
          <FlaskConical size={15} className="text-amber-400" />
          <span className="text-sm text-gray-300">Lab</span>
        </div>
        <Toggle
          checked={form.lab}
          onChange={(v) => onChange('lab', v)}
        />
      </div>

      {form.lab ? (
        <>
          <PeriodSlider
            label="Consecutive Periods per Lab Session (1–10)"
            value={form.lab_consecutive_periods}
            onChange={(v) => onChange('lab_consecutive_periods', v)}
            max={10}
          />
          {errors.lab_consecutive_periods && (
            <p className="form-error">{errors.lab_consecutive_periods}</p>
          )}
          <PeriodSlider
            label="Weekly Lab Sessions Required (1–30)"
            value={form.weekly_lab_sessions}
            onChange={(v) => onChange('weekly_lab_sessions', v)}
          />
          {errors.weekly_lab_sessions && (
            <p className="form-error">{errors.weekly_lab_sessions}</p>
          )}
        </>
      ) : (
        <>
          <PeriodSlider
            label="Max Periods per Day (1–10)"
            value={form.max_periods_per_day}
            onChange={(v) => onChange('max_periods_per_day', v)}
            max={10}
          />
          {errors.max_periods_per_day && (
            <p className="form-error">{errors.max_periods_per_day}</p>
          )}
          <PeriodSlider
            label="Weekly Periods (1–30)"
            value={form.weekly_periods}
            onChange={(v) => onChange('weekly_periods', v)}
          />
        </>
      )}
    </div>
  )
}

function validate(form) {
  const e = {}
  if (!form.name.trim()) e.name = 'Name is required'
  if (!form.code.trim()) e.code = 'Code is required'
  if (form.lab) {
    if (!form.lab_consecutive_periods || form.lab_consecutive_periods < 1) {
      e.lab_consecutive_periods = 'Consecutive periods is required'
    }
    if (!form.weekly_lab_sessions || form.weekly_lab_sessions < 1) {
      e.weekly_lab_sessions = 'Weekly lab sessions is required'
    }
  } else {
    if (!form.max_periods_per_day || form.max_periods_per_day < 1) {
      e.max_periods_per_day = 'Max periods per day is required'
    }
  }
  return e
}

function subjectPeriodSummary(row) {
  if (row.lab) {
    const sessions = row.weekly_lab_sessions ?? 0
    const consecutive = row.lab_consecutive_periods ?? 0
    return `${sessions} lab${sessions !== 1 ? 's' : ''}/wk · ${consecutive} consecutive`
  }
  return `${row.weekly_periods} per week · max ${row.max_periods_per_day ?? '—'}/day`
}

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code', render: (v) => <Badge variant="brand">{v}</Badge> },
  {
    key: 'weekly_periods',
    label: 'Scheduling',
    render: (_, row) => (
      <span className="text-gray-400 text-xs">{subjectPeriodSummary(row)}</span>
    ),
  },
  {
    key: 'lab',
    label: 'Lab',
    render: (v) => v
      ? <Badge variant="warning"><FlaskConical size={10} className="inline mr-1" />Lab</Badge>
      : <span className="text-gray-600 text-xs">—</span>,
  },
]

export default function Subjects() {
  const { toast } = useToast()
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [errors, setErrors]       = useState({})
  const [saving, setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await subjectsApi.list()
      setRows(res.data)
    } catch {
      toast.error('Failed to load subjects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null); setForm(EMPTY); setErrors({}); setModalOpen(true)
  }
  function openEdit(row) {
    setEditing(row)
    setForm({
      name: row.name,
      code: row.code,
      lab: row.lab,
      weekly_periods: row.weekly_periods,
      max_periods_per_day: row.max_periods_per_day ?? 2,
      lab_consecutive_periods: row.lab_consecutive_periods ?? 2,
      weekly_lab_sessions: row.weekly_lab_sessions ?? 1,
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
    try {
      if (editing) {
        const res = await subjectsApi.update(editing.id, form)
        setRows((prev) => prev.map((r) => r.id === editing.id ? res.data : r))
        toast.success(`Subject "${res.data.name}" updated`)
      } else {
        const res = await subjectsApi.create(form)
        setRows((prev) => [...prev, res.data])
        toast.success(`Subject "${res.data.name}" created`)
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
      await subjectsApi.remove(deleteTarget.id)
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      toast.success(`Subject "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.message ?? 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Subjects</h2>
          <p className="text-xs text-gray-500 mt-0.5">Define subjects and their weekly period requirements</p>
        </div>
        <button
          id="subject-add-btn"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-brand-600 hover:bg-brand-500 transition-colors"
        >
          <Plus size={16} />
          Add Subject
        </button>
      </div>

      <DataTable
        columns={COLUMNS}
        data={rows}
        loading={loading}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        searchKeys={['name', 'code']}
        emptyTitle="No subjects yet"
        emptyMessage="Add subjects that will be taught across departments."
        onAdd={openCreate}
        addLabel="Add Subject"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Subject' : 'New Subject'}
        onSubmit={handleSave}
        submitLabel={editing ? 'Save Changes' : 'Create'}
        loading={saving}
      >
        <SubjectForm form={form} errors={errors} onChange={handleChange} />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entityName={deleteTarget?.name ?? ''}
        entityType="subject"
        loading={deleting}
      />
    </div>
  )
}
