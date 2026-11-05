import { useEffect, useState } from 'react'
import { Plus, FlaskConical, Upload, BookOpen, Microscope, Clock } from 'lucide-react'
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
      className="toggle-track"
    >
      <span className="toggle-thumb" style={{ transform: checked ? 'translateX(18px)' : 'translateX(0)' }} />
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
          style={{ flex: 1, accentColor: '#2E2A6B' }}
        />
        <span style={{
          minWidth: 40,
          textAlign: 'center',
          fontSize: '0.875rem',
          fontWeight: 700,
          color: '#2E2A6B',
          background: 'rgba(46,42,107,0.08)',
          border: '1px solid rgba(46,42,107,0.15)',
          borderRadius: 8,
          padding: '2px 8px',
          fontFamily: 'Space Grotesk, sans-serif',
        }}>
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
        <label className="form-label">Subject name *</label>
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
        <label className="form-label">Subject code *</label>
        <input
          className={`form-input font-mono ${errors.code ? 'error' : ''}`}
          placeholder="e.g. CS201"
          value={form.code}
          maxLength={20}
          onChange={(e) => onChange('code', e.target.value.toUpperCase())}
        />
        {errors.code && <p className="form-error">{errors.code}</p>}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        background: 'rgba(46,42,107,0.04)',
        borderRadius: 12,
        border: '1px solid rgba(46,42,107,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FlaskConical size={15} style={{ color: '#FFB020' }} />
          <span style={{ fontSize: '0.9375rem', color: 'var(--c-body)', fontWeight: 500 }}>Lab subject</span>
        </div>
        <Toggle
          checked={form.lab}
          onChange={(v) => onChange('lab', v)}
        />
      </div>

      {form.lab ? (
        <>
          <div style={{
            padding: '14px',
            borderRadius: 12,
            background: 'rgba(255,176,32,0.06)',
            border: '1px solid rgba(255,176,32,0.20)',
          }}>
            <label className="form-label" style={{ color: '#A07010' }}>Required lab category (optional)</label>
            <input
              className="form-input"
              placeholder="e.g. programming"
              value={form.required_lab_type}
              maxLength={50}
              onChange={(e) => onChange('required_lab_type', e.target.value.toLowerCase())}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--c-muted)' }}>Suggestions:</span>
              {COMMON_LAB_TYPES.map((lt) => (
                <button
                  key={lt}
                  type="button"
                  onClick={() => onChange('required_lab_type', lt)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 9999,
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    border: '1px solid',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: form.required_lab_type === lt ? 'rgba(255,176,32,0.18)' : 'transparent',
                    borderColor: form.required_lab_type === lt ? 'rgba(255,176,32,0.50)' : 'rgba(46,42,107,0.18)',
                    color: form.required_lab_type === lt ? '#A07010' : 'var(--c-muted)',
                  }}
                >
                  {lt}
                </button>
              ))}
            </div>
          </div>

          <PeriodSlider
            label="Consecutive periods per lab session (1–10)"
            value={form.lab_consecutive_periods}
            onChange={(v) => onChange('lab_consecutive_periods', v)}
            max={10}
          />
          {errors.lab_consecutive_periods && (
            <p className="form-error">{errors.lab_consecutive_periods}</p>
          )}
          <PeriodSlider
            label="Weekly lab sessions required (1–30)"
            value={form.weekly_lab_sessions}
            onChange={(v) => onChange('weekly_lab_sessions', v)}
          />
          {errors.weekly_lab_sessions && (
            <p className="form-error">{errors.weekly_lab_sessions}</p>
          )}
          <div style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(255,176,32,0.06)',
            border: '1px solid rgba(255,176,32,0.18)',
            fontSize: '0.8125rem',
            color: '#A07010',
          }}>
            <FlaskConical size={12} style={{ display: 'inline', marginRight: 5 }} />
            Lab rooms matching category <strong>{form.required_lab_type || 'any lab'}</strong> will be assigned at generation time.
          </div>
        </>
      ) : (
        <PeriodSlider
          label="Weekly periods (1–30)"
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
      <span style={{ color: 'var(--c-muted)', fontSize: '0.875rem' }}>{subjectPeriodSummary(row)}</span>
    ),
  },
  {
    key: 'lab',
    label: 'Type',
    render: (v, r) => v
      ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Badge variant="warning"><FlaskConical size={10} style={{ display: 'inline', marginRight: 3 }} />Lab</Badge>
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
    <div className="page-wrapper">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-heading">Subjects</h1>
          <p className="page-sub">Define academic subjects, weekly period requirements, and lab specifications</p>
        </div>
        <div className="page-header-actions">
          <button
            id="subject-import-btn"
            onClick={() => setCsvOpen(true)}
            className="btn btn-secondary btn-sm"
          >
            <Upload size={14} />
            Import CSV
          </button>
          <button
            id="subject-add-btn"
            onClick={openCreate}
            className="btn btn-primary btn-sm"
          >
            <Plus size={14} />
            Add subject
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
            { label: 'Total subjects', val: rows.length, Icon: BookOpen, color: '#2E2A6B' },
            { label: 'Theory courses', val: totalTheory, Icon: BookOpen, color: '#2E2A6B' },
            { label: 'Lab practicals', val: totalLabSubj, Icon: Microscope, color: '#FFB020' },
            { label: 'Weekly periods', val: `${totalWeeklyPeriods}`, Icon: Clock, color: '#8F8CD6' },
          ].map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="stat-card-icon" style={{ background: `${stat.color}12` }}>
                <stat.Icon size={18} style={{ color: stat.color }} />
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
        columns={COLUMNS}
        data={rows}
        loading={loading}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        searchKeys={['name', 'code']}
        emptyTitle="No subjects yet"
        emptyMessage="Add subjects that will be taught across departments."
        onAdd={openCreate}
        addLabel="Add subject"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit subject' : 'New subject'}
        onSubmit={handleSave}
        submitLabel={editing ? 'Save changes' : 'Create'}
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
        title="Import subjects"
        hint={SUBJ_CSV_HINT}
        templateRows={SUBJ_CSV_TEMPLATE}
        templateFilename="subjects_template.csv"
      />
    </div>
  )
}
