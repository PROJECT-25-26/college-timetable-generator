import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useToast } from '../hooks/useToast'

const CONFIG = {
  success: {
    icon: CheckCircle,
    iconColor: '#10b981',
    borderLeft: '3px solid #10b981',
  },
  error: {
    icon: XCircle,
    iconColor: '#dc2626',
    borderLeft: '3px solid #dc2626',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: '#FFB020',
    borderLeft: '3px solid #FFB020',
  },
  info: {
    icon: Info,
    iconColor: '#2E2A6B',
    borderLeft: '3px solid #2E2A6B',
  },
}

function ToastItem({ toast, onRemove }) {
  const cfg = CONFIG[toast.type] ?? CONFIG.info
  const Icon = cfg.icon

  return (
    <div
      className="toast animate-fade-in"
      style={{ borderLeft: cfg.borderLeft }}
      role="alert"
      aria-live="assertive"
    >
      <Icon size={17} strokeWidth={1.75} style={{ color: cfg.iconColor, flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
      <p style={{ flex: 1, fontSize: '0.9375rem', lineHeight: 1.5, paddingRight: '8px' }}>
        {toast.message}
      </p>
      <button
        onClick={() => onRemove(toast.id)}
        style={{
          flexShrink: 0,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--c-muted)',
          display: 'flex',
          alignItems: 'center',
          padding: '2px',
          borderRadius: '4px',
          transition: 'color 0.12s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--c-body)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--c-muted)'}
        aria-label="Dismiss notification"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div
      aria-live="polite"
      className="toast-container"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={removeToast} />
      ))}
    </div>
  )
}
