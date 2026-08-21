import { useEffect, useState } from 'react'
import { Plus, Trash2, Home, FlaskConical } from 'lucide-react'
import { classSectionsApi, subjectsApi, roomsApi } from '../api'
import { useToast } from '../hooks/useToast'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Badge from '../components/Badge'

const EMPTY_FORM = () => ({
  name: '',
  code: '',
  strength: 60,
  homeroom_id: '',
  subject_links: [],
})

function subjectWeeklyPeriods(subject) {
  if (!subject) return 0
  if (subject.lab) {
    return (subject.weekly_lab_sessions ?? 0) * (subject.lab_consecutive_periods ?? 0)
  }
  return subject.weekly_periods ?? 0
}

/* ──────────────────────────────────────────────
   Subject links list builder (with period override)
────────────────────────────────────────────── */
function SectionSubjectLinks({ links, subjects, onChange }) {
  const usedIds = new Set(links.map((l) => l.subject_id))
  const available = subjects.filter((s) => !usedIds.has(s.id))

  const totalPeriods = links.reduce((sum, l) => {
    const subject = subjects.find((s) => s.id === l.subject_id)
    return sum + (l.weekly_periods_override ?? subjectWeeklyPeriods(subject))
  }, 0)

  function addLink() {
    if (available.length === 0) return
    onChange([...links, { subject_id: available[0].id, weekly_periods_override: null }])
  }
  function removeLink(idx) {
    onChange(links.filter((_, i) => i !== idx))
  }
  function updateLink(idx, field, value) {
    onChange(links.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  return (
    <div className="space-y-3">
      {subjects.length === 0 ? (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
          No subjects exist in the system yet. Please create subjects in the <strong>Subjects</strong> page first before assigning them to a class section.
        </div>
      ) : links.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No subjects assigned to this section yet. Click "+ Add subject to section" below.</p>
      ) : null}

      {links.map((link, idx) => {
        const subject = subjects.find((s) => s.id === link.subject_id)
        const defaultPeriods = subjectWeeklyPeriods(subject) || 3
        return (
          <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10">
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
            {subject?.lab && (
              <span className="text-xs text-amber-400 shrink-0 flex items-center gap-1">
                <FlaskConical size={12} />Lab
              </span>
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-gray-400 whitespace-nowrap">Periods/wk</span>
              <input
                type="number"
                min={1}
                max={30}
                placeholder={String(defaultPeriods)}
                value={link.weekly_periods_override ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value)
                  updateLink(idx, 'weekly_periods_override', v)
                }}
                className="form-input w-20 text-center text-sm"
                title={`Default: ${defaultPeriods}/week — leave blank to use subject default`}
              />
            </div>
            <button
              type="button"
              onClick={() => removeLink(idx)}
              className="p-1.5 text-gray-400 hover:text-red-400 transition-colors shrink-0"
              title="Remove subject from section"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )
      })}

      {subjects.length > 0 && available.length === 0 && links.length > 0 && (
        <p className="text-xs text-gray-500 italic">All available subjects have been assigned to this section.</p>
      )}

      <div className="flex items-center justify-between pt-1">
        {subjects.length > 0 && available.length > 0 && (
          <button
            type="button"
            onClick={addLink}
            className="flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
          >
            + Add subject to section
          </button>
        )}
        {links.length > 0 && (
          <span className="text-xs text-gray-400 ml-auto">
            Total: <span className="text-brand-300 font-semibold">{totalPeriods}</span> weekly periods
          </span>
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Form
────────────────────────────────────────────── */
function SectionForm({ form, errors, onChange, onHomeroomChange, subjects, rooms }) {
  // Only classroom / seminar rooms are eligible as homeroooms
  const eligibleRooms = rooms.filter(
    (r) => r.room_type === 'classroom' || r.room_type === 'seminar'
  )
  const selectedRoom = eligibleRooms.find((r) => r.id === form.homeroom_id)
  const codeAutoFilled = selectedRoom && form.code === selectedRoom.code

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <div>
          <label className="form-label">Section Name *</label>
          <input
            className={`form-input ${errors.name ? 'error' : ''}`}
            placeholder="e.g. CS Batch 1"
            value={form.name}
            maxLength={120}
            onChange={(e) => onChange('name', e.target.value)}
            autoFocus
          />
          {errors.name && <p className="form-error">{errors.name}</p>}
        </div>
        <div>
          <label className="form-label">Strength (number of students)</label>
          <input
            type="number"
            min={1}
            className={`form-input ${errors.strength ? 'error' : ''}`}
            value={form.strength}
            onChange={(e) => onChange('strength', Number(e.target.value))}
          />
          {errors.strength && <p className="form-error">{errors.strength}</p>}
        </div>

        {/* Homeroom — primary identifier */}
        <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/20 space-y-3">
          <div className="flex items-center gap-2">
            <Home size={15} className="text-brand-400" />
            <span className="text-xs font-semibold text-brand-300 uppercase tracking-widest">Homeroom</span>
            <span className="text-xs text-gray-600 ml-1">— the section's fixed classroom identifier</span>
          </div>
          <p className="text-xs text-gray-500">
            Selecting a homeroom auto-fills the section code with the room's code, linking them as one identity.
            Teachers travel here; lab rooms are assigned dynamically at generation time.
          </p>
          <select
            className="form-input"
            value={form.homeroom_id}
            onChange={(e) => onHomeroomChange(e.target.value, eligibleRooms)}
          >
            <option value="">— No homeroom assigned —</option>
            {eligibleRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code}) · Cap {r.capacity}
              </option>
            ))}
          </select>
          {eligibleRooms.length === 0 && (
            <p className="text-xs text-amber-400">
              No classrooms or seminar rooms exist yet. Add rooms first.
            </p>
          )}

          {/* Section code — auto-filled from room, still editable */}
          <div>
            <label className="form-label flex items-center gap-2">
              Section Code *
              {codeAutoFilled && (
                <span className="text-xs font-normal text-brand-400/80 normal-case tracking-normal">
                  ✓ auto-filled from room
                </span>
              )}
            </label>
            <input
              className={`form-input font-mono ${errors.code ? 'error' : ''}`}
              placeholder={selectedRoom ? selectedRoom.code : 'e.g. CS-B1'}
              value={form.code}
              maxLength={20}
              onChange={(e) => onChange('code', e.target.value.toUpperCase())}
            />
            {errors.code && <p className="form-error">{errors.code}</p>}
            <p className="text-xs text-gray-600 mt-1">You can edit this if you need a different identifier.</p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Subject Assignment</p>
        <p className="text-xs text-gray-600 mb-3">
          Leave "Periods" blank to use the subject's default. Override to set a different count for this section.
        </p>
        <SectionSubjectLinks
          links={form.subject_links}
          subjects={subjects}
          onChange={(v) => onChange('subject_links', v)}
        />
      </div>
    </div>
  )
}

