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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className={`
          relative w-full ${sizeClass} max-h-[90vh] flex flex-col
          bg-gray-900 border border-white/10 rounded-2xl shadow-2xl
          animate-fade-in overflow-hidden
        `}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-base font-semibold text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0">
          {footer ?? (
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium rounded-xl text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium rounded-xl text-white bg-brand-600 hover:bg-brand-500 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading && (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {submitLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
