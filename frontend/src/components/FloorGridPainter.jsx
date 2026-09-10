/**
 * FloorGridPainter — canvas-based floor plan paint tool.
 *
 * Features:
 *   • 5 cell types: empty | wall | corridor | stairs | entrance
 *   • Click + click-drag to paint; right-click to erase
 *   • Keyboard shortcuts: W / C / S / E / X
 *   • Hover ghost preview
 *   • Debounced auto-save (2 s after last stroke)
 *   • Manual Save button
 *   • Status bar: dimensions, scale, per-type cell counts
 *
 * Props:
 *   floor        {object}   Floor record (id, grid_rows, grid_cols, cell_size_m, grid_data)
 *   onSaved      {function} Called with updated floor after successful grid save
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Eraser,
  Save,
  Square,
  ArrowUpDown,
  DoorOpen,
  Footprints,
  Minus,
  Loader2,
} from 'lucide-react'
import { floorsApi } from '../api/index'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL_TYPES = {
  empty:    { label: 'Empty',    color: null,      shortcut: 'X', icon: Minus },
  wall:     { label: 'Wall',     color: '#475569', shortcut: 'W', icon: Square },
  corridor: { label: 'Corridor', color: '#a3e635', shortcut: 'C', icon: Footprints },
  stairs:   { label: 'Stairs',   color: '#facc15', shortcut: 'S', icon: ArrowUpDown },
  entrance: { label: 'Entrance', color: '#38bdf8', shortcut: 'E', icon: DoorOpen },
}

const ERASER_TYPE  = 'empty'
const GRID_LINE_COLOR = 'rgba(255,255,255,0.06)'
const EMPTY_BG       = '#1a1c2e'   // dark cell background

// How many pixels per cell at zoom=1.  Canvas cells are always square.
const BASE_CELL_PX = 24

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEmptyGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill('empty'))
}

/** Merge a saved grid (possibly smaller/larger) into a fresh empty grid. */
function mergeGrid(emptyGrid, savedGrid) {
  if (!savedGrid) return emptyGrid
  const rows = emptyGrid.length
  const cols = emptyGrid[0].length
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
// Component
// ---------------------------------------------------------------------------

export default function FloorGridPainter({ floor, onSaved }) {
  const canvasRef   = useRef(null)
  const wrapRef     = useRef(null)
  const saveTimer   = useRef(null)

  const [activeTool, setActiveTool]     = useState('wall')
  const [grid, setGrid]                 = useState(() =>
    mergeGrid(buildEmptyGrid(floor.grid_rows, floor.grid_cols), floor.grid_data)
  )
  const [zoom, setZoom]                 = useState(1)
  const [hover, setHover]               = useState(null)   // {r, c}
  const [isPainting, setIsPainting]     = useState(false)
  const [saveStatus, setSaveStatus]     = useState('idle') // 'idle'|'saving'|'saved'|'error'

  // Bug fix: keep a ref to the latest grid so async callbacks (autoSave) never
  // capture a stale closure — paint is memoised with [] deps so its setTimeout
  // would otherwise always save the initial empty grid.
  const gridRef = useRef(grid)
  useEffect(() => { gridRef.current = grid }, [grid])

  const cellPx = Math.round(BASE_CELL_PX * zoom)

  // Reset grid when floor changes
  useEffect(() => {
    const fresh = mergeGrid(buildEmptyGrid(floor.grid_rows, floor.grid_cols), floor.grid_data)
    setGrid(fresh)
    gridRef.current = fresh
    setSaveStatus('idle')
  }, [floor.id, floor.grid_rows, floor.grid_cols])

  // ── Save (defined early so keyboard handler can reference it) ────────────
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

  // Bug fix: read gridRef.current (always the latest grid) instead of captured closure.
  const autoSave = useCallback(() => {
    doSave(gridRef.current)
  }, [doSave])

  const handleSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    doSave(gridRef.current)
  }, [doSave])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const key = e.key.toUpperCase()
      for (const [type, def] of Object.entries(CELL_TYPES)) {
        if (def.shortcut === key) { setActiveTool(type); return }
      }
      // Ctrl+S to save
      if ((e.ctrlKey || e.metaKey) && key === 'S') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  // ── Canvas draw ───────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const rows = floor.grid_rows
    const cols = floor.grid_cols

    canvas.width  = cols * cellPx
    canvas.height = rows * cellPx

    // Background
    ctx.fillStyle = EMPTY_BG
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const type  = grid[r]?.[c] ?? 'empty'
        const color = CELL_TYPES[type]?.color
        if (color) {
          ctx.fillStyle = color
          ctx.fillRect(c * cellPx + 1, r * cellPx + 1, cellPx - 2, cellPx - 2)
        }
      }
    }

    // Hover ghost
    if (hover) {
      const hoverColor = CELL_TYPES[activeTool]?.color
      ctx.fillStyle = hoverColor
        ? hoverColor + '80'  // 50% opacity
        : 'rgba(255,255,255,0.1)'
      ctx.fillRect(hover.c * cellPx + 1, hover.r * cellPx + 1, cellPx - 2, cellPx - 2)
    }

    // Grid lines
    ctx.strokeStyle = GRID_LINE_COLOR
    ctx.lineWidth   = 1
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath()
      ctx.moveTo(0, r * cellPx)
      ctx.lineTo(cols * cellPx, r * cellPx)
      ctx.stroke()
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath()
      ctx.moveTo(c * cellPx, 0)
      ctx.lineTo(c * cellPx, rows * cellPx)
      ctx.stroke()
    }
  }, [grid, hover, activeTool, cellPx, floor.grid_rows, floor.grid_cols])

  useEffect(draw, [draw])

  // ── Pixel → cell coords ───────────────────────────────────────────────────
  const toCell = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const c = Math.floor((e.clientX - rect.left) / cellPx)
    const r = Math.floor((e.clientY - rect.top)  / cellPx)
    if (r < 0 || r >= floor.grid_rows || c < 0 || c >= floor.grid_cols) return null
    return { r, c }
  }

  // ── Paint logic ───────────────────────────────────────────────────────────
  const paint = useCallback((r, c, tool) => {
    setGrid(prev => {
      const next = prev.map(row => [...row])
      next[r][c] = tool
      // Keep ref in sync immediately so the debounced autoSave reads the right grid
      gridRef.current = next
      return next
    })
    // Schedule auto-save — reads gridRef.current so always gets the latest painted grid
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(autoSave, 2000)
  }, [autoSave])

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const handleMouseDown = (e) => {
    e.preventDefault()
    const cell = toCell(e)
    if (!cell) return
    const tool = e.button === 2 ? ERASER_TYPE : activeTool
    setIsPainting(true)
    paint(cell.r, cell.c, tool)
  }

  const handleMouseMove = (e) => {
    const cell = toCell(e)
    setHover(cell)
    if (!isPainting || !cell) return
    const tool = e.buttons === 2 ? ERASER_TYPE : activeTool
    paint(cell.r, cell.c, tool)
  }

  const handleMouseUp   = () => setIsPainting(false)
  const handleMouseLeave = () => { setHover(null); setIsPainting(false) }

  const handleContextMenu = (e) => e.preventDefault()

  // (save functions moved above keyboard shortcut useEffect)

  // ── Counts ────────────────────────────────────────────────────────────────
  const counts = countCells(grid)
  const W = floor.grid_cols * floor.cell_size_m
  const H = floor.grid_rows * floor.cell_size_m

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const zoomIn  = () => setZoom(z => Math.min(z + 0.25, 4))
  const zoomOut = () => setZoom(z => Math.max(z - 0.25, 0.25))

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="grid-painter-wrap">

      {/* ── Toolbar ── */}
      <div className="grid-toolbar">
        {/* Tool buttons */}
        <span className="text-xs text-gray-600 font-medium mr-1">Tool:</span>
        {Object.entries(CELL_TYPES).map(([type, def]) => {
          const Icon = def.icon
          const isActive = activeTool === type
          return (
            <button
              key={type}
              id={`grid-tool-${type}`}
              className={`tool-btn ${isActive ? 'active' : ''}`}
              style={isActive && def.color ? { color: def.color } : {}}
              onClick={() => setActiveTool(type)}
              title={`${def.label} (${def.shortcut})`}
            >
              <Icon size={13} />
              <span>{def.label}</span>
              <span
                className="text-[10px] opacity-40 ml-0.5"
                style={{ fontVariant: 'all-small-caps' }}
              >
                {def.shortcut}
              </span>
            </button>
          )
        })}

        {/* Separator */}
        <div className="flex-1" />

        {/* Zoom */}
        <div className="flex items-center gap-1 mr-2">
          <button
            id="grid-zoom-out"
            onClick={zoomOut}
            className="tool-btn px-2"
            title="Zoom out"
          >−</button>
          <span className="text-xs text-gray-500 w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            id="grid-zoom-in"
            onClick={zoomIn}
            className="tool-btn px-2"
            title="Zoom in"
          >+</button>
        </div>

        {/* Eraser shortcut */}
        <button
          id="grid-tool-eraser"
          className={`tool-btn ${activeTool === 'empty' ? 'active' : ''}`}
          onClick={() => setActiveTool('empty')}
          title="Eraser (X)"
        >
          <Eraser size={13} />
          Erase
        </button>

        {/* Save */}
        <button
          id="grid-save-btn"
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className={[
            'tool-btn ml-2 px-3',
            saveStatus === 'saved'  ? 'text-green-400 border-green-500/40' : '',
            saveStatus === 'error'  ? 'text-red-400 border-red-500/40' : '',
            saveStatus === 'saving' ? 'opacity-60' : '',
          ].join(' ')}
          style={{ borderColor: saveStatus === 'idle' ? 'rgb(99 102 241 / 0.5)' : undefined }}
        >
          {saveStatus === 'saving'
            ? <Loader2 size={13} className="animate-spin" />
            : <Save size={13} />}
          {saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save'}
        </button>
      </div>

      {/* ── Canvas ── */}
      <div ref={wrapRef} className="grid-canvas-wrap">
        <canvas
          ref={canvasRef}
          id="floor-grid-canvas"
          style={{ cursor: 'crosshair', imageRendering: 'pixelated' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* ── Status bar ── */}
      <div className="grid-status-bar">
        <span>
          <span className="text-gray-500">Grid:</span>{' '}
          <span className="text-gray-300">{floor.grid_cols} × {floor.grid_rows}</span>
        </span>
        <span>
          <span className="text-gray-500">Scale:</span>{' '}
          <span className="text-gray-300">1 cell = {floor.cell_size_m}m</span>
        </span>
        <span>
          <span className="text-gray-500">Size:</span>{' '}
          <span className="text-gray-300">{W.toFixed(0)}m × {H.toFixed(0)}m</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-gray-500">Cells:</span>
          {Object.entries(counts).map(([type, count]) => (
            <span key={type} className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-sm"
                style={{ background: CELL_TYPES[type].color }}
              />
              <span className="text-gray-400">{CELL_TYPES[type].label}:</span>
              <span className="text-gray-200">{count}</span>
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
      </div>
    </div>
  )
}
