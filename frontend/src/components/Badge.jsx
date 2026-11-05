/**
 * Colored pill badge.
 *
 * Props:
 *   variant – 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'brand'
 *   size    – 'sm' | 'md'
 */
const VARIANTS = {
  default: 'badge-default',
  success: 'badge-success',
  warning: 'badge-warning',
  danger:  'badge-danger',
  info:    'badge-info',
  purple:  'badge-purple',
  brand:   'badge-primary',
}

export default function Badge({ children, variant = 'default', size = 'sm' }) {
  return (
    <span className={`badge ${VARIANTS[variant] ?? 'badge-default'}`}>
      {children}
    </span>
  )
}
