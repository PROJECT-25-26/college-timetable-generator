/**
 * ExportModal.jsx — Clean studio export modal for PDF, Excel, and CSV downloads.
 *
 * Supports scopes:
 *   - 'class': Per-class timetable (All classes or specific section)
 *   - 'teacher': Per-teacher timetable (All teachers or specific teacher)
 *   - 'master': Full Master timetable
 */

import { useState, useEffect } from 'react'
import {
  X, FileText, FileSpreadsheet, Download,
  Users, LayoutGrid, Calendar, Loader2, CheckCircle2,
} from 'lucide-react'
import { timetablesApi } from '../api'
import { useToast } from '../hooks/useToast'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function ExportModal({
  isOpen,
  onClose,
  timetable,
  sectionMap = {},
  teacherMap = {},
  subjectMap = {},
  roomMap = {},
  initialScope = 'master',
  initialEntityId = '',
}) {
  const { toast } = useToast()

  const [scope, setScope] = useState(initialScope)
  const [entityId, setEntityId] = useState(initialEntityId)
  const [downloading, setDownloading] = useState(null) // 'pdf' | 'excel' | 'csv' | null

  useEffect(() => {
    if (isOpen) {
      setScope(initialScope || 'master')
      setEntityId(initialEntityId || '')
      setDownloading(null)
    }
  }, [isOpen, initialScope, initialEntityId])

  if (!isOpen || !timetable) return null

  const sectionsList = Object.values(sectionMap).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const teachersList = Object.values(teacherMap).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const handleDownload = async (format) => {
    if (downloading) return
    setDownloading(format)

    try {
      if (format === 'pdf') {
        const res = await timetablesApi.exportPdf(timetable.id, scope, entityId || null)
        triggerBlobDownload(res.data, `timetable_${scope}_${entityId || 'all'}.pdf`, 'application/pdf')
        toast.success(`PDF Timetable (${scope.toUpperCase()}) downloaded successfully!`)
      } else if (format === 'excel') {
        const res = await timetablesApi.exportExcel(timetable.id, scope, entityId || null)
        triggerBlobDownload(
          res.data,
          `timetable_${scope}_${entityId || 'all'}.xlsx`,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        toast.success(`Excel Timetable (${scope.toUpperCase()}) downloaded successfully!`)
      } else if (format === 'csv') {
        exportCsvLocal(timetable, scope, entityId, subjectMap, teacherMap, sectionMap, roomMap)
        toast.success('CSV file downloaded successfully!')
      }
    } catch (err) {
      console.error('Export failed:', err)
      toast.error('Failed to download timetable export. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel max-w-xl w-full"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Export Timetable"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 'var(--r-btn)',
                background: 'rgba(46,42,107,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--c-primary)',
              }}
            >
              <Download size={18} strokeWidth={2} />
            </div>
            <div>
              <h3 className="modal-title" style={{ margin: 0, fontSize: '1.0625rem' }}>
                Export Timetable
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', margin: 0 }}>
                Run: <span style={{ fontWeight: 600, color: 'var(--c-body)' }}>{timetable.label || timetable.id.slice(0, 8)}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            aria-label="Close dialog"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body space-y-5">
          {/* Scope Selector */}
          <div>
            <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
              1. Select export scope
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => { setScope('class'); setEntityId(''); }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 10px',
                  borderRadius: 'var(--r-btn)',
                  border: scope === 'class' ? '2px solid var(--c-primary)' : '1px solid var(--c-border)',
                  background: scope === 'class' ? 'rgba(46,42,107,0.06)' : 'var(--c-surface)',
                  color: scope === 'class' ? 'var(--c-body)' : 'var(--c-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <LayoutGrid size={22} color={scope === 'class' ? 'var(--c-primary)' : 'var(--c-muted)'} strokeWidth={2} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 700, margin: 0 }}>Per-class</p>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--c-muted)', margin: '2px 0 0 0' }}>By class section</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setScope('teacher'); setEntityId(''); }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 10px',
                  borderRadius: 'var(--r-btn)',
                  border: scope === 'teacher' ? '2px solid var(--c-primary)' : '1px solid var(--c-border)',
                  background: scope === 'teacher' ? 'rgba(46,42,107,0.06)' : 'var(--c-surface)',
                  color: scope === 'teacher' ? 'var(--c-body)' : 'var(--c-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Users size={22} color={scope === 'teacher' ? 'var(--c-primary)' : 'var(--c-muted)'} strokeWidth={2} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 700, margin: 0 }}>Per-teacher</p>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--c-muted)', margin: '2px 0 0 0' }}>By faculty member</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setScope('master'); setEntityId(''); }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 10px',
                  borderRadius: 'var(--r-btn)',
                  border: scope === 'master' ? '2px solid var(--c-primary)' : '1px solid var(--c-border)',
                  background: scope === 'master' ? 'rgba(46,42,107,0.06)' : 'var(--c-surface)',
                  color: scope === 'master' ? 'var(--c-body)' : 'var(--c-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Calendar size={22} color={scope === 'master' ? 'var(--c-primary)' : 'var(--c-muted)'} strokeWidth={2} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 700, margin: 0 }}>Master</p>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--c-muted)', margin: '2px 0 0 0' }}>Full college matrix</p>
                </div>
              </button>
            </div>
          </div>

          {/* Filter Dropdown (Class or Teacher) */}
          {scope === 'class' && (
            <div>
              <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>
                2. Filter specific class section (optional)
              </label>
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="form-input"
              >
                <option value="">
                  Export all class sections (multi-sheet / multi-page)
                </option>
                {sectionsList.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name} ({sec.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === 'teacher' && (
            <div>
              <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>
                2. Filter specific teacher (optional)
              </label>
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="form-input"
              >
                <option value="">
                  Export all teachers (multi-sheet / multi-page)
                </option>
                {teachersList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === 'master' && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--r-input)',
                background: 'rgba(46,42,107,0.05)',
                border: '1px solid var(--c-border)',
                fontSize: '0.8125rem',
                color: 'var(--c-body)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <CheckCircle2 size={16} color="var(--c-primary)" strokeWidth={2} className="shrink-0" />
              <span>
                Master export compiles the complete college timetable matrix, per-class schedule breakdown, and faculty assignments.
              </span>
            </div>
          )}

          {/* Download Buttons */}
          <div>
            <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
              {scope === 'master' ? '2. Select export format' : '3. Select export format'}
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* PDF Button */}
              <button
                type="button"
                disabled={!!downloading}
                onClick={() => handleDownload('pdf')}
                className="btn btn-secondary"
                style={{
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {downloading === 'pdf' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FileText size={16} color="#c62828" strokeWidth={2} />
                )}
                <span>Export PDF</span>
              </button>

              {/* Excel Button */}
              <button
                type="button"
                disabled={!!downloading}
                onClick={() => handleDownload('excel')}
                className="btn btn-secondary"
                style={{
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {downloading === 'excel' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={16} color="#2e7d32" strokeWidth={2} />
                )}
                <span>Export Excel</span>
              </button>

              {/* CSV Button - One Main Action with Primary / Accent Highlight */}
              <button
                type="button"
                disabled={!!downloading}
                onClick={() => handleDownload('csv')}
                className="btn btn-primary"
                style={{
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {downloading === 'csv' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} strokeWidth={2} />
                )}
                <span>Export CSV</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function triggerBlobDownload(blobData, filename, contentType) {
  const blob = blobData instanceof Blob ? blobData : new Blob([blobData], { type: contentType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportCsvLocal(timetable, scope, entityId, subjectMap, teacherMap, sectionMap, roomMap) {
  let filteredSlots = timetable.slots || []

  if (scope === 'class' && entityId) {
    filteredSlots = filteredSlots.filter((s) => s.section_id === entityId)
  } else if (scope === 'teacher' && entityId) {
    filteredSlots = filteredSlots.filter((s) => s.teacher_id === entityId)
  }

  const rows = [['Class Section', 'Subject Name', 'Subject Code', 'Teacher', 'Room Code', 'Day', 'Period']]
  for (const s of filteredSlots) {
    rows.push([
      sectionMap[s.section_id]?.name || s.section_id || '',
      subjectMap[s.subject_id]?.name || s.subject_id || '',
      subjectMap[s.subject_id]?.code || '',
      teacherMap[s.teacher_id]?.name || s.teacher_id || '',
      roomMap[s.room_id]?.code || s.room_id || '',
      DAY_LABELS[s.day_of_week] ?? s.day_of_week,
      `P${s.period_index + 1}`,
    ])
  }

  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  triggerBlobDownload(blob, `timetable_${scope}_${entityId || 'all'}.csv`, 'text/csv')
}
