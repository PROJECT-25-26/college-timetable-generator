import { useEffect, useState } from 'react'
import { Plus, FlaskConical, Upload } from 'lucide-react'
import { subjectsApi } from '../api'
import { useToast } from '../hooks/useToast'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Badge from '../components/Badge'
import CsvImportModal from '../components/CsvImportModal'

const EMPTY = {
  name: '',
  code: '',
  lab: false,
  weekly_periods: 3,
  lab_consecutive_periods: 2,
  weekly_lab_sessions: 1,
  required_lab_type: '',
}

const COMMON_LAB_TYPES = ['programming', 'electronics', 'workshop', 'chemistry', 'physics']

const SUBJ_CSV_TEMPLATE = `name,code,weekly_periods,lab,lab_consecutive_periods,weekly_lab_sessions,required_lab_type
Data Structures,CS201,3,false,,,
Algorithms,CS202,4,false,,,
Programming Lab,CS203L,0,true,3,1,programming
Electronics Lab,EC101L,0,true,2,2,electronics
`

const SUBJ_CSV_HINT =
  'Columns: name, code, weekly_periods (default 3), lab (true/false, default false), ' +
  'lab_consecutive_periods (required if lab=true), weekly_lab_sessions (required if lab=true), ' +
  'required_lab_type (optional category for lab subjects e.g. programming, electronics).'

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
          <span className="text-sm text-gray-300">Lab Subject</span>
        </div>
        <Toggle
          checked={form.lab}
          onChange={(v) => onChange('lab', v)}
        />
      </div>

      {form.lab ? (
        <>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
            <label className="form-label text-amber-300">Required Lab Category / Type (Optional)</label>
            <input
              className="form-input"
              placeholder="e.g. programming"
              value={form.required_lab_type}
              maxLength={50}
              onChange={(e) => onChange('required_lab_type', e.target.value.toLowerCase())}
            />
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[10px] text-gray-400">Suggestions:</span>
              {COMMON_LAB_TYPES.map((lt) => (
                <button
                  key={lt}
                  type="button"
                  onClick={() => onChange('required_lab_type', lt)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                    form.required_lab_type === lt
                      ? 'bg-amber-500/30 border-amber-500/50 text-amber-200'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                  }`}
                >
                  {lt}
                </button>
              ))}
            </div>
          </div>

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
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <FlaskConical size={12} className="inline mr-1" />
            Lab rooms matching category <strong>{form.required_lab_type || 'any lab'}</strong> will be assigned at generation time.
          </div>
        </>
      ) : (
        <PeriodSlider
          label="Weekly Periods (1–30)"
          value={form.weekly_periods}
          onChange={(v) => onChange('weekly_periods', v)}
        />
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
  }
  return e
}

function subjectPeriodSummary(row) {
  if (row.lab) {
    const sessions = row.weekly_lab_sessions ?? 0
    const consecutive = row.lab_consecutive_periods ?? 0
    return `${sessions} lab${sessions !== 1 ? 's' : ''}/wk · ${consecutive} consecutive`
  }
  return `${row.weekly_periods} periods/week`
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
    label: 'Type',
    render: (v, r) => v
      ? (
        <div className="flex items-center gap-1.5">
          <Badge variant="warning"><FlaskConical size={10} className="inline mr-1" />Lab</Badge>
          {r.required_lab_type && <Badge variant="warning">{r.required_lab_type}</Badge>}
        </div>
      )
      : <Badge variant="default">Theory</Badge>,
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
  const [csvOpen, setCsvOpen]           = useState(false)

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
      lab_consecutive_periods: row.lab_consecutive_periods ?? 2,
      weekly_lab_sessions: row.weekly_lab_sessions ?? 1,
      required_lab_type: row.required_lab_type ?? '',
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

  const totalTheory = rows.filter((s) => !s.lab).length
  const totalLabSubj = rows.filter((s) => s.lab).length
  const totalWeeklyPeriods = rows.reduce((sum, s) => sum + (s.weekly_periods || 0), 0)

  return (
    <div className="space-y-6 w-full max-w-[1600px] mx-auto animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-gray-100">Subjects</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-500/10 text-brand-400 border border-brand-500/20">
              {rows.length} {rows.length === 1 ? 'subject' : 'subjects'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Define academic subjects, weekly period requirements, and lab specifications</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="subject-import-btn"
            onClick={() => setCsvOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-gray-200 bg-white/8 border border-white/10 hover:bg-white/12 transition-colors"
          >
            <Upload size={15} />
            Import CSV
          </button>
          <button
            id="subject-add-btn"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-brand-600 hover:bg-brand-500 transition-colors"
          >
            <Plus size={16} />
            Add Subject
          </button>
        </div>
      </div>

      {/* Quick stats distribution */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Subjects', val: rows.length, icon: '📚', color: 'text-brand-300' },
            { label: 'Theory Courses', val: totalTheory, icon: '📖', color: 'text-sky-300' },
            { label: 'Lab Practicals', val: totalLabSubj, icon: '🧪', color: 'text-purple-300' },
            { label: 'Total Weekly Periods', val: `${totalWeeklyPeriods} hrs`, icon: '⏱️', color: 'text-emerald-300' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card px-4 py-3 flex items-center justify-between border border-white/5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{stat.label}</p>
                <p className={`text-xl font-bold tabular-nums mt-0.5 ${stat.color}`}>{stat.val}</p>
              </div>
              <span className="text-xl opacity-80">{stat.icon}</span>
            </div>
          ))}
        </div>
      )}

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

      <CsvImportModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onSuccess={() => load()}
        importFn={subjectsApi.importCsv}
        title="Import Subjects"
        hint={SUBJ_CSV_HINT}
        templateRows={SUBJ_CSV_TEMPLATE}
        templateFilename="subjects_template.csv"
      />
    </div>
  )
}
