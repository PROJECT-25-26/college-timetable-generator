/**
 * FloorGridPainter — SVG-based floor plan paint tool.
 *
 * Features:
 *   • 5 tools: Wall | Corridor | Stairs/Lift | Entrance | Eraser
 *   • SVG <rect> cells with SVG <defs> pattern overlays per cell type
 *   • Click-to-paint a single cell; click-drag to paint a run of cells
 *   • Pointer-capture drag (smooth, no stutter)
 *   • Hover ghost preview with tool colour
 *   • Vertical left tool palette with colour-coded icon pills
 *   • Collapsible right settings panel (rows, cols, scale calibration)
 *   • Zoom in/out (buttons + Ctrl+Wheel)
 *   • Status bar: dimensions, scale, footprint, per-type counts, save state
 *   • Debounced auto-save (2 s after last stroke) + Ctrl+S
 *   • Keyboard shortcuts: W / C / S / E / X  (R = right-click erase)
 *
 * Props:
 *   floor   {object}   Floor record { id, grid_rows, grid_cols, cell_size_m, grid_data }
 *   onSaved {function} Called with updated floor after successful grid save
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  DoorOpen,
  Eraser,
  Footprints,
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
} from 'lucide-react'
import { floorsApi } from '../api/index'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL_TYPES = {
  wall: {
    label:    'Wall',
    shortcut: 'W',
    icon:     Square,
    fill:     '#334155',  // slate-700
    accent:   '#64748b',  // slate-500 (for active glow)
    pattern:  'wall-hatch',
  },
  corridor: {
    label:    'Corridor',
    shortcut: 'C',
    icon:     Footprints,
    fill:     '#1a2e05',
    accent:   '#a3e635',
    pattern:  'corridor-stripe',
  },
  stairs: {
    label:    'Stairs / Lift',
    shortcut: 'S',
    icon:     ArrowUpDown,
    fill:     '#292524',
    accent:   '#facc15',
    pattern:  'stairs-step',
  },
  entrance: {
    label:    'Entrance',
    shortcut: 'E',
    icon:     DoorOpen,
    fill:     '#082f49',
    accent:   '#38bdf8',
    pattern:  'entrance-arc',
  },
  empty: {
    label:    'Empty',
    shortcut: 'X',
    icon:     Minus,
    fill:     null,
    accent:   '#6b7280',
    pattern:  null,
  },
}

const ERASER_TYPE    = 'empty'
const BASE_CELL_PX   = 24           // pixels per cell at zoom = 1
const EMPTY_BG       = '#12141f'    // dark grid background
const GRID_LINE      = 'rgba(255,255,255,0.055)'

// ---------------------------------------------------------------------------
// Helpers
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
  const counts = { wall: 0, corridor: 0, stairs: 0, entrance: 0 }
  for (const row of grid)
    for (const cell of row)
      if (counts[cell] !== undefined) counts[cell]++
  return counts
}

// ---------------------------------------------------------------------------
// SVG <defs> patterns — one per cell type
// ---------------------------------------------------------------------------

function SvgDefs({ cellPx }) {
  const s = cellPx   // alias for readability
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

      {/* Hover ghost mask (semi-transparent white overlay) */}
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

  const footprintW = (Number(cols)  * Number(scale)).toFixed(1)
  const footprintH = (Number(rows)  * Number(scale)).toFixed(1)

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
            <input
              type="number" min="5" max="200"
              className="fgp-settings-input"
              value={rows}
              onChange={e => setRows(e.target.value)}
            />
          </div>
          <div className="fgp-settings-row">
            <label className="fgp-settings-field-label">Columns</label>
            <input
              type="number" min="5" max="200"
              className="fgp-settings-input"
              value={cols}
              onChange={e => setCols(e.target.value)}
            />
          </div>
        </div>

        <div className="fgp-settings-section">
          <span className="fgp-settings-label">Scale Calibration</span>
          <div className="fgp-settings-row">
            <label className="fgp-settings-field-label">1 cell =</label>
            <input
              type="number" min="0.1" max="100" step="0.1"
              className="fgp-settings-input"
              value={scale}
              onChange={e => setScale(e.target.value)}
            />
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

        <button
          onClick={handleApply}
          className="fgp-apply-btn"
          id="fgp-apply-settings"
        >
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
// Main component
// ---------------------------------------------------------------------------

