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
      title="Confirm delete"
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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
            onClick={onConfirm}
            disabled={loading}
            className="btn"
            style={{
              background: '#dc2626',
              color: '#fff',
              border: '1px solid #dc2626',
              minHeight: '44px',
            }}
          >
            {loading && (
              <span
                className="spinner"
                style={{ width: '14px', height: '14px', borderWidth: '2px', borderColor: 'rgba(255,255,255,0.25)', borderTopColor: '#fff' }}
                aria-hidden="true"
              />
            )}
            Delete
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div
          style={{
            flexShrink: 0,
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AlertTriangle size={18} strokeWidth={1.75} style={{ color: '#dc2626' }} aria-hidden="true" />
        </div>
        <div>
          <p style={{ fontSize: '0.9375rem', color: 'var(--c-body)', lineHeight: 1.5 }}>
            Are you sure you want to delete{' '}
            <strong style={{ color: '#2E2A6B' }}>"{entityName}"</strong>?
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--c-muted)', marginTop: '4px', lineHeight: 1.5 }}>
            This {entityType} will be permanently removed. This action cannot be undone.
          </p>
        </div>
      </div>
    </Modal>
  )
}
