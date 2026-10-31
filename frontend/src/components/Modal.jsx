import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/**
 * Generic modal dialog.
 *
 * Props:
 *   open        – boolean
 *   onClose     – () => void
 *   title       – string
 *   children    – React node (form body)
 *   footer      – React node (overrides default footer)
 *   onSubmit    – () => void  (shown in default footer)
 *   submitLabel – string      (default "Save")
 *   loading     – boolean
 *   size        – 'sm' | 'md' | 'lg'  (default 'md')
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  onSubmit,
  submitLabel = 'Save',
  loading = false,
  size = 'md',
}) {
  const overlayRef = useRef(null)

  /* Close on Escape */
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  /* Lock body scroll */
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const sizeClass = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size] ?? 'max-w-lg'

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`modal-panel ${sizeClass} w-full`}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            onClick={onClose}
            className="modal-close-btn"
            aria-label="Close dialog"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {children}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {footer ?? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={loading}
                className="btn btn-primary"
              >
                {loading && (
                  <span
                    className="spinner"
                    style={{ width: '14px', height: '14px', borderWidth: '2px', borderColor: 'rgba(31,27,77,0.25)', borderTopColor: '#1F1B4D' }}
                    aria-hidden="true"
                  />
                )}
                {submitLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
