import { useState, useMemo } from 'react'
import { Search, ChevronUp, ChevronDown, Pencil, Trash2 } from 'lucide-react'

/**
 * Reusable data table with search, sort, loading skeleton, and empty state.
 *
 * Props:
 *   columns      – Array<{ key, label, render?, sortable?, className? }>
 *   data         – Array<object>
 *   keyField     – string (default 'id')
 *   loading      – boolean
 *   onEdit       – (row) => void
 *   onDelete     – (row) => void
 *   emptyTitle   – string
 *   emptyMessage – string
 *   onAdd        – () => void   (CTA in empty state)
 *   addLabel     – string
 *   searchKeys   – string[]     (fields to search across)
 */
export default function DataTable({
  columns = [],
  data = [],
  keyField = 'id',
  loading = false,
  onEdit,
  onDelete,
  emptyTitle = 'No records yet',
  emptyMessage = 'Create your first record to get started.',
  onAdd,
  addLabel = 'Add',
  searchKeys = [],
}) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  /* ── Search ── */
  const filtered = useMemo(() => {
    if (!query.trim()) return data
    const q = query.toLowerCase()
    return data.filter((row) =>
      searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(q))
    )
  }, [data, query, searchKeys])

  /* ── Sort ── */
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? '').toLowerCase()
      const bv = String(b[sortKey] ?? '').toLowerCase()
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [filtered, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  /* ── Skeleton rows ── */
  if (loading) {
    return (
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <div className="h-9 w-64 bg-white/5 rounded-xl animate-pulse" />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3 text-left">
                  <div className="h-3 w-20 bg-white/5 rounded animate-pulse" />
                </th>
              ))}
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i} className="border-b border-white/5">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    <div className="h-4 bg-white/5 rounded animate-pulse" style={{ width: `${60 + (i * 13) % 40}%` }} />
                  </td>
                ))}
                <td className="px-4 py-3">
                  <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Search bar */}
      {searchKeys.length > 0 && (
        <div className="p-4 border-b border-white/10">
          <div className="relative w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="
                w-full pl-8 pr-3 py-2 text-sm rounded-xl
                bg-white/5 border border-white/10 text-gray-200
                placeholder-gray-600 focus:outline-none focus:border-brand-500/50 focus:bg-white/8
                transition-colors
              "
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-gray-500 uppercase tracking-wider">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-medium ${col.sortable !== false ? 'cursor-pointer select-none hover:text-gray-300 transition-colors' : ''} ${col.className ?? ''}`}
                  onClick={() => col.sortable !== false && toggleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && sortKey === col.key && (
                      sortDir === 'asc'
                        ? <ChevronUp size={12} className="text-brand-400" />
                        : <ChevronDown size={12} className="text-brand-400" />
                    )}
                  </span>
                </th>
              ))}
              {(onEdit || onDelete) && <th className="px-4 py-3 w-24" />}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-16 text-center">
                  <p className="text-gray-400 font-medium mb-1">
                    {query ? 'No results found' : emptyTitle}
                  </p>
                  <p className="text-gray-600 text-xs mb-4">
                    {query ? `No records match "${query}"` : emptyMessage}
                  </p>
                  {!query && onAdd && (
                    <button
                      onClick={onAdd}
                      className="px-4 py-2 text-sm font-medium rounded-xl text-white bg-brand-600 hover:bg-brand-500 transition-colors"
                    >
                      {addLabel}
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={row[keyField]}
                  className="border-b border-white/5 hover:bg-white/3 transition-colors group"
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-gray-300 ${col.className ?? ''}`}>
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                  {(onEdit || onDelete) && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(row)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-300 hover:bg-brand-500/10 transition-colors"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(row)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      {sorted.length > 0 && (
        <div className="px-4 py-2.5 border-t border-white/10 text-xs text-gray-600">
          {sorted.length} {sorted.length === 1 ? 'record' : 'records'}
          {query && ` · filtered from ${data.length}`}
        </div>
      )}
    </div>
  )
}
