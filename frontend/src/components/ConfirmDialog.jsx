import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'

/**
 * Delete-confirmation dialog.
 *
 * Props:
 *   open        – boolean
 *   onClose     – () => void
 *   onConfirm   – () => void
 *   entityName  – string   e.g. "Computer Science"
 *   entityType  – string   e.g. "department"
 *   loading     – boolean
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  entityName,
  entityType = 'record',
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm Delete"
      size="sm"
      footer={
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
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-xl text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            Delete
          </button>
        </div>
      }
    >
      <div className="flex gap-4">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle size={18} className="text-red-400" />
        </div>
        <div>
          <p className="text-sm text-gray-300">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-gray-100">"{entityName}"</span>?
          </p>
          <p className="text-xs text-gray-500 mt-1">
            This {entityType} will be permanently removed. This action cannot be undone.
          </p>
        </div>
      </div>
    </Modal>
  )
}
