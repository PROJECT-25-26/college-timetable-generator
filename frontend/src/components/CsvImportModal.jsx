import { useRef, useState } from 'react'
import { Upload, FileText, AlertTriangle, CheckCircle2, Download, X, RefreshCw } from 'lucide-react'

/**
 * CsvImportModal — 3-step CSV import wizard
 *
 * Props:
 *   open        – boolean
 *   onClose     – () => void
 *   onSuccess   – (result: { imported, message }) => void  (called after a successful import)
 *   importFn    – (file: File) => Promise<AxiosResponse>   (API call)
 *   title       – string   (e.g. "Import Teachers")
 *   hint        – string   (short description below the drop-zone)
 *   templateRows – string  (raw CSV text for the template download; optional)
 *   templateFilename – string (default "template.csv")
 */

const STEP_UPLOAD  = 'upload'
const STEP_ERRORS  = 'errors'
const STEP_SUCCESS = 'success'

export default function CsvImportModal({
  open,
  onClose,
  onSuccess,
  importFn,
  title = 'Import CSV',
  hint = '',
  templateRows = '',
  templateFilename = 'template.csv',
}) {
  const [step,     setStep]     = useState(STEP_UPLOAD)
  const [file,     setFile]     = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [errors,   setErrors]   = useState([])   // [{ row, field, message }]
  const [result,   setResult]   = useState(null) // { imported, message }
  const inputRef = useRef(null)

  /* ── Reset when opened/closed ─────────────────────────────────────────── */
  function reset() {
    setStep(STEP_UPLOAD)
    setFile(null)
    setDragging(false)
    setLoading(false)
    setErrors([])
    setResult(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  /* ── File selection ───────────────────────────────────────────────────── */
  function pickFile(f) {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.csv')) {
      alert('Please select a .csv file.')
      return
    }
    setFile(f)
  }

  function onInputChange(e) { pickFile(e.target.files?.[0]) }
  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    pickFile(e.dataTransfer.files?.[0])
  }
  function onDragOver(e) { e.preventDefault(); setDragging(true) }
  function onDragLeave()  { setDragging(false) }

  /* ── Template download ────────────────────────────────────────────────── */
  function downloadTemplate() {
    if (!templateRows) return
    const blob = new Blob([templateRows], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = templateFilename
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ── Upload ───────────────────────────────────────────────────────────── */
  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setErrors([])
    try {
      const res = await importFn(file)
      setResult(res.data)
      setStep(STEP_SUCCESS)
      onSuccess?.(res.data)
    } catch (err) {
      const detail = err.response?.data?.detail
      if (detail?.errors && Array.isArray(detail.errors)) {
        setErrors(detail.errors)
        setStep(STEP_ERRORS)
      } else {
        const msg =
          (typeof detail === 'string' ? detail : null) ??
          err.message ??
          'Import failed.'
        alert(`Error: ${msg}`)
      }
    } finally {
      setLoading(false)
    }
  }

  function retryUpload() {
    setStep(STEP_UPLOAD)
    setFile(null)
    setErrors([])
  }

  if (!open) return null

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col
                   bg-gray-900 border border-white/10 rounded-2xl shadow-2xl animate-fade-in overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <Upload size={16} style={{ color: '#2E2A6B' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--c-body)', margin: 0 }}>{title}</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === STEP_UPLOAD && (
            <UploadStep
              file={file}
              dragging={dragging}
              inputRef={inputRef}
              hint={hint}
              templateRows={templateRows}
              onInputChange={onInputChange}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDownloadTemplate={downloadTemplate}
              onClear={() => { setFile(null); if (inputRef.current) inputRef.current.value = '' }}
            />
          )}
          {step === STEP_ERRORS && <ErrorStep errors={errors} />}
          {step === STEP_SUCCESS && <SuccessStep result={result} />}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0">
          {step === STEP_UPLOAD && (
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium rounded-xl text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || loading}
                className="px-4 py-2 text-sm font-medium rounded-xl text-white bg-brand-600 hover:bg-brand-500 transition-colors disabled:opacity-40 flex items-center gap-2"
              >
                {loading && (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {loading ? 'Validating…' : 'Upload & Validate'}
              </button>
            </div>
          )}

          {step === STEP_ERRORS && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-red-400 font-medium">
                {errors.length} error{errors.length !== 1 ? 's' : ''} — no data was saved
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={retryUpload}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <RefreshCw size={13} />
                  Fix &amp; Re-upload
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium rounded-xl text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {step === STEP_SUCCESS && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 text-sm font-medium rounded-xl text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Step: Upload ─────────────────────────────────────────────────────────── */
function UploadStep({
  file, dragging, inputRef, hint, templateRows,
  onInputChange, onDrop, onDragOver, onDragLeave,
  onDownloadTemplate, onClear,
}) {
  return (
    <div className="space-y-5">
      {/* Hint / format description */}
      {hint && (
        <p className="text-sm text-gray-400 leading-relaxed">{hint}</p>
      )}

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-3
          min-h-[160px] rounded-2xl border-2 border-dashed cursor-pointer
          transition-all duration-200
          ${dragging
            ? 'border-brand-400 bg-brand-500/10 scale-[1.01]'
            : file
              ? 'border-emerald-500/50 bg-emerald-500/5'
              : 'border-white/15 bg-white/3 hover:border-white/30 hover:bg-white/5'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onInputChange}
        />

        {file ? (
          <>
            <FileText size={32} className="text-emerald-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-emerald-300">{file.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {(file.size / 1024).toFixed(1)} KB · Click to replace
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear() }}
              className="absolute top-3 right-3 p-1 rounded-lg text-gray-500 hover:text-red-400 hover:bg-white/10 transition-colors"
              title="Remove file"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <Upload size={28} className={dragging ? 'text-brand-400' : 'text-gray-600'} />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-300">
                {dragging ? 'Drop to upload' : 'Drag & drop a .csv file'}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">or click to browse</p>
            </div>
          </>
        )}
      </div>

      {/* Template download */}
      {templateRows && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-brand-500/5 border border-brand-500/15">
          <Download size={14} className="text-brand-400 shrink-0" />
          <p className="text-xs text-gray-400 flex-1">
            Not sure of the format?{' '}
            <button
              type="button"
              onClick={onDownloadTemplate}
              className="text-brand-400 hover:text-brand-300 underline underline-offset-2 font-medium transition-colors"
            >
              Download template CSV
            </button>
            {' '}with example rows and column headers.
          </p>
        </div>
      )}

      {/* Warning */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/15">
        <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300/80">
          All rows are validated before any data is saved. If any row has an error,
          you will see a full error report and <strong>nothing will be imported</strong> — no partial saves.
        </p>
      </div>
    </div>
  )
}

/* ── Step: Error Report ───────────────────────────────────────────────────── */
function ErrorStep({ errors }) {
  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/25">
        <AlertTriangle size={18} className="text-red-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-300">Validation failed</p>
          <p className="text-xs text-red-400/80 mt-0.5">
            {errors.length} error{errors.length !== 1 ? 's' : ''} found. Fix your CSV and re-upload.
            No data has been saved.
          </p>
        </div>
      </div>

      {/* Error table */}
      <div className="overflow-auto rounded-xl border border-white/10 max-h-[340px]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0">
            <tr className="bg-gray-800/90 backdrop-blur-sm border-b border-white/10">
              <th className="px-3 py-2.5 text-left font-semibold text-gray-400 w-14">Row</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-400 w-36">Field</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-400">Error</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((e, i) => (
              <tr
                key={i}
                className={`border-b border-white/5 ${i % 2 === 0 ? 'bg-white/2' : 'bg-transparent'}`}
              >
                <td className="px-3 py-2">
                  <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5
                                   rounded bg-red-500/15 border border-red-500/25 text-red-300 font-mono font-semibold">
                    {e.row}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-amber-300/90">{e.field}</span>
                </td>
                <td className="px-3 py-2 text-gray-300">{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Step: Success ────────────────────────────────────────────────────────── */
function SuccessStep({ result }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
        <CheckCircle2 size={32} className="text-emerald-400" />
      </div>
      <div>
        <p style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--c-body)' }}>Import successful!</p>
        <p style={{ fontSize: '0.9375rem', color: 'var(--c-muted)', marginTop: 4 }}>
          <span style={{ color: '#15803d', fontWeight: 600 }}>{result?.imported ?? 0}</span>{' '}
          record{(result?.imported ?? 0) !== 1 ? 's' : ''} imported and saved to the database.
        </p>
      </div>
    </div>
  )
}
