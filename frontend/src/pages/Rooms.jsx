import { useEffect, useState } from 'react'
import { MapPin, Plus, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        marginTop: '4px',
      }}
    >
      {ROOM_TYPES.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '10px',
            border: value === t.value ? '2px solid #2E2A6B' : '1.5px solid rgba(46,42,107,0.15)',
            background: value === t.value ? 'rgba(46,42,107,0.08)' : 'transparent',
            color: value === t.value ? '#2E2A6B' : 'var(--c-muted)',
            fontFamily: 'Figtree, sans-serif',
            fontSize: '0.875rem',
            fontWeight: value === t.value ? 600 : 500,
            cursor: 'pointer',
            transition: 'all 0.13s',
            minHeight: '40px',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function RoomForm({ form, errors, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="form-group">
        <label className="form-label">Room name *</label>
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
      <div className="form-group">
        <label className="form-label">Room code *</label>
        <input
          className={`form-input ${errors.code ? 'error' : ''}`}
          style={{ fontFamily: 'Space Grotesk, monospace' }}
          placeholder="e.g. LH-01"
          value={form.code}
          maxLength={20}
          onChange={(e) => onChange('code', e.target.value.toUpperCase())}
        />
        {errors.code && <p className="form-error">{errors.code}</p>}
      </div>
      <div className="form-group">
        <label className="form-label">Room type</label>
        <RoomTypeSegment value={form.room_type} onChange={(v) => onChange('room_type', v)} />
      </div>

      {form.room_type === 'lab' && (
        <div
          style={{
            padding: '14px',
            borderRadius: '12px',
            background: 'rgba(255,176,32,0.06)',
            border: '1px solid rgba(255,176,32,0.18)',
          }}
        >
          <div className="form-group">
            <label className="form-label" style={{ color: '#c07e00' }}>
              Lab category (e.g. programming, electronics)
            </label>
            <input
              className="form-input"
              placeholder="e.g. programming"
              value={form.lab_type}
              maxLength={50}
              onChange={(e) => onChange('lab_type', e.target.value.toLowerCase())}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--c-muted)' }}>Suggestions:</span>
            {COMMON_LAB_TYPES.map((lt) => (
              <button
                key={lt}
                type="button"
                onClick={() => onChange('lab_type', lt)}
                style={{
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  border: form.lab_type === lt ? '1px solid rgba(255,176,32,0.45)' : '1px solid rgba(46,42,107,0.15)',
                  background: form.lab_type === lt ? 'rgba(255,176,32,0.15)' : 'transparent',
                  color: form.lab_type === lt ? '#c07e00' : 'var(--c-muted)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  fontFamily: 'Figtree, sans-serif',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                {lt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="form-group">
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
  { key: 'code', label: 'Code', render: (v) => <Badge variant="primary">{v}</Badge> },
  {
    key: 'room_type',
    label: 'Type',
    render: (v, r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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
    render: (v) => <span style={{ color: 'var(--c-muted)' }}>{v} seats</span>,
  },
  {
    key: 'location',
    label: 'Floor location',
    render: (loc) => loc ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#10b981', fontSize: '0.8125rem', fontWeight: 500 }}>
        <MapPin size={12} strokeWidth={1.75} />
        <span>{loc.building_name ?? 'Building'} ({loc.floor_name ?? 'Floor'})</span>
      </div>
    ) : (
      <Link
        to="/campus-layout"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          fontSize: '0.8125rem', color: 'var(--c-muted)', textDecoration: 'none',
        }}
        title="Open campus layout to link room on floor map"
      >
        Not linked
        <span style={{ color: '#8F8CD6', textDecoration: 'underline', textUnderlineOffset: '2px' }}>→ Link on map</span>
      </Link>
    ),
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

  const totalClassrooms   = rows.filter((r) => r.room_type === 'classroom').length
  const totalLabs         = rows.filter((r) => r.room_type === 'lab').length
  const totalSeminarHalls = rows.filter((r) => r.room_type === 'seminar' || r.room_type === 'seminar_hall').length

  return (
    <div className="page-wrapper animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="page-heading">Rooms</h1>
            <span className="badge badge-primary">{rows.length}</span>
          </div>
          <p className="page-sub">Classrooms, computer &amp; hardware labs, and seminar halls</p>
        </div>
        <div className="page-header-actions">
          <button id="room-import-btn" onClick={() => setCsvOpen(true)} className="btn btn-secondary btn-sm">
            <Upload size={14} strokeWidth={1.75} aria-hidden="true" />
            Import CSV
          </button>
          <button id="room-add-btn" onClick={openCreate} className="btn btn-primary btn-sm">
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            Add room
          </button>
        </div>
      </div>

      {/* Quick stats — plain row, not cards */}
      {rows.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '24px',
            flexWrap: 'wrap',
            padding: '14px 20px',
            background: '#FFFFFF',
            border: '1px solid var(--c-border)',
            borderRadius: '14px',
            marginBottom: '20px',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {[
            { label: 'Total rooms', val: rows.length },
            { label: 'Classrooms', val: totalClassrooms },
            { label: 'Laboratories', val: totalLabs },
            { label: 'Seminar halls', val: totalSeminarHalls },
          ].map((s, i) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {i > 0 && <div style={{ width: '1px', height: '24px', background: 'var(--c-border)' }} />}
              <span style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#2E2A6B',
                letterSpacing: '-0.02em',
              }}>
                {s.val}
              </span>
              <span style={{ fontSize: '0.875rem', color: 'var(--c-muted)' }}>
                {s.label}
              </span>
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
        searchKeys={['name', 'code', 'room_type']}
        emptyTitle="No rooms yet"
        emptyMessage="Add classrooms, labs, and seminar halls."
        onAdd={openCreate}
        addLabel="Add room"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit room' : 'New room'}
        onSubmit={handleSave}
        submitLabel={editing ? 'Save changes' : 'Create'}
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
        title="Import rooms"
        hint={ROOM_CSV_HINT}
        templateRows={ROOM_CSV_TEMPLATE}
        templateFilename="rooms_template.csv"
      />
    </div>
  )
}
