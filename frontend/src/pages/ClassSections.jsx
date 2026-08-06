import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { classSectionsApi, subjectsApi } from '../api'
import { useToast } from '../hooks/useToast'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Badge from '../components/Badge'

const EMPTY_FORM = () => ({
  name: '',
  code: '',
  strength: 60,
  subject_links: [],
})

/* ──────────────────────────────────────────────
   Subject links list builder (with period override)
────────────────────────────────────────────── */
function SectionSubjectLinks({ links, subjects, onChange }) {
  const usedIds = new Set(links.map((l) => l.subject_id))
  const available = subjects.filter((s) => !usedIds.has(s.id))

  const totalPeriods = links.reduce((sum, l) => {
    const subject = subjects.find((s) => s.id === l.subject_id)
    return sum + (l.weekly_periods_override ?? subject?.weekly_periods ?? 0)
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
    <div className="space-y-2">
      {links.map((link, idx) => {
        const subject = subjects.find((s) => s.id === link.subject_id)
        const defaultPeriods = subject?.weekly_periods ?? 3
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
              <span className="text-xs text-gray-500 whitespace-nowrap">Periods</span>
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
                className="form-input w-20 text-center"
                title={`Default: ${defaultPeriods}/week — leave blank to use default`}
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
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addLink}
          disabled={available.length === 0}
          className="text-xs text-brand-400 hover:text-brand-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          + Add subject
        </button>
        {links.length > 0 && (
          <span className="text-xs text-gray-500">
            Total: <span className="text-brand-300 font-semibold">{totalPeriods}</span> periods/week
          </span>
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Form
────────────────────────────────────────────── */
function SectionForm({ form, errors, onChange, subjects }) {
  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <div>
          <label className="form-label">Section Name *</label>
          <input
            className={`form-input ${errors.name ? 'error' : ''}`}
            placeholder="e.g. CS-2023-A"
            value={form.name}
            maxLength={120}
            onChange={(e) => onChange('name', e.target.value)}
            autoFocus
          />
          {errors.name && <p className="form-error">{errors.name}</p>}
        </div>
        <div>
          <label className="form-label">Section Code *</label>
          <input
            className={`form-input font-mono ${errors.code ? 'error' : ''}`}
            placeholder="e.g. CS23A"
            value={form.code}
            maxLength={20}
            onChange={(e) => onChange('code', e.target.value.toUpperCase())}
          />
          {errors.code && <p className="form-error">{errors.code}</p>}
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
      const [secRes, subRes] = await Promise.all([
        classSectionsApi.list(),
        subjectsApi.list(),
      ])
      setRows(secRes.data)
      setSubjects(subRes.data)
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

  async function handleSave() {
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      if (editing) {
        const res = await classSectionsApi.update(editing.id, form)
        setRows((prev) => prev.map((r) => r.id === editing.id ? res.data : r))
        toast.success(`Section "${res.data.name}" updated`)
      } else {
        const res = await classSectionsApi.create(form)
        setRows((prev) => [...prev, res.data])
        toast.success(`Section "${res.data.name}" created`)
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
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code', render: (v) => <Badge variant="brand">{v}</Badge> },
    {
      key: 'strength',
      label: 'Strength',
      render: (v) => <span className="text-gray-400">{v} students</span>,
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
          <p className="text-xs text-gray-500 mt-0.5">Define class groups and their subject assignments</p>
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

      <DataTable
        columns={COLUMNS}
        data={rows}
        loading={loading}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        searchKeys={['name', 'code']}
        emptyTitle="No class sections yet"
        emptyMessage="Create sections and assign subjects to them."
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
          subjects={subjects}
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
