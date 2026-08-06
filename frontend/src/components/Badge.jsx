/**
 * Colored pill badge.
 *
 * Props:
 *   variant – 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'
 *   size    – 'sm' | 'md'
 */
const VARIANTS = {
  default: 'bg-gray-700/60 text-gray-300 border-gray-600/40',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  danger:  'bg-red-500/15 text-red-300 border-red-500/25',
  info:    'bg-sky-500/15 text-sky-300 border-sky-500/25',
  purple:  'bg-purple-500/15 text-purple-300 border-purple-500/25',
  brand:   'bg-brand-500/15 text-brand-300 border-brand-500/25',
}

const SIZES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
}

export default function Badge({ children, variant = 'default', size = 'sm' }) {
  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full border
        ${VARIANTS[variant] ?? VARIANTS.default}
        ${SIZES[size] ?? SIZES.sm}
      `}
    >
      {children}
    </span>
  )
}
