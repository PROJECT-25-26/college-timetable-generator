import { useEffect, useState } from 'react'
import { Plus, Upload } from 'lucide-react'
import { roomsApi } from '../api'
import { useToast } from '../hooks/useToast'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Badge from '../components/Badge'
import CsvImportModal from '../components/CsvImportModal'

const EMPTY = { name: '', code: '', room_type: 'classroom', lab_type: '', capacity: 60 }

const ROOM_TYPES = [
  { value: 'classroom', label: 'Classroom', variant: 'info' },
  { value: 'lab',       label: 'Lab',       variant: 'warning' },
  { value: 'seminar',   label: 'Seminar',   variant: 'purple' },
]

const COMMON_LAB_TYPES = ['programming', 'electronics', 'workshop', 'chemistry', 'physics']

const ROOM_CSV_TEMPLATE = `name,code,room_type,capacity,lab_type
Main Lecture Hall,LH-01,classroom,120,
Computer Lab A,CL-A,lab,40,programming
Electronics Lab 1,EL-01,lab,35,electronics
Seminar Room 1,SR-01,seminar,30,
`

const ROOM_CSV_HINT =
  'Columns: name (required), code (required), room_type (classroom/lab/seminar, default: classroom), ' +
  'capacity (positive integer, default: 60), lab_type (optional category for lab rooms e.g. programming, electronics).'

function RoomTypeSegment({ value, onChange }) {
  return (
    <div className="flex rounded-xl overflow-hidden border border-white/10">
      {ROOM_TYPES.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            value === t.value
              ? 'bg-brand-600 text-white'
              : 'bg-white/3 text-gray-400 hover:bg-white/8 hover:text-gray-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function RoomForm({ form, errors, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="form-label">Room Name *</label>
        <input
          className={`form-input ${errors.name ? 'error' : ''}`}
          placeholder="e.g. Main Lecture Hall"
          value={form.name}
          maxLength={120}
          onChange={(e) => onChange('name', e.target.value)}
          autoFocus
        />
        {errors.name && <p className="form-error">{errors.name}</p>}
      </div>
      <div>
        <label className="form-label">Room Code *</label>
        <input
          className={`form-input font-mono ${errors.code ? 'error' : ''}`}
          placeholder="e.g. LH-01"
          value={form.code}
          maxLength={20}
          onChange={(e) => onChange('code', e.target.value.toUpperCase())}
        />
        {errors.code && <p className="form-error">{errors.code}</p>}
      </div>
      <div>
        <label className="form-label">Room Type</label>
        <RoomTypeSegment value={form.room_type} onChange={(v) => onChange('room_type', v)} />
      </div>

      {form.room_type === 'lab' && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
          <label className="form-label text-amber-300">Lab Category / Type (e.g. programming, electronics)</label>
          <input
            className="form-input"
            placeholder="e.g. programming"
            value={form.lab_type}
            maxLength={50}
            onChange={(e) => onChange('lab_type', e.target.value.toLowerCase())}
          />
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-gray-400">Suggestions:</span>
            {COMMON_LAB_TYPES.map((lt) => (
              <button
                key={lt}
                type="button"
                onClick={() => onChange('lab_type', lt)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                  form.lab_type === lt
                    ? 'bg-amber-500/30 border-amber-500/50 text-amber-200'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                }`}
              >
                {lt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="form-label">Capacity (seats)</label>
        <input
          type="number"
          min={1}
          className={`form-input ${errors.capacity ? 'error' : ''}`}
          value={form.capacity}
          onChange={(e) => onChange('capacity', Number(e.target.value))}
        />
        {errors.capacity && <p className="form-error">{errors.capacity}</p>}
      </div>
    </div>
  )
}

function validate(form) {
  const e = {}
  if (!form.name.trim()) e.name = 'Name is required'
  if (!form.code.trim()) e.code = 'Code is required'
  if (form.capacity < 1) e.capacity = 'Capacity must be at least 1'
  return e
}

const ROOM_TYPE_VARIANT = { classroom: 'info', lab: 'warning', seminar: 'purple' }

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code', render: (v) => <Badge variant="brand">{v}</Badge> },
  {
    key: 'room_type',
    label: 'Type',
    render: (v, r) => (
      <div className="flex items-center gap-1.5">
        <Badge variant={ROOM_TYPE_VARIANT[v] ?? 'default'}>
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </Badge>
        {v === 'lab' && r.lab_type && (
          <Badge variant="warning">{r.lab_type}</Badge>
        )}
      </div>
    ),
  },
  {
    key: 'capacity',
    label: 'Capacity',
    render: (v) => <span className="text-gray-400">{v} seats</span>,
  },
]

export default function Rooms() {
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
      const res = await roomsApi.list()
      setRows(res.data)
    } catch {
      toast.error('Failed to load rooms')
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
      room_type: row.room_type,
      lab_type: row.lab_type ?? '',
      capacity: row.capacity,
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
        const res = await roomsApi.update(editing.id, form)
        setRows((prev) => prev.map((r) => r.id === editing.id ? res.data : r))
        toast.success(`Room "${res.data.name}" updated`)
      } else {
        const res = await roomsApi.create(form)
        setRows((prev) => [...prev, res.data])
        toast.success(`Room "${res.data.name}" created`)
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
      await roomsApi.remove(deleteTarget.id)
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      toast.success(`Room "${deleteTarget.name}" deleted`)
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
          <h2 className="text-lg font-semibold text-gray-100">Rooms</h2>
          <p className="text-xs text-gray-500 mt-0.5">Classrooms, labs, and seminar halls</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="room-import-btn"
            onClick={() => setCsvOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-gray-200 bg-white/8 border border-white/10 hover:bg-white/12 transition-colors"
          >
            <Upload size={15} />
            Import CSV
          </button>
          <button
            id="room-add-btn"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-brand-600 hover:bg-brand-500 transition-colors"
          >
            <Plus size={16} />
            Add Room
          </button>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        data={rows}
        loading={loading}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        searchKeys={['name', 'code', 'room_type']}
        emptyTitle="No rooms yet"
        emptyMessage="Add classrooms, labs, and seminar halls."
        onAdd={openCreate}
        addLabel="Add Room"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Room' : 'New Room'}
        onSubmit={handleSave}
        submitLabel={editing ? 'Save Changes' : 'Create'}
        loading={saving}
      >
        <RoomForm form={form} errors={errors} onChange={handleChange} />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entityName={deleteTarget?.name ?? ''}
        entityType="room"
        loading={deleting}
      />

      <CsvImportModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onSuccess={() => load()}
        importFn={roomsApi.importCsv}
        title="Import Rooms"
        hint={ROOM_CSV_HINT}
        templateRows={ROOM_CSV_TEMPLATE}
        templateFilename="rooms_template.csv"
      />
    </div>
  )
}
