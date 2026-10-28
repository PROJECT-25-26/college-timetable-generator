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
    <div className="space-y-4">
      <div>
        <label className="form-label">Department Name *</label>
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
      <div>
        <label className="form-label">Department Code *</label>
        <input
          id="dept-code"
          className={`form-input font-mono ${errors.code ? 'error' : ''}`}
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
    render: (v) => <Badge variant="brand">{v}</Badge>,
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
  const [editing, setEditing]     = useState(null)   // null = create
  const [form, setForm]           = useState(EMPTY)
  const [errors, setErrors]       = useState({})
  const [saving, setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)
  const [csvOpen, setCsvOpen]           = useState(false)

  /* ── Fetch ── */
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

  /* ── Open create modal ── */
  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setErrors({})
    setModalOpen(true)
  }

  /* ── Open edit modal ── */
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

  /* ── Save (create or update) ── */
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

  /* ── Delete ── */
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
    <div className="space-y-6 w-full max-w-[1600px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-gray-100">Departments</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-500/10 text-brand-400 border border-brand-500/20">
              {rows.length} {rows.length === 1 ? 'department' : 'departments'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Manage academic departments and assigned staffrooms</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="dept-import-btn"
            onClick={() => setCsvOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-gray-200 bg-white/8 border border-white/10 hover:bg-white/12 transition-colors"
          >
            <Upload size={15} />
            Import CSV
          </button>
          <button
            id="dept-add-btn"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-brand-600 hover:bg-brand-500 transition-colors"
          >
            <Plus size={16} />
            Add Department
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
        addLabel="Add Department"
      />

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Department' : 'New Department'}
        onSubmit={handleSave}
        submitLabel={editing ? 'Save Changes' : 'Create'}
        loading={saving}
      >
        <DeptForm form={form} errors={errors} onChange={handleChange} />
      </Modal>

      {/* Delete confirmation */}
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
        title="Import Departments"
        hint={DEPT_CSV_HINT}
        templateRows={DEPT_CSV_TEMPLATE}
        templateFilename="departments_template.csv"
      />
    </div>
  )
}
