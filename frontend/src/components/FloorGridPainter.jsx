/**
 * FloorGridPainter — SVG-based floor plan paint tool.
 *
 * Features:
 *   • 7 tools: Wall | Corridor | Stairs/Lift | Entrance | Room | Staffroom | Eraser
 *   • SVG <rect> cells with SVG <defs> pattern overlays per cell type
 *   • Click-to-paint a single cell; click-drag to paint a run of cells
 *   • Pointer-capture drag (smooth, no stutter)
 *   • Hover ghost preview with tool colour
 *   • Vertical left tool palette with colour-coded icon pills
 *   • BFS blob detection — contiguous Room/Staffroom blobs trigger BlobLinkPanel
 *   • BlobLinkPanel — link blobs to existing Room/StaffRoom records
 *   • Pre-save walkability BFS — warns if any room blob has no path to corridor/entrance
 *   • SVG room-code abbreviation labels rendered inside linked cells (zoom ≥ 0.6)
 *   • Collapsible right settings panel (rows, cols, scale calibration)
 *   • Zoom in/out (buttons + Ctrl+Wheel)
 *   • Status bar: dimensions, scale, footprint, per-type counts, save state
 *   • Debounced auto-save (2 s after last stroke) + Ctrl+S
 *   • Keyboard shortcuts: W / C / S / E / R / T / X
 *
 * Props:
 *   floor   {object}   Floor record { id, grid_rows, grid_cols, cell_size_m, grid_data, room_links }
 *   onSaved {function} Called with updated floor after successful grid save
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  DoorOpen,
  Eraser,
  Footprints,
  Link,
  Link2Off,
  Loader2,
  Minus,
  Save,
  Settings2,
  Square,
  ArrowUpDown,
  Check,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Users,
  X,
} from 'lucide-react'
import { floorsApi, roomsApi, staffroomsApi } from '../api/index'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL_TYPES = {
  wall: {
    label:    'Wall',
    shortcut: 'W',
    icon:     Square,
    fill:     '#334155',
    accent:   '#64748b',
    pattern:  'wall-hatch',
    linkable: false,
  },
  corridor: {
    label:    'Corridor',
    shortcut: 'C',
    icon:     Footprints,
    fill:     '#1a2e05',
    accent:   '#a3e635',
    pattern:  'corridor-stripe',
    linkable: false,
  },
  stairs: {
    label:    'Stairs / Lift',
    shortcut: 'S',
    icon:     ArrowUpDown,
    fill:     '#292524',
    accent:   '#facc15',
    pattern:  'stairs-step',
    linkable: false,
  },
  entrance: {
    label:    'Entrance',
    shortcut: 'E',
    icon:     DoorOpen,
    fill:     '#082f49',
    accent:   '#38bdf8',
    pattern:  'entrance-arc',
    linkable: false,
  },
  room: {
    label:    'Room',
    shortcut: 'R',
    icon:     Building2,
    fill:     '#0c1a2e',
    accent:   '#3b82f6',
    pattern:  'room-fill',
    linkable: true,
  },
  staffroom: {
    label:    'Staffroom',
    shortcut: 'T',
    icon:     Users,
    fill:     '#1a0c2e',
    accent:   '#a855f7',
    pattern:  'staffroom-fill',
    linkable: true,
  },
  empty: {
    label:    'Empty',
    shortcut: 'X',
    icon:     Minus,
    fill:     null,
    accent:   '#6b7280',
    pattern:  null,
    linkable: false,
  },
}

const ERASER_TYPE    = 'empty'
const BASE_CELL_PX   = 24
const EMPTY_BG       = '#12141f'
const GRID_LINE      = 'rgba(255,255,255,0.055)'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function buildEmptyGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill('empty'))
}

function mergeGrid(emptyGrid, savedGrid) {
  if (!savedGrid) return emptyGrid
  return emptyGrid.map((row, r) =>
    row.map((_, c) => (savedGrid[r]?.[c] ?? 'empty'))
  )
}

function countCells(grid) {
  const counts = { wall: 0, corridor: 0, stairs: 0, entrance: 0, room: 0, staffroom: 0 }
  for (const row of grid)
    for (const cell of row)
      if (counts[cell] !== undefined) counts[cell]++
  return counts
}

// BFS flood-fill — returns array of {r,c} for contiguous cells of `type`
// starting from (sr, sc). Returns null if grid[sr][sc] !== type.
function floodFill(grid, sr, sc, type) {
  if (grid[sr]?.[sc] !== type) return null
  const rows = grid.length
  const cols = grid[0].length
  const visited = new Set()
  const queue   = [{ r: sr, c: sc }]
  const cells   = []
  visited.add(`${sr},${sc}`)
  while (queue.length) {
    const { r, c } = queue.shift()
    cells.push({ r, c })
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc
      const key = `${nr},${nc}`
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
          !visited.has(key) && grid[nr][nc] === type) {
        visited.add(key)
        queue.push({ r: nr, c: nc })
      }
    }
  }
  return cells
}

// Detect all blobs of linkable types in the grid
function detectAllBlobs(grid) {
  const rows    = grid.length
  const cols    = grid[0]?.length ?? 0
  const painted = new Set()
  const blobs   = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const type = grid[r][c]
      if (!CELL_TYPES[type]?.linkable) continue
      const key = `${r},${c}`
      if (painted.has(key)) continue
      const cells = floodFill(grid, r, c, type)
      if (!cells) continue
      cells.forEach(({ r: br, c: bc }) => painted.add(`${br},${bc}`))
      // Stable blob ID derived from top-left cell (deterministic across re-renders)
      const blobId = `blob-${type}-${cells[0].r}-${cells[0].c}`
      blobs.push({ blobId, type, cells })
    }
  }
  return blobs
}

// Walkability check — returns true if any blob cell is orthogonally adjacent
// to a corridor or entrance cell that is outside the blob itself.
function isWalkable(grid, blobCells) {
  const blobSet = new Set(blobCells.map(({ r, c }) => `${r},${c}`))
  for (const { r, c } of blobCells) {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc
      if (!blobSet.has(`${nr},${nc}`)) {
        const t = grid[nr]?.[nc]
        if (t === 'corridor' || t === 'entrance') return true
      }
    }
  }
  return false
}

function calcBoundingBox(cells) {
  if (!cells || !cells.length) return null
  let min_r = Infinity, max_r = -Infinity, min_c = Infinity, max_c = -Infinity
  for (const { r, c } of cells) {
    if (r < min_r) min_r = r
    if (r > max_r) max_r = r
    if (c < min_c) min_c = c
    if (c > max_c) max_c = c
  }
  return { min_r, min_c, max_r, max_c }
}

// Reconcile saved room_links list with a fresh connected-component blob list.
// Uses 4-way BFS flood-fill blobs, cell-overlap scoring, and enforces unique record_id links
// so that splitting or merging blobs does not corrupt links or assign duplicate room IDs.
function reconcileLinks(freshBlobs, savedLinks) {
  if (!freshBlobs || !freshBlobs.length) return []
  if (!savedLinks || !savedLinks.length) {
    return freshBlobs.map(b => ({
      ...b,
      record_id: null,
      record_name: null,
      record_code: null,
      bounding_box: calcBoundingBox(b.cells),
    }))
  }

  // Lookup map of saved links by exact blobId
  const savedById = new Map(savedLinks.map(l => [l.blobId, l]))

  // Map each coordinate (r,c) to its saved link record
  const cellToSaved = new Map()
  for (const saved of savedLinks) {
    if (saved.record_id && saved.cells) {
      for (const { r, c } of saved.cells) {
        cellToSaved.set(`${r},${c}`, saved)
      }
    }
  }

  const usedRecordIds = new Set()
  const result = []

  // Iterate fresh connected components and find best matching saved link by cell overlap
  for (const blob of freshBlobs) {
    const bbox = calcBoundingBox(blob.cells)
    const exactSaved = savedById.get(blob.blobId)

    // Check if exact blobId match still exists and isn't claimed
    if (exactSaved && exactSaved.record_id && !usedRecordIds.has(exactSaved.record_id)) {
      if (!exactSaved.type || exactSaved.type === blob.type) {
        usedRecordIds.add(exactSaved.record_id)
        result.push({
          ...blob,
          record_id:    exactSaved.record_id,
          record_name:  exactSaved.record_name,
          record_code:  exactSaved.record_code,
          bounding_box: bbox,
        })
        continue
      }
    }

    // Count cell overlap for each candidate saved link
    const overlapCounts = new Map()
    for (const cell of blob.cells) {
      const match = cellToSaved.get(`${cell.r},${cell.c}`)
      if (match && match.record_id && !usedRecordIds.has(match.record_id)) {
        if (!match.type || match.type === blob.type) {
          overlapCounts.set(match, (overlapCounts.get(match) || 0) + 1)
        }
      }
    }

    // Select the saved link with maximum overlapping cells
    let maxOverlap = 0
    let bestMatch = null
    for (const [saved, count] of overlapCounts.entries()) {
      if (count > maxOverlap) {
        maxOverlap = count
        bestMatch = saved
      }
    }

    if (bestMatch && bestMatch.record_id) {
      usedRecordIds.add(bestMatch.record_id)
      result.push({
        ...blob,
        record_id:    bestMatch.record_id,
        record_name:  bestMatch.record_name,
        record_code:  bestMatch.record_code,
        bounding_box: bbox,
      })
    } else {
      result.push({
        ...blob,
        record_id:    null,
        record_name:  null,
        record_code:  null,
        bounding_box: bbox,
      })
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// SVG <defs> patterns
// ---------------------------------------------------------------------------

function SvgDefs({ cellPx }) {
  const s = cellPx
  const h = s / 2

  return (
    <defs>
      {/* Wall — diagonal hatching */}
      <pattern id="wall-hatch" patternUnits="userSpaceOnUse" width="8" height="8">
        <line x1="0" y1="8" x2="8" y2="0" stroke="#475569" strokeWidth="1.2" strokeOpacity="0.55" />
      </pattern>

      {/* Corridor — subtle lime horizontal stripes */}
      <pattern id="corridor-stripe" patternUnits="userSpaceOnUse" width={s} height="6">
        <rect width={s} height="6" fill="transparent" />
        <rect width={s} height="1.5" y="4" fill="#65a30d" fillOpacity="0.45" />
      </pattern>

      {/* Stairs — step chevrons */}
      <pattern id="stairs-step" patternUnits="userSpaceOnUse" width="10" height="10">
        <path d="M0 5 L5 0 L10 5" fill="none" stroke="#d97706" strokeWidth="1" strokeOpacity="0.5" />
      </pattern>

      {/* Entrance — arc (door sweep) */}
      <pattern id="entrance-arc" patternUnits="userSpaceOnUse" width={s} height={s}>
        <path
          d={`M${h * 0.4} ${s - 4} A${h * 0.8} ${h * 0.8} 0 0 1 ${s - h * 0.4 + 2} ${s - 4}`}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth="1.5"
          strokeOpacity="0.55"
        />
      </pattern>

      {/* Room — blue cross-hatch */}
      <pattern id="room-fill" patternUnits="userSpaceOnUse" width="10" height="10">
        <line x1="0" y1="0" x2="10" y2="10" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.3" />
        <line x1="10" y1="0" x2="0" y2="10" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.3" />
      </pattern>

      {/* Staffroom — purple dots */}
      <pattern id="staffroom-fill" patternUnits="userSpaceOnUse" width="8" height="8">
        <circle cx="4" cy="4" r="1.2" fill="#a855f7" fillOpacity="0.45" />
      </pattern>

      {/* Hover ghost glow */}
      <filter id="ghost-glow">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
}

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------