function validate(form) {
  const e = {}
  if (!form.name.trim()) e.name = 'Name is required'
  if (!form.code.trim()) e.code = 'Code is required'
  if (form.strength < 1) e.strength = 'Strength must be at least 1'
  return e
}

/* ──────────────────────────────────────────────
   Table helpers
────────────────────────────────────────────── */
function SubjectPills({ links, subjects }) {
  if (!links?.length) return <span className="text-gray-600 text-xs">—</span>
  const show = links.slice(0, 3)
  const more = links.length - show.length
  return (
    <div className="flex flex-wrap gap-1">
      {show.map((l) => {
        const sub = subjects.find((s) => s.id === l.subject_id)
        return <Badge key={l.subject_id} variant="brand">{sub?.code ?? '…'}</Badge>
      })}
      {more > 0 && <Badge variant="default">+{more}</Badge>}
    </div>
  )
}


/* ──────────────────────────────────────────────
   Page
────────────────────────────────────────────── */
export default function ClassSections() {
  const { toast } = useToast()
  const [rows, setRows]           = useState([])
  const [subjects, setSubjects]   = useState([])
  const [rooms, setRooms]         = useState([])
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
      const [secRes, subRes, roomRes] = await Promise.all([
        classSectionsApi.list(),
        subjectsApi.list(),
        roomsApi.list(),
      ])
      setRows(secRes.data)
      setSubjects(subRes.data)
      setRooms(roomRes.data)
    } catch {
      toast.error('Failed to load class sections')
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
      code: row.code,
      strength: row.strength,
      homeroom_id: row.homeroom_id ?? '',
      subject_links: (row.subject_links ?? []).map((l) => ({
        subject_id: l.subject_id,
        weekly_periods_override: l.weekly_periods_override ?? null,
      })),
    })
    setErrors({}); setModalOpen(true)
  }
  function handleChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  // When homeroom changes, auto-fill the section code with the room code
  function handleHomeroomChange(roomId, eligibleRooms) {
    const room = eligibleRooms.find((r) => r.id === roomId)
    setForm((f) => ({
      ...f,
      homeroom_id: roomId,
      // Auto-fill code only if it's currently blank or was previously auto-filled from a room
      code: room ? room.code : f.code,
    }))
    if (errors.homeroom_id) setErrors((e) => ({ ...e, homeroom_id: undefined }))
    if (errors.code) setErrors((e) => ({ ...e, code: undefined }))
  }

  async function handleSave() {
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    const payload = {
      ...form,
      homeroom_id: form.homeroom_id || null,
    }
    try {
      if (editing) {
        const res = await classSectionsApi.update(editing.id, payload)
        setRows((prev) => prev.map((r) => r.id === editing.id ? res.data : r))
        toast.success(`Section "${res.data.name}" updated`)
      } else {
        const res = await classSectionsApi.create(payload)
        setRows((prev) => [...prev, res.data])
        toast.success(`Section "${res.data.name}" created`)
      }
      setModalOpen(false)
    } catch (err) {
      console.error('Save class section failed:', err)
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
      await classSectionsApi.remove(deleteTarget.id)
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      toast.success(`Section "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.message ?? 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const COLUMNS = [
    { key: 'name', label: 'Section' },
    {
      key: 'homeroom',
      label: 'Room',
      sortable: false,
      render: (homeroom, row) => (
        <div className="flex items-center gap-2">
          <Home size={12} className="text-brand-400 shrink-0" />
          <span className="text-xs text-gray-300">
            {homeroom ? homeroom.name : <span className="text-gray-600">—</span>}
          </span>
          <Badge variant="brand">
            {homeroom ? homeroom.code : row.code}
          </Badge>
        </div>
      ),
    },
    {
      key: 'strength',
      label: 'Students',
      render: (v) => <span className="text-gray-400">{v}</span>,
    },
    {
      key: 'subject_links',
      label: 'Subjects',
      sortable: false,
      render: (v) => <SubjectPills links={v} subjects={subjects} />,
    },
  ]

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Class Sections</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Define class batches, assign a fixed homeroom, and map their subjects
          </p>
        </div>
        <button
          id="section-add-btn"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-brand-600 hover:bg-brand-500 transition-colors"
        >
          <Plus size={16} />
          Add Section
        </button>
      </div>

      {/* Homeroom model info banner */}
      <div className="p-4 rounded-2xl bg-white/3 border border-white/8 flex items-start gap-3">
        <Home size={18} className="text-brand-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-gray-200">Homeroom Model</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Each class section has a fixed <span className="text-brand-300">homeroom classroom</span> — teachers travel to the class for every non-lab period.
            Lab rooms are <span className="text-amber-300">dynamically allocated</span> from the available pool of lab rooms at timetable generation time.
          </p>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        data={rows}
        loading={loading}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        searchKeys={['name', 'code']}
        emptyTitle="No class sections yet"
        emptyMessage="Create sections, assign their homeroom classroom, and map subjects to them."
        onAdd={openCreate}
        addLabel="Add Section"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Class Section' : 'New Class Section'}
        onSubmit={handleSave}
        submitLabel={editing ? 'Save Changes' : 'Create'}
        loading={saving}
        size="lg"
      >
        <SectionForm
          form={form}
          errors={errors}
          onChange={handleChange}
          onHomeroomChange={handleHomeroomChange}
          subjects={subjects}
          rooms={rooms}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entityName={deleteTarget?.name ?? ''}
        entityType="class section"
        loading={deleting}
      />
    </div>
  )
}
