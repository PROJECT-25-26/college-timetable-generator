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
  Image,
  Link,
  Link2Off,
  Loader2,
  MapPin,
  Minus,
  Ruler,
  Save,
  Settings2,
  Square,
  ArrowUpDown,
  Check,
  Trash2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Users,
  X,
} from 'lucide-react'
import { buildingsApi, floorsApi, roomsApi, staffroomsApi } from '../api/index'

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
    linkable: true,
  },

  door: {
    label:    'Door',
    shortcut: 'D',
    icon:     DoorOpen,
    fill:     '#2e1065',
    accent:   '#a78bfa',
    pattern:  'door-lines',
    linkable: false,
    description: 'Room/staffroom door',
  },
  gate: {
    label:    'Gate',
    shortcut: 'G',
    icon:     DoorOpen,
    fill:     '#451a03',
    accent:   '#f59e0b',
    pattern:  'gate-arch',
    linkable: false,
    description: 'Building gate / main entrance',
  },
  entrance: {
    label:    'Entrance (Legacy)',
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
  const counts = { wall: 0, corridor: 0, stairs: 0, door: 0, gate: 0, entrance: 0, room: 0, staffroom: 0 }
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
        if (t === 'corridor' || t === 'entrance' || t === 'door' || t === 'gate') return true
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
function reconcileLinks(freshBlobs, savedLinks, savedStairConnections) {
  if (!freshBlobs || !freshBlobs.length) return []

  const cellToSavedLink = new Map()
  if (savedLinks && savedLinks.length) {
    for (const saved of savedLinks) {
      if ((saved.record_id || saved.stair_id) && saved.cells) {
        for (const cell of saved.cells) {
          const r = cell.r ?? cell[0], c = cell.c ?? cell[1]
          if (r !== undefined && c !== undefined) {
            cellToSavedLink.set(`${r},${c}`, saved)
          }
        }
      }
    }
  }

  const cellToSavedStair = new Map()
  if (savedStairConnections && savedStairConnections.length) {
    for (const sc of savedStairConnections) {
      if (sc.stair_id && sc.cells) {
        for (const cell of sc.cells) {
          const r = cell.r ?? cell[0], c = cell.c ?? cell[1]
          if (r !== undefined && c !== undefined) {
            cellToSavedStair.set(`${r},${c}`, sc.stair_id)
          }
        }
      }
    }
  }

  const usedRecordIds = new Set()
  const result = []

  for (const blob of freshBlobs) {
    const bbox = calcBoundingBox(blob.cells)
    if (blob.type === 'stairs') {
      let stairId = blob.stair_id || null
      if (!stairId) {
        for (const cell of blob.cells) {
          if (cellToSavedStair.has(`${cell.r},${cell.c}`)) {
            stairId = cellToSavedStair.get(`${cell.r},${cell.c}`)
            break
          }
          const savedLink = cellToSavedLink.get(`${cell.r},${cell.c}`)
          if (savedLink && (savedLink.stair_id || savedLink.record_id)) {
            stairId = savedLink.stair_id || savedLink.record_id
            break
          }
        }
      }
      result.push({
        ...blob,
        stair_id: stairId,
        record_id: stairId,
        record_name: stairId ? `Stairwell Group: ${stairId}` : null,
        record_code: stairId,
        bounding_box: bbox,
      })
    } else {
      let exactSaved = null
      for (const cell of blob.cells) {
        const match = cellToSavedLink.get(`${cell.r},${cell.c}`)
        if (match && match.record_id && !usedRecordIds.has(match.record_id)) {
          if (!match.type || match.type === blob.type) {
            exactSaved = match
            break
          }
        }
      }

      if (exactSaved) {
        usedRecordIds.add(exactSaved.record_id)
        result.push({
          ...blob,
          record_id: exactSaved.record_id,
          record_name: exactSaved.record_name,
          record_code: exactSaved.record_code,
          bounding_box: bbox,
        })
      } else {
        result.push({
          ...blob,
          record_id: null,
          record_name: null,
          record_code: null,
          bounding_box: bbox,
        })
      }
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

      {/* Door — vertical lines */}
      <pattern id="door-lines" patternUnits="userSpaceOnUse" width="6" height="6">
        <line x1="3" y1="0" x2="3" y2="6" stroke="#a78bfa" strokeWidth="1" strokeOpacity="0.5" />
      </pattern>

      {/* Gate — arch pattern */}
      <pattern id="gate-arch" patternUnits="userSpaceOnUse" width="8" height="8">
        <path d="M 1,8 A 3,3 0 0,1 7,8" fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeOpacity="0.6" />
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
// Background Image helpers
// ---------------------------------------------------------------------------

async function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new window.Image()
      img.onload = () => resolve({ url: e.target.result, width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function loadPdfFile(file) {
  const arrayBuffer = await file.arrayBuffer()
  // Dynamic CDN import — only loaded on demand
  const pdfjsLib = await import(
    /* @vite-ignore */
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs'
  )
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs'
  const pdf  = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)
  const vp   = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width  = vp.width
  canvas.height = vp.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  return { url: canvas.toDataURL('image/png'), width: vp.width, height: vp.height }
}

// ---------------------------------------------------------------------------
// Background Image Panel
// ---------------------------------------------------------------------------

function BgImagePanel({ bgImage, bgOpacity, setBgOpacity, bgMode, calibPins, calibDist,
                        setCalibDist, onUpload, onRemove, onStartCalib, onResetCalib,
                        onApplyCalib, onClose, svgW, svgH, cellPx }) {
  const [dragOver, setDragOver] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const fileRef = useRef(null)

  const handleFile = async (file) => {
    if (!file) return
    const isPdf = file.type === 'application/pdf'
    const isImg = file.type.startsWith('image/')
    if (!isPdf && !isImg) return
    setLoading(true)
    try {
      const data = isPdf ? await loadPdfFile(file) : await loadImageFile(file)
      onUpload(data)
    } catch (err) {
      console.error('BgImage load error', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  // Derived calibration result
  const calibResult = (() => {
    if (calibPins.length < 2 || !bgImage || !calibDist || isNaN(Number(calibDist))) return null
    const [A, B] = calibPins
    const pixDist = Math.sqrt((B.x - A.x) ** 2 + (B.y - A.y) ** 2)
    const scaleX  = svgW / bgImage.width
    const scaleY  = svgH / bgImage.height
    const avgScale  = (scaleX + scaleY) / 2
    const svgDist   = pixDist * avgScale
    const numCells  = svgDist / cellPx
    if (numCells <= 0) return null
    return (Number(calibDist) / numCells).toFixed(3)
  })()

  const stepState = (step) => {
    if (step === 1) return calibPins.length >= 1 ? 'done' : (bgMode === 'place_pin_1' ? 'active' : '')
    if (step === 2) return calibPins.length >= 2 ? 'done' : (bgMode === 'place_pin_2' ? 'active' : '')
    if (step === 3) return calibResult ? 'done' : (calibPins.length >= 2 ? 'active' : '')
    return ''
  }

  return (
    <div className="fgp-bg-panel">
      <div className="fgp-bg-panel-header">
        <Image size={13} className="text-indigo-400" />
        <span>Background Image</span>
        <button onClick={onClose} className="ml-auto p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="fgp-bg-panel-body">

        {/* Upload zone */}
        {!bgImage ? (
          <div
            className={`fgp-upload-zone${dragOver ? ' drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {loading
              ? <Loader2 size={22} className="animate-spin text-indigo-400" />
              : <Image size={22} className="text-indigo-400" />
            }
            <p>
              <strong>Click or drag &amp; drop</strong><br />
              PNG, JPG, SVG or PDF (page 1)<br />
              Used as a tracing underlay
            </p>
          </div>
        ) : (
          <>
            {/* Thumbnail preview */}
            <div className="rounded-md overflow-hidden border border-white/10" style={{ maxHeight: 110 }}>
              <img src={bgImage.url} alt="floor plan" className="w-full h-full object-contain" style={{ maxHeight: 110 }} />
            </div>

            {/* Opacity */}
            <div>
              <span className="fgp-settings-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Underlay Opacity</span>
              <div className="fgp-opacity-row">
                <input
                  type="range" min={5} max={95} value={bgOpacity}
                  className="fgp-opacity-slider"
                  onChange={(e) => setBgOpacity(Number(e.target.value))}
                />
                <span className="fgp-opacity-val">{bgOpacity}%</span>
              </div>
            </div>

            {/* Calibration wizard */}
            <div className="fgp-calib-section">
              <div className="fgp-calib-title">
                <Ruler size={12} /> Scale Calibration
              </div>

              {/* Step 1 */}
              <div className="fgp-calib-step">
                <div className={`fgp-calib-step-num ${stepState(1)}`}>
                  {calibPins.length >= 1 ? '✓' : '1'}
                </div>
                <span>
                  {calibPins.length >= 1
                    ? <span style={{ color: '#4ade80' }}>Point A placed</span>
                    : bgMode === 'place_pin_1'
                      ? <span style={{ color: '#fbbf24' }}>Click Point A on the canvas below ↓</span>
                      : 'Click Point A on the floor plan'}
                </span>
              </div>

              {/* Step 2 */}
              <div className="fgp-calib-step">
                <div className={`fgp-calib-step-num ${stepState(2)}`}>
                  {calibPins.length >= 2 ? '✓' : '2'}
                </div>
                <span>
                  {calibPins.length >= 2
                    ? <span style={{ color: '#4ade80' }}>Point B placed</span>
                    : bgMode === 'place_pin_2'
                      ? <span style={{ color: '#fbbf24' }}>Now click Point B on the canvas ↓</span>
                      : 'Then click Point B'}
                </span>
              </div>

              {/* Step 3 — distance input */}
              <div className="fgp-calib-step">
                <div className={`fgp-calib-step-num ${stepState(3)}`}>
                  {calibResult ? '✓' : '3'}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span>Enter real-world distance A → B</span>
                  <div className="fgp-calib-dist-row">
                    <input
                      type="number" min="0.01" step="0.1"
                      className="fgp-calib-dist-input"
                      placeholder="e.g. 10"
                      value={calibDist}
                      onChange={(e) => setCalibDist(e.target.value)}
                      disabled={calibPins.length < 2}
                    />
                    <span className="fgp-calib-unit">m</span>
                  </div>
                </div>
              </div>

              {calibResult && (
                <div className="fgp-calib-result">
                  <Check size={11} />
                  1 cell ≈ <strong style={{ marginLeft: 4 }}>{calibResult} m</strong>
                </div>
              )}

              {/* Wizard action buttons */}
              {bgMode === 'off' || bgMode === 'calibrated' ? (
                <button
                  className="fgp-calib-apply-btn"
                  onClick={onStartCalib}
                  id="fgp-calib-start"
                >
                  <MapPin size={12} />
                  {calibPins.length >= 2 ? 'Re-place Pins' : 'Start Calibration'}
                </button>
              ) : null}

              {(bgMode === 'place_pin_1' || bgMode === 'place_pin_2') && (
                <button className="fgp-calib-reset-btn" onClick={onResetCalib}>
                  <X size={11} /> Cancel pin placement
                </button>
              )}

              {calibResult && (
                <button
                  className="fgp-calib-apply-btn"
                  onClick={() => onApplyCalib(Number(calibResult))}
                  id="fgp-calib-apply"
                >
                  <Check size={12} /> Apply Calibration
                </button>
              )}

              {calibPins.length > 0 && bgMode !== 'place_pin_1' && bgMode !== 'place_pin_2' && (
                <button className="fgp-calib-reset-btn" onClick={onResetCalib}>
                  <Trash2 size={11} /> Clear pins
                </button>
              )}
            </div>

            {/* Remove image */}
            <button className="fgp-remove-img-btn" onClick={onRemove} id="fgp-remove-bg">
              <Trash2 size={12} /> Remove Background Image
            </button>
          </>
        )}
      </div>
    </div>
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

function BlobLinkPanel({ blobs, onLink, onUnlink, onDismiss, activeBlobId, onSelectBlob, buildingId }) {
  const [rooms,            setRooms]            = useState([])
  const [staffrooms,        setStaffrooms]        = useState([])
  const [loading,          setLoading]          = useState(true)
  const [selected,         setSelected]         = useState('')
  const [searchTerm,       setSearchTerm]       = useState('')
  const [existingStairIds, setExistingStairIds] = useState([])
  const [stairInput,       setStairInput]       = useState('')

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

  useEffect(() => {
    if (!buildingId) return
    let cancelled = false
    buildingsApi.floors(buildingId)
      .then(res => {
        if (cancelled) return
        const flList = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])
        const ids = new Set()
        for (const fl of flList) {
          if (fl.stair_connections) {
            try {
              const scs = typeof fl.stair_connections === 'string' ? JSON.parse(fl.stair_connections) : fl.stair_connections
              if (Array.isArray(scs)) {
                for (const sc of scs) {
                  if (sc.stair_id) ids.add(sc.stair_id)
                }
              }
            } catch {}
          }
        }
        setExistingStairIds(Array.from(ids))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [buildingId])

  const activeBlob = blobs.find(b => b.blobId === activeBlobId) ?? blobs[0]
  const isStairsBlob = activeBlob?.type === 'stairs'
  const isRoomBlob   = activeBlob?.type === 'room'
  const rawList      = isRoomBlob ? rooms : staffrooms

  useEffect(() => {
    if (activeBlob?.type === 'stairs') {
      setStairInput(activeBlob.stair_id || activeBlob.record_id || '')
    } else {
      setSelected('')
    }
  }, [activeBlob?.blobId, activeBlob?.type, activeBlob?.stair_id, activeBlob?.record_id])

  const defaultStairSuggestions = ["Stairwell A", "Stairwell B", "Lift 1", "Lift 2", "Main Stairs"]
  const allStairSuggestions = Array.from(new Set([...existingStairIds, ...defaultStairSuggestions]))

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
    setStairInput('')
  }

  if (!blobs.length) {
    return (
      <div className="fgp-blob-panel">
        <div className="fgp-blob-panel-header">
          <Link size={12} className="text-indigo-400" />
          <span>Link Rooms &amp; Stairs</span>
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
            <h4 className="text-xs font-semibold text-gray-200">No Linkable Blobs Painted Yet</h4>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
              Use the <strong className="text-indigo-300 font-semibold">Room [R]</strong>, <strong className="text-purple-300 font-semibold">Staffroom [T]</strong>, or <strong className="text-amber-300 font-semibold">Stairs/Lift [S]</strong> tool from the left palette to paint cells on the grid.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const currentStairTag = activeBlob?.stair_id || activeBlob?.record_id

  return (
    <div className="fgp-blob-panel">
      <div className="fgp-blob-panel-header">
        <Link size={12} className="text-indigo-400" />
        <span>{isStairsBlob ? 'Stairwell Grouping' : 'Link Rooms'}</span>
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
                  <span className="truncate">{CELL_TYPES[b.type].label} · {b.cells.length} cells</span>
                  {(b.record_id || b.stair_id) && <Check size={9} className="ml-auto text-green-400 flex-shrink-0" />}
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
                  : activeBlob.type === 'staffroom'
                    ? <Users size={9} />
                    : <ArrowUpDown size={9} />}
                {CELL_TYPES[activeBlob.type].label}
              </span>
              <p className="fgp-blob-stat mt-1.5">
                {activeBlob.cells.length} cell{activeBlob.cells.length !== 1 ? 's' : ''} · top-left: row {activeBlob.cells[0].r + 1}, col {activeBlob.cells[0].c + 1}
              </p>
            </div>

            {/* Currently linked chip */}
            {(activeBlob.record_id || activeBlob.stair_id) && (
              <div className="mb-2">
                <p className="fgp-settings-label mb-1">Currently Tagged</p>
                <div className="fgp-blob-linked-chip">
                  <Check size={10} className="flex-shrink-0" />
                  <span className="truncate">
                    {activeBlob.type === 'stairs'
                      ? `Stairwell Group: ${currentStairTag}`
                      : (activeBlob.record_name ?? activeBlob.record_id)}
                  </span>
                </div>
                <button className="fgp-blob-unlink-btn mt-2" onClick={handleUnlink}>
                  <Link2Off size={10} className="inline mr-1" />
                  Unlink / Clear Tag
                </button>
              </div>
            )}

            {isStairsBlob ? (
              <div>
                <p className="fgp-settings-label mb-1">
                  {currentStairTag ? 'Change Stairwell Group' : 'Assign Stairwell Group ID'}
                </p>
                <p className="text-[10px] text-gray-400 mb-2 leading-relaxed">
                  Tag matching stairwells across floors with the same ID so cross-floor distances can connect them.
                </p>

                {/* Quick Suggestion Pills */}
                <div className="mb-3">
                  <span className="text-[9px] text-gray-500 uppercase font-semibold block mb-1">Suggested / Existing:</span>
                  <div className="flex flex-wrap gap-1">
                    {allStairSuggestions.map(sId => (
                      <button
                        key={sId}
                        type="button"
                        className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                          stairInput === sId
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                            : 'bg-gray-800 border-white/10 text-gray-300 hover:border-amber-500/50'
                        }`}
                        onClick={() => setStairInput(sId)}
                      >
                        {sId}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="e.g. Stairwell A or Lift 1"
                    className="fgp-blob-select text-xs w-full"
                    value={stairInput}
                    onChange={e => setStairInput(e.target.value)}
                  />
                  <button
                    className="fgp-blob-link-btn w-full"
                    onClick={() => {
                      if (!stairInput.trim()) return
                      const tag = stairInput.trim()
                      onLink(activeBlob.blobId, tag, `Stairwell Group: ${tag}`, tag)
                    }}
                    disabled={!stairInput.trim()}
                  >
                    <ArrowUpDown size={10} className="inline mr-1" />
                    {currentStairTag ? 'Update Stairwell Tag' : 'Tag Stairwell'}
                  </button>
                </div>
              </div>
            ) : (
              /* Select dropdown section for rooms / staffrooms */
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
            )}

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

  // Gate labels state
  const parseGateLabels = (raw) => {
    if (!raw) return {}
    if (typeof raw === 'object') return raw
    try { return JSON.parse(raw) } catch { return {} }
  }

  const [gateLabels,   setGateLabels]   = useState(() => parseGateLabels(floor.gate_labels))
  const [editingGate,  setEditingGate]  = useState(null)  // { r, c, label }
  const gateLabelsRef = useRef(gateLabels)
  useEffect(() => { gateLabelsRef.current = gateLabels }, [gateLabels])

  // Blob link state
  const [blobLinks,      setBlobLinks]      = useState(() => reconcileLinks(
    detectAllBlobs(mergeGrid(buildEmptyGrid(floor.grid_rows, floor.grid_cols), floor.grid_data)),
    floor.room_links ?? [],
    floor.stair_connections ?? []
  ))
  const [blobPanelOpen,  setBlobPanelOpen]  = useState(false)
  const [activeBlobId,   setActiveBlobId]   = useState(null)

  // Walkability warnings
  const [walkWarnings, setWalkWarnings] = useState([])

  // Background image state
  const [bgImage,      setBgImage]      = useState(null)    // { url, width, height }
  const [bgOpacity,    setBgOpacity]    = useState(40)      // 0–100
  const [bgPanelOpen,  setBgPanelOpen]  = useState(false)
  const [bgMode,       setBgMode]       = useState('off')   // 'off'|'place_pin_1'|'place_pin_2'|'calibrated'
  const [calibPins,    setCalibPins]    = useState([])      // [{x,y}] in image-space coords
  const [calibDist,    setCalibDist]    = useState('')      // user-entered metres

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
    const freshGL = parseGateLabels(floor.gate_labels)
    setGateLabels(freshGL)
    gateLabelsRef.current = freshGL
    setSaveStatus('idle')
    setWalkWarnings([])

    const freshBlobs = detectAllBlobs(fresh)
    const linked     = reconcileLinks(freshBlobs, floor.room_links ?? [], floor.stair_connections ?? [])
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

  // ── Walkability & Stair validation ────────────────────────────────────────
  const runWalkabilityCheck = useCallback((currentGrid, currentLinks) => {
    const warnings = []
    for (const blob of currentLinks) {
      if (blob.type === 'stairs') {
        if (!blob.stair_id && !blob.record_id) {
          warnings.push({
            blobId:  blob.blobId,
            type:    'stairs_unassigned',
            name:    `Stairs/Lift at (row ${blob.cells[0].r + 1}, col ${blob.cells[0].c + 1})`,
            cells:   blob.cells.length,
          })
        }
        continue
      }
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
    // Run walkability & stair check before saving
    runWalkabilityCheck(gridToSave, linksToSave)

    const roomLinksToSave = linksToSave
      .filter(b => b.type !== 'stairs' && b.record_id)
      .map(b => ({
        record_id:    b.record_id,
        record_name:  b.record_name,
        record_code:  b.record_code,
        type:         b.type,
        bounding_box: b.bounding_box,
        cells:        b.cells.map(c => ({ r: c.r, c: c.c })),
      }))

    const stairConnectionsToSave = linksToSave
      .filter(b => b.type === 'stairs' && (b.stair_id || b.record_id))
      .map(b => ({
        stair_id: b.stair_id || b.record_id,
        cells:    b.cells.map(c => ({ r: c.r, c: c.c })),
      }))

    setSaveStatus('saving')
    try {
      const res = await floorsApi.saveGrid(floor.id, gridToSave, roomLinksToSave, stairConnectionsToSave, gateLabelsRef.current)
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
          stair_id:     b.type === 'stairs' ? recordId : b.stair_id,
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
        ? { ...b, stair_id: null, record_id: null, record_name: null, record_code: null }
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
      if ((e.ctrlKey || e.metaKey) && key === 'I') {
        e.preventDefault()
        setBgPanelOpen(o => !o)
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

  // ── Background image calibration pin placement ───────────────────────────
  const bgImageRef  = useRef(bgImage)
  const bgModeRef   = useRef(bgMode)
  const calibPinsRef = useRef(calibPins)
  useEffect(() => { bgImageRef.current   = bgImage   }, [bgImage])
  useEffect(() => { bgModeRef.current    = bgMode    }, [bgMode])
  useEffect(() => { calibPinsRef.current = calibPins }, [calibPins])

  const svgWRef  = useRef(0)
  const svgHRef  = useRef(0)
  useEffect(() => { svgWRef.current = gridCols * Math.round(BASE_CELL_PX * zoom) }, [gridCols, zoom])
  useEffect(() => { svgHRef.current = gridRows * Math.round(BASE_CELL_PX * zoom) }, [gridRows, zoom])

  const handleSvgClickForPin = useCallback((e) => {
    const svg  = svgRef.current
    if (!svg || !bgImageRef.current) return
    const rect = svg.getBoundingClientRect()
    const svgX = e.clientX - rect.left
    const svgY = e.clientY - rect.top
    const curSvgW = svgWRef.current
    const curSvgH = svgHRef.current
    const img    = bgImageRef.current
    // Convert SVG px → image-space px
    const imgX = (svgX / curSvgW) * img.width
    const imgY = (svgY / curSvgH) * img.height
    const pin  = { x: imgX, y: imgY }

    const mode = bgModeRef.current
    if (mode === 'place_pin_1') {
      setCalibPins([pin])
      setBgMode('place_pin_2')
    } else if (mode === 'place_pin_2') {
      setCalibPins(prev => [prev[0], pin])
      setBgMode('calibrated')
    }
  }, [])

  // ── Pointer handlers ─────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    // In pin-placement mode, intercept click to drop a calibration pin
    const mode = bgModeRef.current
    if (mode === 'place_pin_1' || mode === 'place_pin_2') {
      handleSvgClickForPin(e)
      return
    }
    const cell = toCell(e)
    if (!cell) return
    const tool = e.button === 2 ? ERASER_TYPE : activeTool
    paintToolRef.current   = tool
    lastPaintedRef.current = cell
    setPaintTool(tool)
    setIsPainting(true)
    paint(cell.r, cell.c, tool)
    svgRef.current?.setPointerCapture(e.pointerId)
  }, [toCell, activeTool, paint, handleSvgClickForPin])

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

      if (toolUsed === 'gate' && lastCell) {
        setEditingGate({
          r: lastCell.r,
          c: lastCell.c,
          label: gateLabelsRef.current[`${lastCell.r},${lastCell.c}`] || '',
        })
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
    const code = blob.record_code || blob.stair_id
    if (code) {
      for (const { r, c } of blob.cells) {
        cellLinkMap.set(`${r},${c}`, {
          code:    code.slice(0, 6),
          accent:  CELL_TYPES[blob.type].accent,
          blobId:  blob.blobId,
        })
      }
    }
  }

  const linkedBlobCount   = blobLinks.filter(b => b.record_id || b.stair_id).length
  const unlinkedBlobCount = blobLinks.filter(b => !b.record_id && !b.stair_id).length

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fgp-root">

      {/* ── Left: vertical tool palette ─────────────────────── */}
      <div className="fgp-palette">
        <span className="fgp-palette-label">Tools</span>

        {Object.entries(CELL_TYPES).filter(([t]) => t !== 'empty' && t !== 'entrance').map(([type, def]) => {
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
            id="fgp-bg-toggle"
            className={`fgp-icon-btn ${bgPanelOpen ? 'text-amber-400' : ''}`}
            onClick={() => setBgPanelOpen(o => !o)}
            title="Background image (Ctrl+I)"
          >
            <Image size={13} />
            <span className="text-xs ml-1">Background</span>
            {bgImage && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
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

        {/* Walkability & Stair warning bar */}
        {walkWarnings.length > 0 && (
          <div className="fgp-warning-bar">
            <AlertTriangle size={13} className="fgp-warning-bar-icon flex-shrink-0" />
            <span className="leading-normal">
              {walkWarnings.some(w => w.type === 'stairs_unassigned') && (
                <span className="mr-2">
                  <strong className="text-amber-300">{walkWarnings.filter(w => w.type === 'stairs_unassigned').length} Stairs/Lift blob(s)</strong> have no Stairwell Group ID assigned.
                </span>
              )}
              {walkWarnings.some(w => w.type !== 'stairs_unassigned') && (
                <span>
                  <strong>{walkWarnings.filter(w => w.type !== 'stairs_unassigned').length} room(s)</strong> have no walkable path to corridor/entrance:&nbsp;
                  {walkWarnings.filter(w => w.type !== 'stairs_unassigned').map(w => w.name).join(', ')}
                </span>
              )}
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

        {/* Pin-placement hint bar */}
        {(bgMode === 'place_pin_1' || bgMode === 'place_pin_2') && (
          <div className="fgp-pin-hint">
            <MapPin size={12} />
            {bgMode === 'place_pin_1'
              ? 'Click on the canvas to place Point A'
              : 'Click on the canvas to place Point B'}
            <button
              className="ml-auto text-amber-600 hover:text-amber-400 transition-colors"
              onClick={() => { setBgMode('off'); setCalibPins([]) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.68rem' }}
            >
              Cancel
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
              cursor:       (bgMode === 'place_pin_1' || bgMode === 'place_pin_2') ? 'crosshair' : 'crosshair',
              display:      'block',
              userSelect:   'none',
              touchAction:  'none',
              borderRadius: '4px',
              boxShadow:    (bgMode === 'place_pin_1' || bgMode === 'place_pin_2')
                ? '0 0 0 2px rgba(245,158,11,0.6)'
                : '0 0 0 1px rgba(255,255,255,0.06)',
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

            {/* Background image underlay */}
            {bgImage && (
              <image
                href={bgImage.url}
                x={0} y={0}
                width={svgW} height={svgH}
                opacity={bgOpacity / 100}
                preserveAspectRatio="xMidYMid meet"
                style={{ pointerEvents: 'none' }}
              />
            )}

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
                    {/* Gate label rendering */}
                    {type === 'gate' && cellPx >= 10 && (
                      <text
                        x={x + cellPx / 2}
                        y={y + cellPx / 2 + (cellPx >= 18 ? 3.5 : 2.5)}
                        textAnchor="middle"
                        fontSize={Math.max(7, Math.min(cellPx * 0.36, 11))}
                        fontFamily="system-ui, -apple-system, sans-serif"
                        fontWeight="800"
                        fill="#f59e0b"
                        stroke="rgba(0,0,0,0.8)"
                        strokeWidth="0.8"
                        paintOrder="stroke fill"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {gateLabels[`${r},${c}`] ? gateLabels[`${r},${c}`].slice(0, 6) : 'GATE'}
                      </text>
                    )}
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

            {/* Calibration pin markers */}
            {bgImage && calibPins.map((pin, i) => {
              const svgX = (pin.x / bgImage.width)  * svgW
              const svgY = (pin.y / bgImage.height) * svgH
              const label = i === 0 ? 'A' : 'B'
              return (
                <g key={`pin-${i}`} style={{ pointerEvents: 'none' }}>
                  <circle cx={svgX} cy={svgY} r={7} fill="none" stroke="#f59e0b" strokeWidth="2"
                    strokeOpacity="0.9" />
                  <circle cx={svgX} cy={svgY} r={2} fill="#f59e0b" fillOpacity="0.9" />
                  <line x1={svgX - 12} y1={svgY} x2={svgX + 12} y2={svgY}
                    stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.8" />
                  <line x1={svgX} y1={svgY - 12} x2={svgX} y2={svgY + 12}
                    stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.8" />
                  <text
                    x={svgX + 11} y={svgY - 8}
                    fontSize="12" fontWeight="800"
                    fill="#f59e0b"
                    stroke="rgba(0,0,0,0.7)" strokeWidth="0.8" paintOrder="stroke fill"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {label}
                  </text>
                </g>
              )
            })}

            {/* Line connecting the two calibration pins */}
            {bgImage && calibPins.length === 2 && (() => {
              const ax = (calibPins[0].x / bgImage.width)  * svgW
              const ay = (calibPins[0].y / bgImage.height) * svgH
              const bx = (calibPins[1].x / bgImage.width)  * svgW
              const by = (calibPins[1].y / bgImage.height) * svgH
              return (
                <line x1={ax} y1={ay} x2={bx} y2={by}
                  stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,3"
                  strokeOpacity="0.6" style={{ pointerEvents: 'none' }}
                />
              )
            })()}
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
          buildingId={floor.building_id}
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

      {/* ── Right: Background Image Panel ────────────────────── */}
      {bgPanelOpen && !blobPanelOpen && !settingsOpen && (
        <BgImagePanel
          bgImage={bgImage}
          bgOpacity={bgOpacity}
          setBgOpacity={setBgOpacity}
          bgMode={bgMode}
          calibPins={calibPins}
          calibDist={calibDist}
          setCalibDist={setCalibDist}
          onUpload={(data) => {
            setBgImage(data)
            setCalibPins([])
            setBgMode('off')
            setCalibDist('')
          }}
          onRemove={() => {
            setBgImage(null)
            setCalibPins([])
            setBgMode('off')
            setCalibDist('')
          }}
          onStartCalib={() => {
            setCalibPins([])
            setBgMode('place_pin_1')
          }}
          onResetCalib={() => {
            setCalibPins([])
            setBgMode('off')
          }}
          onApplyCalib={(newScale) => {
            handleApplySettings({ grid_rows: gridRows, grid_cols: gridCols, cell_size_m: newScale })
            setBgMode('calibrated')
          }}
          onClose={() => setBgPanelOpen(false)}
          svgW={svgW}
          svgH={svgH}
          cellPx={cellPx}
        />
      )}
      {/* ── Gate Labeling Dialog ───────────────────────────────── */}
      {editingGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs" onClick={() => setEditingGate(null)}>
          <div className="bg-[#181a26] border border-amber-500/40 rounded-2xl p-5 w-84 shadow-2xl space-y-3.5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <DoorOpen size={16} /> Label Building Gate
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Assign a label to this gate (row {editingGate.r + 1}, col {editingGate.c + 1}). Used for inter-building entrance distance mapping.
            </p>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white outline-none focus:border-amber-500 font-medium"
              placeholder="e.g. Main Entrance, Gate A, West Exit"
              value={editingGate.label}
              onChange={e => setEditingGate({ ...editingGate, label: e.target.value })}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const key = `${editingGate.r},${editingGate.c}`
                  const next = { ...gateLabels, [key]: editingGate.label.trim() }
                  setGateLabels(next)
                  gateLabelsRef.current = next
                  setEditingGate(null)
                  clearTimeout(saveTimer.current)
                  saveTimer.current = setTimeout(autoSave, 1000)
                }
              }}
            />
            <div className="flex gap-2 justify-end pt-1">
              <button
                className="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-gray-400 hover:text-white transition-colors"
                onClick={() => setEditingGate(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded-lg text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors"
                onClick={() => {
                  const key = `${editingGate.r},${editingGate.c}`
                  const next = { ...gateLabels, [key]: editingGate.label.trim() }
                  setGateLabels(next)
                  gateLabelsRef.current = next
                  setEditingGate(null)
                  clearTimeout(saveTimer.current)
                  saveTimer.current = setTimeout(autoSave, 1000)
                }}
              >
                Save Gate Label
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
