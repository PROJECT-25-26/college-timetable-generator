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

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="data-table-wrap">
        <div className="data-table-toolbar">
          <div className="skeleton" style={{ height: '36px', width: '240px' }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>
                    <div className="skeleton" style={{ height: '12px', width: '80px' }} />
                  </th>
                ))}
                <th style={{ width: '80px' }} />
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <div className="skeleton" style={{ height: '14px', width: `${55 + (i * 15) % 40}%` }} />
                    </td>
                  ))}
                  <td>
                    <div className="skeleton" style={{ height: '14px', width: '60px' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="data-table-wrap">
      {/* Search bar */}
      {searchKeys.length > 0 && (
        <div className="data-table-toolbar">
          <div className="data-table-search">
            <Search
              size={14}
              strokeWidth={2}
              className="data-table-search-icon"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="data-table-search-input"
              aria-label="Search records"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" role="table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${col.sortable !== false ? 'sortable' : ''} ${col.className ?? ''}`}
                  onClick={() => col.sortable !== false && toggleSort(col.key)}
                  aria-sort={
                    sortKey === col.key
                      ? sortDir === 'asc' ? 'ascending' : 'descending'
                      : undefined
                  }
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {col.label}
                    {col.sortable !== false && sortKey === col.key && (
                      sortDir === 'asc'
                        ? <ChevronUp size={12} aria-hidden="true" style={{ color: '#2E2A6B' }} />
                        : <ChevronDown size={12} aria-hidden="true" style={{ color: '#2E2A6B' }} />
                    )}
                  </span>
                </th>
              ))}
              {(onEdit || onDelete) && <th style={{ width: '80px' }} aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1}>
                  <div className="data-table-empty">
                    <p className="data-table-empty-title">
                      {query ? 'No results found' : emptyTitle}
                    </p>
                    <p className="data-table-empty-sub">
                      {query ? `No records match "${query}"` : emptyMessage}
                    </p>
                    {!query && onAdd && (
                      <button
                        onClick={onAdd}
                        className="btn btn-primary btn-sm"
                        style={{ marginTop: '4px' }}
                      >
                        {addLabel}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row[keyField]}>
                  {columns.map((col) => (
                    <td key={col.key} className={col.className ?? ''}>
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                  {(onEdit || onDelete) && (
                    <td>
                      <div className="data-table-actions">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(row)}
                            className="data-table-action-btn"
                            title="Edit"
                            aria-label={`Edit record`}
                          >
                            <Pencil size={13} strokeWidth={1.75} />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(row)}
                            className="data-table-action-btn danger"
                            title="Delete"
                            aria-label={`Delete record`}
                          >
                            <Trash2 size={13} strokeWidth={1.75} />
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
        <div className="data-table-footer">
          {sorted.length} {sorted.length === 1 ? 'record' : 'records'}
          {query && ` · filtered from ${data.length}`}
        </div>
      )}
    </div>
  )
}