function SettingsPanel({ floor, onApply, onClose }) {
  const [rows,  setRows]  = useState(floor.grid_rows)
  const [cols,  setCols]  = useState(floor.grid_cols)
  const [scale, setScale] = useState(floor.cell_size_m)

  const footprintW = (Number(cols) * Number(scale)).toFixed(1)
  const footprintH = (Number(rows) * Number(scale)).toFixed(1)

  const handleApply = () => {
    const r = Math.min(200, Math.max(5, Number(rows)))
    const c = Math.min(200, Math.max(5, Number(cols)))
    const s = Math.min(100, Math.max(0.1, Number(scale)))
    onApply({ grid_rows: r, grid_cols: c, cell_size_m: s })
  }

  return (
    <div className="fgp-settings-panel animate-slide-in">
      <div className="fgp-settings-header">
        <Settings2 size={13} className="text-indigo-400" />
        <span>Floor Settings</span>
        <button onClick={onClose} className="ml-auto p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="fgp-settings-body">
        <div className="fgp-settings-section">
          <span className="fgp-settings-label">Grid Dimensions</span>
          <div className="fgp-settings-row">
            <label className="fgp-settings-field-label">Rows</label>
            <input type="number" min="5" max="200" className="fgp-settings-input" value={rows} onChange={e => setRows(e.target.value)} />
          </div>
          <div className="fgp-settings-row">
            <label className="fgp-settings-field-label">Columns</label>
            <input type="number" min="5" max="200" className="fgp-settings-input" value={cols} onChange={e => setCols(e.target.value)} />
          </div>
        </div>

        <div className="fgp-settings-section">
          <span className="fgp-settings-label">Scale Calibration</span>
          <div className="fgp-settings-row">
            <label className="fgp-settings-field-label">1 cell =</label>
            <input type="number" min="0.1" max="100" step="0.1" className="fgp-settings-input" value={scale} onChange={e => setScale(e.target.value)} />
            <span className="text-[10px] text-gray-500 ml-1">m</span>
          </div>
        </div>

        <div className="fgp-settings-section">
          <span className="fgp-settings-label">Footprint Preview</span>
          <div className="fgp-footprint-preview">
            <span className="fgp-footprint-value">{footprintW} m</span>
            <span className="fgp-footprint-x">×</span>
            <span className="fgp-footprint-value">{footprintH} m</span>
          </div>
          <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">
            {Number(cols)} cols × {Number(rows)} rows
          </p>
        </div>

        <button onClick={handleApply} className="fgp-apply-btn" id="fgp-apply-settings">
          <Check size={12} />
          Apply Changes
        </button>
        <p className="text-[9px] text-gray-600 mt-1.5 leading-relaxed text-center">
          Existing cells outside the new bounds will be clipped.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Blob Link Panel
// ---------------------------------------------------------------------------

function BlobLinkPanel({ blobs, onLink, onUnlink, onDismiss, activeBlobId, onSelectBlob }) {
  const [rooms,      setRooms]      = useState([])
  const [staffrooms, setStaffrooms] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      roomsApi.list().catch(() => ({ data: [] })),
      staffroomsApi.list().catch(() => ({ data: [] })),
    ])
      .then(([r, s]) => {
        if (cancelled) return
        const rList = Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : [])
        const sList = Array.isArray(s?.data) ? s.data : (Array.isArray(s) ? s : [])
        setRooms(rList)
        setStaffrooms(sList)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const activeBlob = blobs.find(b => b.blobId === activeBlobId) ?? blobs[0]
  const isRoomBlob = activeBlob?.type === 'room'
  const rawList    = isRoomBlob ? rooms : staffrooms

  // Options for all records from the database
  const allRecordOptions = rawList.map(item => {
    const id    = item.id
    const name  = item.name ?? item.label ?? 'Unnamed'
    const code  = item.code ?? item.department_code ?? (item.label ? item.label.slice(0, 6).toUpperCase() : 'STAFF')
    const deptInfo = item.department_name
      ? ` [Dept: ${item.department_name}]`
      : (item.department_code ? ` [Dept: ${item.department_code}]` : '')

    const found = blobs.find(b => b.record_id === id)
    const isLinkedToOther = found && found.blobId !== activeBlob?.blobId
    const isCurrentLink   = found && found.blobId === activeBlob?.blobId

    let label = isRoomBlob ? `${name} (${code})` : `${name}${deptInfo}`
    if (isCurrentLink) label += ' ✓ [Linked to this blob]'
    else if (isLinkedToOther) label += ' — [Linked to another blob]'

    return { id, name, code, label, isLinkedToOther, isCurrentLink }
  })

  const filteredOptions = allRecordOptions.filter(o =>
    !searchTerm ||
    o.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleLink = () => {
    if (!selected || !activeBlob) return
    const rec = allRecordOptions.find(o => o.id === selected)
    if (!rec) return
    onLink(activeBlob.blobId, selected, rec.name, rec.code)
    setSelected('')
    setSearchTerm('')
  }

  const handleUnlink = () => {
    if (!activeBlob) return
    onUnlink(activeBlob.blobId)
    setSelected('')
  }

  if (!blobs.length) {
    return (
      <div className="fgp-blob-panel">
        <div className="fgp-blob-panel-header">
          <Link size={12} className="text-indigo-400" />
          <span>Link Rooms</span>
          <button
            onClick={onDismiss}
            className="ml-auto p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
            title="Close link panel"
          >
            <X size={13} />
          </button>
        </div>
        <div className="fgp-blob-panel-body justify-center items-center text-center p-5 space-y-3">
          <Building2 size={28} className="mx-auto text-indigo-400 opacity-60" />
          <div>
            <h4 className="text-xs font-semibold text-gray-200">No Room Blobs Painted Yet</h4>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
              Use the <strong className="text-indigo-300 font-semibold">Room [R]</strong> or <strong className="text-purple-300 font-semibold">Staffroom [T]</strong> tool from the left palette to paint cells on the grid.
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-300 text-left leading-relaxed">
            💡 <strong>How linking works:</strong> Once you paint a contiguous block of cells, this panel opens automatically to link that room to an existing Room or StaffRoom record from the database.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fgp-blob-panel">
      <div className="fgp-blob-panel-header">
        <Link size={12} className="text-indigo-400" />
        <span>Link Rooms</span>
        <button
          onClick={onDismiss}
          className="ml-auto p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
          title="Close link panel"
        >
          <X size={13} />
        </button>
      </div>

      <div className="fgp-blob-panel-body">
        {/* Blob selector list */}
        {blobs.length > 1 && (
          <div>
            <p className="fgp-settings-label mb-1.5">Blobs ({blobs.length})</p>
            <div className="flex flex-col gap-1">
              {blobs.map(b => (
                <button
                  key={b.blobId}
                  className={`fgp-blob-list-item ${activeBlobId === b.blobId ? 'active' : ''}`}
                  onClick={() => onSelectBlob(b.blobId)}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ background: CELL_TYPES[b.type].accent }}
                  />
                  <span className="truncate">{b.type} · {b.cells.length} cells</span>
                  {b.record_id && <Check size={9} className="ml-auto text-green-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
            <div className="fgp-blob-divider mt-2" />
          </div>
        )}

        {activeBlob && (
          <>
            {/* Blob info */}
            <div>
              <span className={`fgp-blob-type-badge ${activeBlob.type}`}>
                {activeBlob.type === 'room'
                  ? <Building2 size={9} />
                  : <Users size={9} />}
                {CELL_TYPES[activeBlob.type].label}
              </span>
              <p className="fgp-blob-stat mt-1.5">
                {activeBlob.cells.length} cell{activeBlob.cells.length !== 1 ? 's' : ''} · top-left: row {activeBlob.cells[0].r + 1}, col {activeBlob.cells[0].c + 1}
              </p>
            </div>

            {/* Currently linked chip */}
            {activeBlob.record_id && (
              <div className="mb-2">
                <p className="fgp-settings-label mb-1">Currently Linked</p>
                <div className="fgp-blob-linked-chip">
                  <Check size={10} className="flex-shrink-0" />
                  <span className="truncate">{activeBlob.record_name ?? activeBlob.record_id}</span>
                </div>
                <button className="fgp-blob-unlink-btn mt-2" onClick={handleUnlink}>
                  <Link2Off size={10} className="inline mr-1" />
                  Unlink
                </button>
              </div>
            )}

            {/* Select dropdown section */}
            <div>
              <p className="fgp-settings-label mb-1">
                {activeBlob.record_id ? 'Change Room Link' : `Link to ${isRoomBlob ? 'Room' : 'StaffRoom'}`}
              </p>

              {loading ? (
                <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
                  <Loader2 size={12} className="animate-spin" /> Loading records…
                </div>
              ) : rawList.length === 0 ? (
                <div className="p-3 rounded-lg bg-gray-800/60 border border-white/5 space-y-1.5 text-[11px] text-gray-400 leading-relaxed">
                  <p>No {isRoomBlob ? 'Room' : 'StaffRoom'} records found in the database.</p>
                  <p className="text-[10px] text-indigo-300">
                    Add {isRoomBlob ? 'rooms first under the Rooms tab' : 'departments first under the Departments tab'} in the sidebar.
                  </p>
                </div>
              ) : (
                <>
                  {rawList.length > 3 && (
                    <input
                      type="text"
                      placeholder="Search records…"
                      className="fgp-blob-select mb-1.5 text-xs"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  )}
                  <select
                    className="fgp-blob-select mb-2"
                    value={selected}
                    onChange={e => setSelected(e.target.value)}
                  >
                    <option value="">— Select {isRoomBlob ? 'Room' : 'StaffRoom'} Record —</option>
                    {filteredOptions.map(o => (
                      <option key={o.id} value={o.id} disabled={o.isLinkedToOther}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="fgp-blob-link-btn"
                    onClick={handleLink}
                    disabled={!selected}
                  >
                    <Link size={10} className="inline mr-1" />
                    {activeBlob.record_id ? 'Update Link' : 'Link Blob'}
                  </button>
                </>
              )}
            </div>

            <button className="fgp-blob-dismiss-btn mt-2" onClick={onDismiss}>
              Close panel
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function FloorGridPainter({ floor, onSaved }) {
  const svgRef    = useRef(null)
  const saveTimer = useRef(null)

  const [activeTool,   setActiveTool]   = useState('wall')
  const [grid,         setGrid]         = useState(() =>
    mergeGrid(buildEmptyGrid(floor.grid_rows, floor.grid_cols), floor.grid_data)
  )
  const [zoom,         setZoom]         = useState(1)
  const [hover,        setHover]        = useState(null)
  const [isPainting,   setIsPainting]   = useState(false)
  const [paintTool,    setPaintTool]    = useState('wall')
  const [saveStatus,   setSaveStatus]   = useState('idle')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Blob link state
  const [blobLinks,      setBlobLinks]      = useState(() => reconcileLinks(
    detectAllBlobs(mergeGrid(buildEmptyGrid(floor.grid_rows, floor.grid_cols), floor.grid_data)),
    floor.room_links ?? []
  ))
  const [blobPanelOpen,  setBlobPanelOpen]  = useState(false)
  const [activeBlobId,   setActiveBlobId]   = useState(null)

  // Walkability warnings
  const [walkWarnings, setWalkWarnings] = useState([])

  // Floor dimensions
  const [gridRows,  setGridRows]  = useState(floor.grid_rows)
  const [gridCols,  setGridCols]  = useState(floor.grid_cols)
  const [cellSizeM, setCellSizeM] = useState(floor.cell_size_m)

  // Always-fresh refs
  const gridRef        = useRef(grid)
  const blobLinksRef   = useRef(blobLinks)
  const paintToolRef   = useRef('wall')
  const lastPaintedRef = useRef(null)

  useEffect(() => { gridRef.current = grid },           [grid])
  useEffect(() => { blobLinksRef.current = blobLinks }, [blobLinks])

  const cellPx = Math.round(BASE_CELL_PX * zoom)

  // ── Reset when floor changes ─────────────────────────────────────────────
  useEffect(() => {
    const fresh = mergeGrid(buildEmptyGrid(floor.grid_rows, floor.grid_cols), floor.grid_data)
    setGrid(fresh)
    gridRef.current = fresh
    setGridRows(floor.grid_rows)
    setGridCols(floor.grid_cols)
    setCellSizeM(floor.cell_size_m)
    setSaveStatus('idle')
    setWalkWarnings([])

    const freshBlobs = detectAllBlobs(fresh)
    const linked     = reconcileLinks(freshBlobs, floor.room_links ?? [])
    setBlobLinks(linked)
    blobLinksRef.current = linked
    setBlobPanelOpen(false)
    setActiveBlobId(null)
  }, [floor.id, floor.grid_rows, floor.grid_cols, floor.cell_size_m])

  // ── Blob detection (runs after every paint stroke completion) ────────────
  const refreshBlobs = useCallback((newGrid) => {
    const freshBlobs = detectAllBlobs(newGrid)
    setBlobLinks(prev => {
      const reconciled = reconcileLinks(freshBlobs, prev)
      blobLinksRef.current = reconciled
      return reconciled
    })
  }, [])

  // ── Walkability validation ────────────────────────────────────────────────
  const runWalkabilityCheck = useCallback((currentGrid, currentLinks) => {
    const warnings = []
    for (const blob of currentLinks) {
      if (!blob.record_id) continue   // unlinked blobs skipped
      if (!isWalkable(currentGrid, blob.cells)) {
        warnings.push({
          blobId:  blob.blobId,
          type:    blob.type,
          name:    blob.record_name ?? blob.record_id,
          cells:   blob.cells.length,
        })
      }
    }
    setWalkWarnings(warnings)
    return warnings
  }, [])

  // ── Save helpers ─────────────────────────────────────────────────────────
  const doSave = useCallback(async (gridToSave, linksToSave) => {
    // Run walkability check before saving
    runWalkabilityCheck(gridToSave, linksToSave)

    setSaveStatus('saving')
    try {
      const res = await floorsApi.saveGrid(floor.id, gridToSave, linksToSave)
      setSaveStatus('saved')
      onSaved?.(res.data)
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [floor.id, onSaved, runWalkabilityCheck])

  const autoSave = useCallback(() => {
    doSave(gridRef.current, blobLinksRef.current)
  }, [doSave])

  const handleSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    doSave(gridRef.current, blobLinksRef.current)
  }, [doSave])

  // ── Settings — apply resize ──────────────────────────────────────────────
  const handleApplySettings = useCallback(async ({ grid_rows, grid_cols, cell_size_m }) => {
    try {
      await floorsApi.update(floor.id, { grid_rows, grid_cols, cell_size_m, name: floor.name, level: floor.level })
    } catch { /* non-fatal */ }

    const fresh = mergeGrid(buildEmptyGrid(grid_rows, grid_cols), gridRef.current)
    setGrid(fresh)
    gridRef.current = fresh
    setGridRows(grid_rows)
    setGridCols(grid_cols)
    setCellSizeM(cell_size_m)
    setSaveStatus('idle')
    clearTimeout(saveTimer.current)

    const freshBlobs = detectAllBlobs(fresh)
    const linked     = reconcileLinks(freshBlobs, blobLinksRef.current)
    setBlobLinks(linked)
    blobLinksRef.current = linked

    saveTimer.current = setTimeout(autoSave, 2000)
  }, [floor.id, floor.name, floor.level, autoSave])

  // ── Blob linking actions ─────────────────────────────────────────────────
  const handleLinkBlob = useCallback((blobId, recordId, recordName, recordCode) => {
    setBlobLinks(prev => {
      const next = prev.map(b => {
        if (b.blobId !== blobId) return b
        const min_r = Math.min(...b.cells.map(c => c.r))
        const max_r = Math.max(...b.cells.map(c => c.r))
        const min_c = Math.min(...b.cells.map(c => c.c))
        const max_c = Math.max(...b.cells.map(c => c.c))
        return {
          ...b,
          record_id:    recordId,
          record_name:  recordName,
          record_code:  recordCode,
          bounding_box: { min_r, min_c, max_r, max_c },
          floor_id:     floor.id,
          building_id:  floor.building_id,
        }
      })
      blobLinksRef.current = next
      return next
    })
    // Trigger debounced save
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(autoSave, 1500)
  }, [floor.id, floor.building_id, autoSave])

  const handleUnlinkBlob = useCallback((blobId) => {
    setBlobLinks(prev => {
      const next = prev.map(b => b.blobId === blobId
        ? { ...b, record_id: null, record_name: null, record_code: null }
        : b
      )
      blobLinksRef.current = next
      return next
    })
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(autoSave, 1500)
  }, [autoSave])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      const key = e.key.toUpperCase()
      for (const [type, def] of Object.entries(CELL_TYPES)) {
        if (def.shortcut === key) { setActiveTool(type); return }
      }
      if ((e.ctrlKey || e.metaKey) && key === 'S') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  // ── Ctrl+Wheel zoom ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = svgRef.current?.parentElement
    if (!el) return
    const handler = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(z => {
        const delta = e.deltaY < 0 ? 0.15 : -0.15
        return Math.min(4, Math.max(0.25, +(z + delta).toFixed(2)))
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ── Paint a cell ─────────────────────────────────────────────────────────
  const paint = useCallback((r, c, tool) => {
    setGrid(prev => {
      if (prev[r]?.[c] === tool) return prev
      const next = prev.map(row => [...row])
      next[r][c] = tool
      gridRef.current = next
      return next
    })
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(autoSave, 2000)
  }, [autoSave])

  // ── Coord conversion ─────────────────────────────────────────────────────
  const toCell = useCallback((e) => {
    const svg  = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const c = Math.floor((e.clientX - rect.left) / cellPx)
    const r = Math.floor((e.clientY - rect.top)  / cellPx)
    if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return null
    return { r, c }
  }, [cellPx, gridRows, gridCols])

  // ── Pointer handlers ─────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    const cell = toCell(e)
    if (!cell) return
    const tool = e.button === 2 ? ERASER_TYPE : activeTool
    paintToolRef.current   = tool
    lastPaintedRef.current = cell
    setPaintTool(tool)
    setIsPainting(true)
    paint(cell.r, cell.c, tool)
    svgRef.current?.setPointerCapture(e.pointerId)
  }, [toCell, activeTool, paint])

  const handlePointerMove = useCallback((e) => {
    const cell = toCell(e)
    setHover(cell)
    if (!isPainting || !cell) return
    lastPaintedRef.current = cell
    paint(cell.r, cell.c, paintToolRef.current)
  }, [toCell, isPainting, paint])

  const handlePointerUp = useCallback(() => {
    setIsPainting(false)
    const toolUsed = paintToolRef.current
    const lastCell = lastPaintedRef.current
    const currentGrid = gridRef.current

    const freshBlobs  = detectAllBlobs(currentGrid)
    const reconciled = reconcileLinks(freshBlobs, blobLinksRef.current)
    setBlobLinks(reconciled)
    blobLinksRef.current = reconciled

    const isLinkableTool = CELL_TYPES[toolUsed]?.linkable

    if (freshBlobs.length > 0) {
      // Find the blob that contains lastCell (if any)
      let targetBlob = null
      if (lastCell) {
        targetBlob = reconciled.find(b => b.cells.some(c => c.r === lastCell.r && c.c === lastCell.c))
      }

      if (isLinkableTool || targetBlob) {
        if (!targetBlob) {
          targetBlob = reconciled.find(b => !b.record_id) || reconciled[0]
        }
        if (targetBlob) {
          setActiveBlobId(targetBlob.blobId)
          setBlobPanelOpen(true)
        }
      }
    }
  }, [])

  const handlePointerLeave = useCallback(() => {
    setHover(null)
    setIsPainting(false)
  }, [])

  const handleContextMenu = (e) => e.preventDefault()

  // ── Zoom helpers ─────────────────────────────────────────────────────────
  const zoomIn    = () => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))
  const zoomOut   = () => setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)))
  const zoomReset = () => setZoom(1)

  // ── Stats ────────────────────────────────────────────────────────────────
  const counts = countCells(grid)
  const footW  = (gridCols * cellSizeM).toFixed(1)
  const footH  = (gridRows * cellSizeM).toFixed(1)
  const svgW   = gridCols * cellPx
  const svgH   = gridRows * cellPx

  const activeDef = CELL_TYPES[activeTool]

  // Build a cell→blobLink lookup map for label rendering
  const cellLinkMap = new Map()
  for (const blob of blobLinks) {
    if (blob.record_code) {
      for (const { r, c } of blob.cells) {
        cellLinkMap.set(`${r},${c}`, {
          code:    blob.record_code.slice(0, 5),
          accent:  CELL_TYPES[blob.type].accent,
          blobId:  blob.blobId,
        })
      }
    }
  }

  const linkedBlobCount   = blobLinks.filter(b => b.record_id).length
  const unlinkedBlobCount = blobLinks.filter(b => !b.record_id).length

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fgp-root">

      {/* ── Left: vertical tool palette ─────────────────────── */}
      <div className="fgp-palette">
        <span className="fgp-palette-label">Tools</span>

        {Object.entries(CELL_TYPES).filter(([t]) => t !== 'empty').map(([type, def]) => {
          const Icon     = def.icon
          const isActive = activeTool === type
          return (
            <button
              key={type}
              id={`fgp-tool-${type}`}
              className={`fgp-tool-pill ${isActive ? 'active' : ''}`}
              style={isActive ? {
                borderColor: def.accent,
                color:       def.accent,
                boxShadow:   `0 0 10px ${def.accent}40, inset 0 0 8px ${def.accent}18`,
              } : {}}
              onClick={() => setActiveTool(type)}
              title={`${def.label}  [${def.shortcut}]`}
            >
              <span
                className="fgp-tool-swatch"
                style={{ background: def.fill || '#374151', borderColor: def.accent + '60' }}
              />
              <Icon size={13} />
              <span className="fgp-tool-name">{def.label}</span>
              <span className="fgp-tool-shortcut">{def.shortcut}</span>
            </button>
          )
        })}

        <div className="fgp-palette-divider" />

        <button
          id="fgp-tool-eraser"
          className={`fgp-tool-pill eraser ${activeTool === 'empty' ? 'active' : ''}`}
          style={activeTool === 'empty' ? {
            borderColor: '#9ca3af',
            color:       '#d1d5db',
            boxShadow:   '0 0 8px rgba(156,163,175,0.3)',
          } : {}}
          onClick={() => setActiveTool('empty')}
          title="Eraser  [X]  or  Right-click"
        >
          <Eraser size={13} />
          <span className="fgp-tool-name">Eraser</span>
          <span className="fgp-tool-shortcut">X</span>
        </button>

        <div className="fgp-palette-divider" />
        <button
          className="fgp-tool-pill"
          style={blobPanelOpen ? { borderColor: '#6366f1', color: '#a5b4fc' } : {}}
          onClick={() => setBlobPanelOpen(o => !o)}
          title="Open room linking panel"
        >
          <Link size={13} />
          <span className="fgp-tool-name">Links</span>
          <span className="text-[9px] mt-0.5" style={{ color: unlinkedBlobCount > 0 ? '#facc15' : blobLinks.length > 0 ? '#4ade80' : '#9ca3af' }}>
            {blobLinks.length > 0 ? `${linkedBlobCount}/${blobLinks.length}` : '0'}
          </span>
        </button>
      </div>

      {/* ── Centre: SVG canvas + toolbar ────────────────────── */}
      <div className="fgp-centre">

        {/* Toolbar */}
        <div className="fgp-toolbar">
          <div className="fgp-active-tool-badge" style={{ borderColor: activeDef.accent + '60', color: activeDef.accent }}>
            <activeDef.icon size={11} />
            <span>{activeDef.label}</span>
          </div>

          <div className="fgp-toolbar-sep" />

          <button id="fgp-zoom-out"   onClick={zoomOut}   className="fgp-icon-btn" title="Zoom out"><ZoomOut  size={13} /></button>
          <span className="fgp-zoom-label">{Math.round(zoom * 100)}%</span>
          <button id="fgp-zoom-in"    onClick={zoomIn}    className="fgp-icon-btn" title="Zoom in"><ZoomIn   size={13} /></button>
          <button id="fgp-zoom-reset" onClick={zoomReset} className="fgp-icon-btn" title="Reset zoom"><RefreshCw size={11} /></button>

          <div className="flex-1" />

          {/* Blob panel toggle — ALWAYS VISIBLE */}
          <button
            id="fgp-blob-panel-toggle"
            className={`fgp-icon-btn ${blobPanelOpen ? 'text-indigo-400' : ''}`}
            onClick={() => setBlobPanelOpen(o => !o)}
            title="Room link panel"
          >
            <Link size={13} />
            <span className="text-xs ml-1 font-medium">
              Links {blobLinks.length > 0 ? `(${linkedBlobCount}/${blobLinks.length})` : '(0)'}
            </span>
            {unlinkedBlobCount > 0 && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
            )}
          </button>

          <div className="fgp-toolbar-sep" />

          <button
            id="fgp-settings-toggle"
            className={`fgp-icon-btn ${settingsOpen ? 'text-indigo-400' : ''}`}
            onClick={() => setSettingsOpen(o => !o)}
            title="Floor settings"
          >
            <Settings2 size={13} />
            <span className="text-xs ml-1">Settings</span>
          </button>

          <div className="fgp-toolbar-sep" />

          <button
            id="fgp-save-btn"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={['fgp-save-btn', saveStatus === 'saved' ? 'saved' : '', saveStatus === 'error' ? 'error' : '', saveStatus === 'saving' ? 'saving' : ''].join(' ')}
          >
            {saveStatus === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save'}
          </button>
        </div>

        {/* Walkability warning bar */}
        {walkWarnings.length > 0 && (
          <div className="fgp-warning-bar">
            <AlertTriangle size={13} className="fgp-warning-bar-icon flex-shrink-0" />
            <span>
              <strong>{walkWarnings.length} room{walkWarnings.length !== 1 ? 's' : ''}</strong> ha{walkWarnings.length !== 1 ? 've' : 's'} no walkable path to a corridor or entrance:&nbsp;
              {walkWarnings.map(w => w.name).join(', ')}
            </span>
            <button
              className="fgp-warning-bar-dismiss"
              onClick={() => setWalkWarnings([])}
              title="Dismiss warnings"
            >
              <X size={11} />
            </button>
          </div>
        )}

        {/* SVG grid canvas */}
        <div className="fgp-svg-wrap">
          <svg
            ref={svgRef}
            id="floor-grid-svg"
            width={svgW}
            height={svgH}
            style={{
              cursor:       'crosshair',
              display:      'block',
              userSelect:   'none',
              touchAction:  'none',
              borderRadius: '4px',
              boxShadow:    '0 0 0 1px rgba(255,255,255,0.06)',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onContextMenu={handleContextMenu}
          >
            <SvgDefs cellPx={cellPx} />

            {/* Background */}
            <rect width={svgW} height={svgH} fill={EMPTY_BG} />

            {/* Cells */}
            {grid.map((row, r) =>
              row.map((type, c) => {
                if (type === 'empty') return null
                const def    = CELL_TYPES[type]
                if (!def) return null
                const x      = c * cellPx
                const y      = r * cellPx
                const inset  = 0.5
                const link   = cellLinkMap.get(`${r},${c}`)

                return (
                  <g key={`${r}-${c}`}>
                    {/* Base fill */}
                    <rect
                      x={x + inset} y={y + inset}
                      width={cellPx - inset * 2}
                      height={cellPx - inset * 2}
                      fill={def.fill}
                    />
                    {/* Pattern overlay */}
                    {def.pattern && (
                      <rect
                        x={x + inset} y={y + inset}
                        width={cellPx - inset * 2}
                        height={cellPx - inset * 2}
                        fill={`url(#${def.pattern})`}
                      />
                    )}
                    {/* Accent border */}
                    <rect
                      x={x + inset} y={y + inset}
                      width={cellPx - inset * 2}
                      height={cellPx - inset * 2}
                      fill="none"
                      stroke={link ? def.accent : def.accent}
                      strokeWidth={link ? '1' : '0.6'}
                      strokeOpacity={link ? '0.65' : '0.4'}
                    />
                    {/* Room-code label (shown when zoomed in enough + linked) */}
                    {link && cellPx >= 12 && (
                      <text
                        x={x + cellPx / 2}
                        y={y + cellPx / 2 + (cellPx >= 18 ? 3.5 : 2.5)}
                        textAnchor="middle"
                        fontSize={Math.max(7, Math.min(cellPx * 0.36, 11))}
                        fontFamily="system-ui, -apple-system, sans-serif"
                        fontWeight="800"
                        fill="#ffffff"
                        stroke="rgba(0,0,0,0.6)"
                        strokeWidth="0.6"
                        paintOrder="stroke fill"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {link.code}
                      </text>
                    )}
                  </g>
                )
              })
            )}

            {/* Hover ghost */}
            {hover && (() => {
              const def   = CELL_TYPES[activeTool]
              const x     = hover.c * cellPx
              const y     = hover.r * cellPx
              const inset = 0.5
              return (
                <rect
                  x={x + inset} y={y + inset}
                  width={cellPx - inset * 2}
                  height={cellPx - inset * 2}
                  fill={def.fill || 'rgba(255,255,255,0.04)'}
                  fillOpacity={0.45}
                  stroke={def.accent}
                  strokeWidth="1.5"
                  strokeOpacity="0.75"
                  rx="1"
                />
              )
            })()}

            {/* Grid lines */}
            {Array.from({ length: gridRows + 1 }, (_, r) => (
              <line key={`h${r}`} x1={0} y1={r * cellPx} x2={svgW} y2={r * cellPx}
                stroke={GRID_LINE} strokeWidth="1" />
            ))}
            {Array.from({ length: gridCols + 1 }, (_, c) => (
              <line key={`v${c}`} x1={c * cellPx} y1={0} x2={c * cellPx} y2={svgH}
                stroke={GRID_LINE} strokeWidth="1" />
            ))}
          </svg>
        </div>

        {/* Status bar */}
        <div className="fgp-status-bar">
          <span>
            <span className="fgp-stat-label">Grid</span>
            <span className="fgp-stat-val">{gridCols} × {gridRows}</span>
          </span>
          <span>
            <span className="fgp-stat-label">Scale</span>
            <span className="fgp-stat-val">1 cell = {cellSizeM}m</span>
          </span>
          <span>
            <span className="fgp-stat-label">Footprint</span>
            <span className="fgp-stat-val">{footW}m × {footH}m</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="fgp-stat-label">Cells</span>
            {Object.entries(counts).filter(([, n]) => n > 0).map(([type, count]) => (
              <span key={type} className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm"
                  style={{ background: CELL_TYPES[type].accent }} />
                <span className="fgp-stat-label">{CELL_TYPES[type].label}:</span>
                <span className="fgp-stat-val">{count}</span>
              </span>
            ))}
          </span>
          {blobLinks.length > 0 && (
            <span>
              <span className="fgp-stat-label">Blobs</span>
              <span className="fgp-stat-val" style={{ color: unlinkedBlobCount > 0 ? '#facc15' : '#4ade80' }}>
                {linkedBlobCount}/{blobLinks.length} linked
              </span>
            </span>
          )}

          {hover && (
            <span className="ml-auto text-gray-600">
              row {hover.r + 1}, col {hover.c + 1}
            </span>
          )}

          {saveStatus === 'saving' && (
            <span className="ml-auto flex items-center gap-1 text-indigo-400">
              <Loader2 size={11} className="animate-spin" /> Auto-saving…
            </span>
          )}
          {saveStatus === 'saved' && <span className="ml-auto text-green-400">✓ Saved</span>}
          {saveStatus === 'error' && <span className="ml-auto text-red-400">✗ Save failed</span>}
        </div>
      </div>

      {/* ── Right: Blob Link Panel ───────────────────────────── */}
      {blobPanelOpen && blobLinks.length > 0 && (
        <BlobLinkPanel
          blobs={blobLinks}
          activeBlobId={activeBlobId ?? blobLinks[0]?.blobId}
          onSelectBlob={setActiveBlobId}
          onLink={handleLinkBlob}
          onUnlink={handleUnlinkBlob}
          onDismiss={() => setBlobPanelOpen(false)}
        />
      )}

      {/* ── Right: Settings Panel (mutually exclusive with blob panel) ── */}
      {settingsOpen && !blobPanelOpen && (
        <SettingsPanel
          floor={{ ...floor, grid_rows: gridRows, grid_cols: gridCols, cell_size_m: cellSizeM }}
          onApply={handleApplySettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
