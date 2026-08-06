import { useEffect, useRef } from 'react'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useToast } from '../hooks/useToast'

const CONFIG = {
  success: {
    icon: CheckCircle,
    bar:  'bg-emerald-500',
    icon_cls: 'text-emerald-400',
    bg:   'bg-gray-900 border-emerald-500/30',
  },
  error: {
    icon: XCircle,
    bar:  'bg-red-500',
    icon_cls: 'text-red-400',
    bg:   'bg-gray-900 border-red-500/30',
  },
  info: {
    icon: Info,
    bar:  'bg-brand-500',
    icon_cls: 'text-brand-400',
    bg:   'bg-gray-900 border-brand-500/30',
  },
}

function ToastItem({ toast, onRemove }) {
  const cfg = CONFIG[toast.type] ?? CONFIG.info
  const Icon = cfg.icon

  return (
    <div
      className={`
        relative flex items-start gap-3 w-80 p-4 rounded-xl border shadow-2xl
        animate-fade-in overflow-hidden
        ${cfg.bg}
      `}
      role="alert"
    >
      {/* left colour bar */}
      <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${cfg.bar}`} />

      <Icon size={18} className={`shrink-0 mt-0.5 ${cfg.icon_cls}`} />

      <p className="flex-1 text-sm text-gray-200 leading-snug pr-2">{toast.message}</p>

      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onRemove={removeToast} />
        </div>
      ))}
    </div>
  )
}
