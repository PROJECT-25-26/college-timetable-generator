/**
 * ExportModal.jsx — High-end glassmorphism export modal for PDF, Excel, and CSV downloads.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-xl rounded-2xl border border-white/15 bg-gray-900/90 p-6 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30">
              <Download size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Export Timetable</h3>
              <p className="text-xs text-gray-400">
                Run: <span className="text-gray-200 font-medium">{timetable.label || timetable.id.slice(0, 8)}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="py-5 space-y-6">
          {/* Scope Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-2.5">
              1. Select Export Scope
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => { setScope('class'); setEntityId(''); }}
                className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border text-center transition-all ${
                  scope === 'class'
                    ? 'bg-brand-600/25 border-brand-500 text-white shadow-lg shadow-brand-500/20'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                }`}
              >
                <LayoutGrid size={22} className={scope === 'class' ? 'text-brand-400' : 'text-gray-400'} />
                <div>
                  <p className="text-xs font-bold">Per-Class</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">By Class Section</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setScope('teacher'); setEntityId(''); }}
                className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border text-center transition-all ${
                  scope === 'teacher'
                    ? 'bg-teal-600/25 border-teal-500 text-white shadow-lg shadow-teal-500/20'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                }`}
              >
                <Users size={22} className={scope === 'teacher' ? 'text-teal-400' : 'text-gray-400'} />
                <div>
                  <p className="text-xs font-bold">Per-Teacher</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">By Faculty Member</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setScope('master'); setEntityId(''); }}
                className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border text-center transition-all ${
                  scope === 'master'
                    ? 'bg-purple-600/25 border-purple-500 text-white shadow-lg shadow-purple-500/20'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                }`}
              >
                <Calendar size={22} className={scope === 'master' ? 'text-purple-400' : 'text-gray-400'} />
                <div>
                  <p className="text-xs font-bold">Master</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Full College Matrix</p>
                </div>
              </button>
            </div>
          </div>

          {/* Filter Dropdown (Class or Teacher) */}
          {scope === 'class' && (
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                2. Filter Specific Class Section (Optional)
              </label>
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-200 focus:outline-none focus:border-brand-500 transition-colors"
              >
                <option value="" className="bg-gray-900 text-white">
                  ✨ Export All Class Sections (Multi-Page / Multi-Sheet)
                </option>
                {sectionsList.map((sec) => (
                  <option key={sec.id} value={sec.id} className="bg-gray-900 text-white">
                    {sec.name} ({sec.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === 'teacher' && (
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                2. Filter Specific Teacher (Optional)
              </label>
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-200 focus:outline-none focus:border-brand-500 transition-colors"
              >
                <option value="" className="bg-gray-900 text-white">
                  ✨ Export All Teachers (Multi-Page / Multi-Sheet)
                </option>
                {teachersList.map((t) => (
                  <option key={t.id} value={t.id} className="bg-gray-900 text-white">
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === 'master' && (
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0 text-purple-400" />
              <span>
                Master export includes the complete college timetable matrix, per-class schedule breakdown, teacher schedule breakdown, and raw slot logs.
              </span>
            </div>
          )}

          {/* Download Buttons */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-2.5">
              {scope === 'master' ? '2. Select Export Format' : '3. Select Export Format'}
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* PDF Button */}
              <button
                type="button"
                disabled={!!downloading}
                onClick={() => handleDownload('pdf')}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600/80 hover:bg-red-600 border border-red-500/50 text-white text-xs font-bold transition-all shadow-md shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading === 'pdf' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FileText size={16} />
                )}
                <span>Export PDF</span>
              </button>

              {/* Excel Button */}
              <button
                type="button"
                disabled={!!downloading}
                onClick={() => handleDownload('excel')}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 border border-emerald-500/50 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading === 'excel' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={16} />
                )}
                <span>Export Excel</span>
              </button>

              {/* CSV Button */}
              <button
                type="button"
                disabled={!!downloading}
                onClick={() => handleDownload('csv')}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-gray-200 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading === 'csv' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
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