export default function FloorGridPainter({ floor, onSaved }) {
  const svgRef    = useRef(null)
  const saveTimer = useRef(null)

  const [activeTool,    setActiveTool]    = useState('wall')
  const [grid,          setGrid]          = useState(() =>
    mergeGrid(buildEmptyGrid(floor.grid_rows, floor.grid_cols), floor.grid_data)
  )
  const [zoom,          setZoom]          = useState(1)
  const [hover,         setHover]         = useState(null)   // { r, c }
  const [isPainting,    setIsPainting]    = useState(false)
  const [paintTool,     setPaintTool]     = useState('wall') // tool locked for current stroke
  const [saveStatus,    setSaveStatus]    = useState('idle') // idle|saving|saved|error
  const [settingsOpen,  setSettingsOpen]  = useState(false)

  // Floor dimensions driven from local state so settings panel can resize
  const [gridRows, setGridRows] = useState(floor.grid_rows)
  const [gridCols, setGridCols] = useState(floor.grid_cols)
  const [cellSizeM, setCellSizeM] = useState(floor.cell_size_m)

  // Keep gridRef always current so debounced callbacks read fresh data
  const gridRef = useRef(grid)
  useEffect(() => { gridRef.current = grid }, [grid])

  const cellPx = Math.round(BASE_CELL_PX * zoom)

  // ── Reset when floor changes ──────────────────────────────────────────────
  useEffect(() => {
    const fresh = mergeGrid(buildEmptyGrid(floor.grid_rows, floor.grid_cols), floor.grid_data)
    setGrid(fresh)
    gridRef.current = fresh
    setGridRows(floor.grid_rows)
    setGridCols(floor.grid_cols)
    setCellSizeM(floor.cell_size_m)
    setSaveStatus('idle')
  }, [floor.id, floor.grid_rows, floor.grid_cols, floor.cell_size_m])

  // ── Save helpers ──────────────────────────────────────────────────────────
  const doSave = useCallback(async (gridToSave) => {
    setSaveStatus('saving')
    try {
      const res = await floorsApi.saveGrid(floor.id, gridToSave)
      setSaveStatus('saved')
      onSaved?.(res.data)
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [floor.id, onSaved])

  const autoSave = useCallback(() => {
    doSave(gridRef.current)
  }, [doSave])

  const handleSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    doSave(gridRef.current)
  }, [doSave])

  // ── Settings panel — apply resize ─────────────────────────────────────────
  const handleApplySettings = useCallback(async ({ grid_rows, grid_cols, cell_size_m }) => {
    // Persist metadata to server (name/level unchanged)
    try {
      await floorsApi.update(floor.id, {
        grid_rows,
        grid_cols,
        cell_size_m,
        name:  floor.name,
        level: floor.level,
      })
    } catch {/* non-fatal — grid resize still applied locally */}

    // Resize grid (merge existing data into new bounds)
    const fresh = mergeGrid(buildEmptyGrid(grid_rows, grid_cols), gridRef.current)
    setGrid(fresh)
    gridRef.current = fresh
    setGridRows(grid_rows)
    setGridCols(grid_cols)
    setCellSizeM(cell_size_m)
    setSaveStatus('idle')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(autoSave, 2000)
  }, [floor.id, floor.name, floor.level, autoSave])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
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

  // ── Ctrl+Wheel zoom ───────────────────────────────────────────────────────
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

  // ── Paint a cell ──────────────────────────────────────────────────────────
  const paint = useCallback((r, c, tool) => {
    setGrid(prev => {
      if (prev[r]?.[c] === tool) return prev   // no-op
      const next = prev.map(row => [...row])
      next[r][c] = tool
      gridRef.current = next
      return next
    })
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(autoSave, 2000)
  }, [autoSave])

  // ── Convert SVG-local coords to cell index ────────────────────────────────
  const toCell = useCallback((e) => {
    const svg  = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const c = Math.floor((e.clientX - rect.left)  / cellPx)
    const r = Math.floor((e.clientY - rect.top)   / cellPx)
    if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return null
    return { r, c }
  }, [cellPx, gridRows, gridCols])

  // ── Pointer handlers (pointer-capture for smooth drag) ───────────────────
  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    const cell = toCell(e)
    if (!cell) return
    const tool = e.button === 2 ? ERASER_TYPE : activeTool
    setPaintTool(tool)
    setIsPainting(true)
    paint(cell.r, cell.c, tool)
    // Capture pointer so drag works even outside SVG bounds
    svgRef.current?.setPointerCapture(e.pointerId)
  }, [toCell, activeTool, paint])

  const handlePointerMove = useCallback((e) => {
    const cell = toCell(e)
    setHover(cell)
    if (!isPainting || !cell) return
    paint(cell.r, cell.c, paintTool)
  }, [toCell, isPainting, paintTool, paint])

  const handlePointerUp = useCallback(() => {
    setIsPainting(false)
  }, [])

  const handlePointerLeave = useCallback(() => {
    setHover(null)
    setIsPainting(false)
  }, [])

  const handleContextMenu = (e) => e.preventDefault()

  // ── Zoom helpers ──────────────────────────────────────────────────────────
  const zoomIn  = () => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))
  const zoomOut = () => setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)))
  const zoomReset = () => setZoom(1)

  // ── Stats ─────────────────────────────────────────────────────────────────
  const counts = countCells(grid)
  const footW = (gridCols * cellSizeM).toFixed(1)
  const footH = (gridRows * cellSizeM).toFixed(1)

  const svgW = gridCols * cellPx
  const svgH = gridRows * cellPx

  // ── Active tool definition ─────────────────────────────────────────────────
  const activeDef = CELL_TYPES[activeTool]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fgp-root">

      {/* ── Left: vertical tool palette ─────────────────────────── */}
      <div className="fgp-palette">
        <span className="fgp-palette-label">Tools</span>

        {Object.entries(CELL_TYPES).map(([type, def]) => {
          const Icon    = def.icon
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

        {/* Eraser as a styled standalone shortcut */}
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
      </div>

      {/* ── Centre: SVG canvas + toolbar ────────────────────────── */}
      <div className="fgp-centre">

        {/* Toolbar */}
        <div className="fgp-toolbar">

          {/* Active tool indicator */}
          <div className="fgp-active-tool-badge" style={{ borderColor: activeDef.accent + '60', color: activeDef.accent }}>
            <activeDef.icon size={11} />
            <span>{activeDef.label}</span>
          </div>

          <div className="fgp-toolbar-sep" />

          {/* Zoom */}
          <button id="fgp-zoom-out"   onClick={zoomOut}   className="fgp-icon-btn" title="Zoom out (Ctrl + scroll)"><ZoomOut  size={13} /></button>
          <span className="fgp-zoom-label">{Math.round(zoom * 100)}%</span>
          <button id="fgp-zoom-in"    onClick={zoomIn}    className="fgp-icon-btn" title="Zoom in (Ctrl + scroll)"><ZoomIn   size={13} /></button>
          <button id="fgp-zoom-reset" onClick={zoomReset} className="fgp-icon-btn" title="Reset zoom"><RefreshCw size={11} /></button>

          <div className="flex-1" />

          {/* Settings toggle */}
          <button
            id="fgp-settings-toggle"
            className={`fgp-icon-btn ${settingsOpen ? 'text-indigo-400' : ''}`}
            onClick={() => setSettingsOpen(o => !o)}
            title="Floor settings (dimensions & scale)"
          >
            <Settings2 size={13} />
            <span className="text-xs ml-1">Settings</span>
          </button>

          <div className="fgp-toolbar-sep" />

          {/* Save */}
          <button
            id="fgp-save-btn"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={[
              'fgp-save-btn',
              saveStatus === 'saved'  ? 'saved'  : '',
              saveStatus === 'error'  ? 'error'  : '',
              saveStatus === 'saving' ? 'saving' : '',
            ].join(' ')}
          >
            {saveStatus === 'saving'
              ? <Loader2 size={13} className="animate-spin" />
              : <Save size={13} />}
            {saveStatus === 'saved'  ? 'Saved!'
              : saveStatus === 'error' ? 'Error'
              : 'Save'}
          </button>
        </div>

        {/* SVG grid canvas */}
        <div className="fgp-svg-wrap">
          <svg
            ref={svgRef}
            id="floor-grid-svg"
            width={svgW}
            height={svgH}
            style={{
              cursor:        'crosshair',
              display:       'block',
              userSelect:    'none',
              touchAction:   'none',
              borderRadius:  '4px',
              boxShadow:     '0 0 0 1px rgba(255,255,255,0.06)',
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
                const def = CELL_TYPES[type]
                const x   = c * cellPx
                const y   = r * cellPx
                const inset = 0.5
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
                      stroke={def.accent}
                      strokeWidth="0.6"
                      strokeOpacity="0.4"
                    />
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
            {Object.entries(counts).map(([type, count]) => (
              <span key={type} className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm"
                  style={{ background: CELL_TYPES[type].accent }} />
                <span className="fgp-stat-label">{CELL_TYPES[type].label}:</span>
                <span className="fgp-stat-val">{count}</span>
              </span>
            ))}
          </span>

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
          {saveStatus === 'saved' && (
            <span className="ml-auto text-green-400">✓ Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="ml-auto text-red-400">✗ Save failed</span>
          )}
        </div>
      </div>

      {/* ── Right: Settings panel ────────────────────────────────── */}
      {settingsOpen && (
        <SettingsPanel
          floor={{ ...floor, grid_rows: gridRows, grid_cols: gridCols, cell_size_m: cellSizeM }}
          onApply={handleApplySettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
