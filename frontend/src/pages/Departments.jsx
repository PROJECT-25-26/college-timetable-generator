import { useEffect, useState } from 'react'
import { Plus, Upload } from 'lucide-react'
import { departmentsApi } from '../api'
import { useToast } from '../hooks/useToast'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Badge from '../components/Badge'
import CsvImportModal from '../components/CsvImportModal'

const DEPT_CSV_TEMPLATE = `name,code
Computer Science,CS
Electrical Engineering,EE
Mechanical Engineering,ME
`

const DEPT_CSV_HINT =
  'Columns: name (required), code (required, auto-uppercased). ' +
  'Duplicate codes within the file or already in the database are rejected.'

const EMPTY = { name: '', code: '' }

function DeptForm({ form, errors, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="form-group">
        <label htmlFor="dept-name" className="form-label">Department name *</label>
        <input
          id="dept-name"
          className={`form-input ${errors.name ? 'error' : ''}`}
          placeholder="e.g. Computer Science"
          value={form.name}
          maxLength={120}
          onChange={(e) => onChange('name', e.target.value)}
          autoFocus
        />
        {errors.name && <p className="form-error">{errors.name}</p>}
      </div>
      <div className="form-group">
        <label htmlFor="dept-code" className="form-label">Department code *</label>
        <input
          id="dept-code"
          className={`form-input ${errors.code ? 'error' : ''}`}
          style={{ fontFamily: 'Space Grotesk, monospace' }}
          placeholder="e.g. CS"
          value={form.code}
          maxLength={20}
          onChange={(e) => onChange('code', e.target.value.toUpperCase())}
        />
        {errors.code && <p className="form-error">{errors.code}</p>}
      </div>
    </div>
  )
}

function validate(form) {
  const e = {}
  if (!form.name.trim()) e.name = 'Name is required'
  if (!form.code.trim()) e.code = 'Code is required'
  return e
}

const COLUMNS = [
  { key: 'name',  label: 'Name' },
  {
    key: 'code',
    label: 'Code',
    render: (v) => <Badge variant="primary">{v}</Badge>,
  },
  {
    key: 'created_at',
    label: 'Created',
    sortable: false,
    render: (v) => v ? new Date(v).toLocaleDateString() : '—',
  },
]

export default function Departments() {
  const { toast } = useToast()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
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
      const res = await departmentsApi.list()
      setRows(res.data)
    } catch {
      toast.error('Failed to load departments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setErrors({})
    setModalOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    setForm({ name: row.name, code: row.code })
    setErrors({})
    setModalOpen(true)
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
        const res = await departmentsApi.update(editing.id, form)
        setRows((prev) => prev.map((r) => r.id === editing.id ? res.data : r))
        toast.success(`Department "${res.data.name}" updated`)
      } else {
        const res = await departmentsApi.create(form)
        setRows((prev) => [...prev, res.data])
        toast.success(`Department "${res.data.name}" created`)
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
      await departmentsApi.remove(deleteTarget.id)
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      toast.success(`Department "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.message ?? 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page-wrapper animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="page-heading">Departments</h1>
            <span className="badge badge-primary">{rows.length}</span>
          </div>
          <p className="page-sub">Manage academic departments and their staffrooms</p>
        </div>
        <div className="page-header-actions">
          <button
            id="dept-import-btn"
            onClick={() => setCsvOpen(true)}
            className="btn btn-secondary btn-sm"
          >
            <Upload size={14} strokeWidth={1.75} aria-hidden="true" />
            Import CSV
          </button>
          <button
            id="dept-add-btn"
            onClick={openCreate}
            className="btn btn-primary btn-sm"
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            Add department
          </button>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        data={rows}
        loading={loading}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        searchKeys={['name', 'code']}
        emptyTitle="No departments yet"
        emptyMessage="Add your first department to get started."
        onAdd={openCreate}
        addLabel="Add department"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit department' : 'New department'}
        onSubmit={handleSave}
        submitLabel={editing ? 'Save changes' : 'Create'}
        loading={saving}
      >
        <DeptForm form={form} errors={errors} onChange={handleChange} />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entityName={deleteTarget?.name ?? ''}
        entityType="department"
        loading={deleting}
      />

      <CsvImportModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onSuccess={() => load()}
        importFn={departmentsApi.importCsv}
        title="Import departments"
        hint={DEPT_CSV_HINT}
        templateRows={DEPT_CSV_TEMPLATE}
        templateFilename="departments_template.csv"
      />
    </div>
  )
}
