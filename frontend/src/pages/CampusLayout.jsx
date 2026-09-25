/**
 * CampusLayout — Main page for the campus layout designer.
 *
 * Layout: two-panel
 *   Left  (280px)  — Navigation tree: Campus > Buildings > Floors
 *   Right (flex-1) — Campus map (draggable building boxes) OR floor grid painter
 *
 * State machine:
 *   view='campuses'  → welcome / campus list (right panel: campus map or placeholder)
 *   view='campus'    → selected campus → campus map with building boxes
 *   view='floor'     → selected floor → FloorGridPainter
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRightLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Edit2,
  Layers,
  LayoutGrid,
  MapPin,
  MoreHorizontal,
  Plus,
  Ruler,
  Trash2,
  X,
  GalleryHorizontalEnd,
  School,
  Loader2,
  Check,
  RefreshCw,
} from 'lucide-react'
import { campusApi, buildingsApi, floorsApi } from '../api/index'
import FloorGridPainter from '../components/FloorGridPainter'

// ---------------------------------------------------------------------------
// Floor Distances Tab — full in-page panel
// ---------------------------------------------------------------------------
function FloorDistancesTab({ floor }) {
  const [loading,   setLoading]   = useState(false)
  const [data,      setData]      = useState(null)
  const [error,     setError]     = useState(null)
  const [sortKey,   setSortKey]   = useState('asc')   // 'asc' | 'desc'
  const [filterMin, setFilterMin] = useState('')
  const [filterMax, setFilterMax] = useState('')
  const [view,      setView]      = useState('list')  // 'list' | 'matrix'

  const fetchDistances = useCallback(() => {
    setLoading(true)
    setError(null)
    floorsApi.roomDistances(floor.id)
      .then(res => { setData(res.data); setLoading(false) })
      .catch(err => { setError(err?.response?.data?.detail || err.message); setLoading(false) })
  }, [floor.id])

  useEffect(() => { fetchDistances() }, [fetchDistances])

  // ── Derived data ─────────────────────────────────────────────────────────
  const allDistances = data?.distances ?? []
  const cellSize     = data?.cell_size_m ?? floor.cell_size_m

  // Unique room IDs (for matrix axes)
  const roomIds = useMemo(() => {
    const ids = new Set()
    allDistances.forEach(d => { ids.add(d.from_room_id); ids.add(d.to_room_id) })
    return [...ids].sort()
  }, [allDistances])

  // Build O(1) lookup: `from→to` → entry
  const lookup = useMemo(() => {
    const m = {}
    allDistances.forEach(d => {
      m[d.from_room_id + '|' + d.to_room_id] = d
    })
    return m
  }, [allDistances])

  const minFilter = filterMin !== '' ? Number(filterMin) : -Infinity
  const maxFilter = filterMax !== '' ? Number(filterMax) : Infinity

  const filtered = useMemo(() => {
    // Only keep one direction (A→B where A < B lexicographically) to dedupe
    const half = allDistances.filter(d => d.from_room_id < d.to_room_id)
    return half
      .filter(d => d.distance_cells >= minFilter && d.distance_cells <= maxFilter)
      .sort((a, b) => sortKey === 'asc'
        ? a.distance_cells - b.distance_cells
        : b.distance_cells - a.distance_cells)
  }, [allDistances, sortKey, minFilter, maxFilter])

  const maxCells = useMemo(() => {
    if (!allDistances.length) return 1
    return Math.max(...allDistances.map(d => d.distance_cells))
  }, [allDistances])

  // Heat-map colour: green → amber → red scaled to maxCells
  const heatColor = (cells) => {
    const pct = cells / maxCells
    if (pct <= 0.33) return { bg: 'rgba(34,197,94,0.18)', text: '#4ade80', bar: '#22c55e' }
    if (pct <= 0.66) return { bg: 'rgba(245,158,11,0.18)', text: '#fbbf24', bar: '#f59e0b' }
    return { bg: 'rgba(239,68,68,0.18)', text: '#f87171', bar: '#ef4444' }
  }

  // Short display name for a UUID
  const short = (id) => id.slice(0, 8).toUpperCase()

  // Prefer the room name; fall back to shortened UUID
  const label = (id, name) => name || short(id)

  // Build id → name map from the current data so matrix view can look up names
  const nameMap = useMemo(() => {
    const m = {}
    allDistances.forEach(d => {
      if (d.from_room_name) m[d.from_room_id] = d.from_room_name
      if (d.to_room_name)   m[d.to_room_id]   = d.to_room_name
    })
    return m
  }, [allDistances])

  // ── Empty / error states ────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-full gap-3 text-gray-500">
      <Loader2 size={20} className="animate-spin" />
      <span className="text-sm">Computing BFS distances…</span>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 max-w-md">
        {error}
      </div>
    </div>
  )

  if (!allDistances.length) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 opacity-60">
      <Ruler size={36} className="text-indigo-400" />
      <p className="text-sm text-gray-400 font-medium">No distances available yet</p>
      <p className="text-xs text-gray-600 text-center max-w-xs">
        Paint a floor grid, then link at least two room blobs to rooms using the Grid Painter tab.
      </p>
      <button
        onClick={fetchDistances}
        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/10 transition-colors"
      >
        <RefreshCw size={11} /> Refresh
      </button>
    </div>
  )

  // ── Toolbar ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/5 bg-gray-900/40 flex-shrink-0 flex-wrap">
        {/* Stats chips */}
        <span className="text-[11px] text-gray-500">
          <span className="text-gray-300 font-semibold">{roomIds.length}</span> rooms
          &nbsp;·&nbsp;
          <span className="text-gray-300 font-semibold">{filtered.length}</span> pairs shown
          &nbsp;·&nbsp;
          1 cell = <span className="text-gray-300 font-semibold">{cellSize}m</span>
        </span>

        <div className="flex-1" />

        {/* Min / Max cell filter */}
        <label className="text-[11px] text-gray-500 flex items-center gap-1">
          Min cells
          <input
            type="number" min="0" value={filterMin}
            onChange={e => setFilterMin(e.target.value)}
            className="w-14 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-gray-300 text-xs focus:outline-none focus:border-indigo-500/50"
            placeholder="0"
          />
        </label>
        <label className="text-[11px] text-gray-500 flex items-center gap-1">
          Max cells
          <input
            type="number" min="0" value={filterMax}
            onChange={e => setFilterMax(e.target.value)}
            className="w-14 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-gray-300 text-xs focus:outline-none focus:border-indigo-500/50"
            placeholder="∞"
          />
        </label>

        {/* Sort */}
        <button
          onClick={() => setSortKey(k => k === 'asc' ? 'desc' : 'asc')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-gray-400 hover:text-gray-200 border border-white/10 hover:bg-white/5 transition-colors"
        >
          {sortKey === 'asc' ? '↑ Nearest first' : '↓ Farthest first'}
        </button>

        {/* View toggle */}
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          <button
            onClick={() => setView('list')}
            className={`px-2.5 py-1 text-[11px] transition-colors ${
              view === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setView('matrix')}
            className={`px-2.5 py-1 text-[11px] transition-colors ${
              view === 'matrix' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            Matrix
          </button>
        </div>

        <button
          onClick={fetchDistances}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          title="Refresh distances"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-3 min-h-0">

        {/* ── LIST VIEW ──────────────────────────────────────────────── */}
        {view === 'list' && (
          <table className="w-full text-xs border-separate" style={{ borderSpacing: '0 3px' }}>
            <thead>
              <tr className="text-left text-gray-600">
                <th className="pb-1 pl-3 font-semibold">#</th>
                <th className="pb-1 font-semibold">From room</th>
                <th className="pb-1 font-semibold">To room</th>
                <th className="pb-1 text-right font-semibold">Cells</th>
                <th className="pb-1 text-right font-semibold pr-3">Metres</th>
                <th className="pb-1 text-right font-semibold pr-3">Distance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => {
                const c = heatColor(d.distance_cells)
                const pct = Math.round((d.distance_cells / maxCells) * 100)
                return (
                  <tr
                    key={d.from_room_id + d.to_room_id}
                    style={{ background: c.bg }}
                    className="rounded-lg"
                  >
                    <td className="py-2 pl-3 rounded-l-lg text-gray-600">{i + 1}</td>
                    <td className="py-2 pr-4">
                      <span className="font-semibold text-gray-200">{label(d.from_room_id, d.from_room_name)}</span>
                      <span className="block text-[10px] text-gray-600 font-mono">{d.from_room_id}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="font-semibold text-gray-200">{label(d.to_room_id, d.to_room_name)}</span>
                      <span className="block text-[10px] text-gray-600 font-mono">{d.to_room_id}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums" style={{ color: c.text }}>
                      {d.distance_cells}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums text-gray-300">
                      {d.distance_m.toFixed(1)}m
                    </td>
                    <td className="py-2 pl-4 pr-3 rounded-r-lg w-32">
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: pct + '%', background: c.bar }}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* ── MATRIX VIEW ────────────────────────────────────────────── */}
        {view === 'matrix' && (
          <div className="overflow-auto">
            <table className="text-[10px] border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-900 w-24 min-w-[6rem]" />
                  {roomIds.map(id => (
                    <th
                      key={id}
                      className="px-1 pb-2 font-semibold text-gray-300 text-center whitespace-nowrap"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: '80px' }}
                      title={id}
                    >
                      {nameMap[id] || short(id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roomIds.map(fromId => (
                  <tr key={fromId}>
                    <td
                      className="sticky left-0 z-10 bg-gray-900 font-semibold text-gray-300 pr-3 py-1 whitespace-nowrap"
                      title={fromId}
                    >
                      {nameMap[fromId] || short(fromId)}
                    </td>
                    {roomIds.map(toId => {
                      if (fromId === toId) {
                        return (
                          <td key={toId} className="text-center py-1 px-1">
                            <div className="w-10 h-7 rounded flex items-center justify-center bg-white/5 text-gray-700 text-[10px]">
                              —
                            </div>
                          </td>
                        )
                      }
                      const entry = lookup[fromId + '|' + toId] || lookup[toId + '|' + fromId]
                      if (!entry) {
                        return (
                          <td key={toId} className="text-center py-1 px-1">
                            <div
                              className="w-10 h-7 rounded flex items-center justify-center text-gray-700"
                              title="Unreachable"
                            >
                              ✕
                            </div>
                          </td>
                        )
                      }
                      const c = heatColor(entry.distance_cells)
                      return (
                        <td key={toId} className="text-center py-1 px-1">
                          <div
                            className="w-10 h-7 rounded flex flex-col items-center justify-center gap-0 cursor-default"
                            style={{ background: c.bg }}
                            title={`${nameMap[fromId] || short(fromId)} → ${nameMap[toId] || short(toId)}: ${entry.distance_cells} cells (${entry.distance_m.toFixed(1)}m)`}
                          >
                            <span style={{ color: c.text }} className="font-semibold leading-none">
                              {entry.distance_cells}
                            </span>
                            <span className="text-gray-600 leading-none" style={{ fontSize: '8px' }}>
                              {entry.distance_m.toFixed(0)}m
                            </span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5 text-[10px] text-gray-500">
              <span>Distance scale:</span>
              {[
                { label: 'Short', color: '#22c55e', bg: 'rgba(34,197,94,0.18)' },
                { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.18)' },
                { label: 'Long', color: '#ef4444', bg: 'rgba(239,68,68,0.18)' },
              ].map(({ label, color, bg }) => (
                <span key={label} className="flex items-center gap-1">
                  <span
                    className="inline-block w-5 h-3 rounded"
                    style={{ background: bg, border: `1px solid ${color}` }}
                  />
                  {label}
                </span>
              ))}
              <span className="ml-2">✕ = no walkable path</span>
              <span>— = same room</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Colour palette for building boxes
// ---------------------------------------------------------------------------
const BUILDING_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f97316', '#a855f7',
]

// ---------------------------------------------------------------------------
// Small inline modal for text input (create / rename)
// ---------------------------------------------------------------------------
function InlineModal({ title, label, initial = '', onConfirm, onClose }) {
  const [value, setValue] = useState(initial)
  const [value2, setValue2] = useState('')  // used for "code" field
  const needsCode = title.toLowerCase().includes('building')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!value.trim()) return
    onConfirm(value.trim(), value2.trim().toUpperCase())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-card p-5 w-80 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 p-1 rounded-lg hover:bg-white/10">
            <X size={14} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="form-label">{label}</label>
            <input
              autoFocus
              className="form-input"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={`Enter ${label.toLowerCase()}…`}
            />
          </div>
          {needsCode && (
            <div>
              <label className="form-label">Code <span className="text-gray-600">(short, e.g. B1)</span></label>
              <input
                className="form-input"
                value={value2}
                onChange={e => setValue2(e.target.value)}
                placeholder="B1"
                maxLength={20}
              />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl text-sm text-gray-400 hover:text-gray-200 border border-white/10 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Floor settings modal (grid size + scale)
// ---------------------------------------------------------------------------
function FloorModal({ title, initial, onConfirm, onClose }) {
  const [name,    setName]    = useState(initial?.name    ?? '')
  const [level,   setLevel]   = useState(initial?.level   ?? 0)
  const [rows,    setRows]    = useState(initial?.grid_rows   ?? 20)
  const [cols,    setCols]    = useState(initial?.grid_cols   ?? 30)
  const [scale,   setScale]   = useState(initial?.cell_size_m ?? 1.0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onConfirm({ name: name.trim(), level: Number(level), grid_rows: Number(rows), grid_cols: Number(cols), cell_size_m: Number(scale) })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-card p-5 w-96 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 p-1 rounded-lg hover:bg-white/10">
            <X size={14} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="form-label">Floor name</label>
            <input autoFocus className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ground Floor" />
          </div>
          <div>
            <label className="form-label">Level number <span className="text-gray-600">(0 = ground, -1 = basement)</span></label>
            <input type="number" className="form-input" value={level} onChange={e => setLevel(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Rows <span className="text-gray-600">(5–200)</span></label>
              <input type="number" min="5" max="200" className="form-input" value={rows} onChange={e => setRows(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Columns <span className="text-gray-600">(5–200)</span></label>
              <input type="number" min="5" max="200" className="form-input" value={cols} onChange={e => setCols(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label">Cell scale (metres per cell)</label>
            <input type="number" min="0.1" max="100" step="0.1" className="form-input" value={scale} onChange={e => setScale(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
              Confirm
            </button>
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl text-sm text-gray-400 hover:text-gray-200 border border-white/10 hover:bg-white/5 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Campus Map — draggable building boxes
// ---------------------------------------------------------------------------
function CampusMap({ campus, buildings, onBuildingMove, onBuildingSelect, onAddBuilding, selectedBuildingId, onDeleteBuilding, onRenameBuilding, onAddFloor, onSelectFloor }) {
  const mapRef     = useRef(null)
  const dragging   = useRef(null)   // { id, startX, startY, origX, origY }

  const MAP_W = 1600
  const MAP_H = 900

  const startDrag = (e, building) => {
    if (e.button !== 0) return
    e.stopPropagation()
    dragging.current = {
      id: building.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: building.pos_x,
      origY: building.pos_y,
      // Bug fix: store dimensions so upper-bound clamping works
      width:  building.width  ?? 120,
      height: building.height ?? 90,
    }
  }

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return
      const dx = e.clientX - dragging.current.startClientX
      const dy = e.clientY - dragging.current.startClientY
      // Bug fix: clamp to map bounds (both lower and upper edges)
      const newX = Math.max(0, Math.min(MAP_W - (dragging.current.width  ?? 120), dragging.current.origX + dx))
      const newY = Math.max(0, Math.min(MAP_H - (dragging.current.height ?? 90),  dragging.current.origY + dy))
      onBuildingMove(dragging.current.id, newX, newY)
    }
    const onMouseUp = () => { dragging.current = null }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [onBuildingMove])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <MapPin size={14} className="text-indigo-400" />
            {campus.name} — Campus Map
          </h2>
          {campus.description && (
            <p className="text-xs text-gray-500 mt-0.5">{campus.description}</p>
          )}
        </div>
        <button
          id="add-building-btn"
          onClick={onAddBuilding}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 hover:text-indigo-200 transition-all"
        >
          <Plus size={13} /> Add Building
        </button>
      </div>

      {/* Map canvas */}
      <div className="campus-map-canvas">
        <div
          ref={mapRef}
          style={{ width: MAP_W, height: MAP_H, position: 'relative', minWidth: '100%', minHeight: '100%' }}
          onClick={() => onBuildingSelect(null)}
        >
          {buildings.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center space-y-2 opacity-40">
                <Building2 size={40} className="mx-auto text-indigo-400" />
                <p className="text-sm text-gray-400">No buildings yet.</p>
                <p className="text-xs text-gray-600">Click "Add Building" to place one on the map.</p>
              </div>
            </div>
          )}

          {buildings.map(b => (
            <div
              key={b.id}
              className={`building-box ${selectedBuildingId === b.id ? 'selected' : ''}`}
              style={{
                left:   b.pos_x,
                top:    b.pos_y,
                width:  b.width,
                height: b.height,
                color:  b.color,
                background: b.color + '22',
              }}
              onMouseDown={(e) => { startDrag(e, b); onBuildingSelect(b.id) }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                if (b.floors && b.floors.length > 0 && onSelectFloor) {
                  onSelectFloor({ ...b.floors[0], building_id: b.id })
                }
              }}
              onClick={(e) => e.stopPropagation()}
              title={b.floors?.length ? "Double click to open floor grid painter" : undefined}
            >
              <Building2 size={16} style={{ color: b.color }} className="mb-0.5" />
              <span className="text-[11px] font-bold leading-tight px-1 text-center truncate max-w-full" style={{ color: b.color }}>
                {b.name}
              </span>
              <span className="text-[9px] opacity-60 font-mono">{b.code}</span>
              
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (b.floors && b.floors.length > 0 && onSelectFloor) {
                    onSelectFloor({ ...b.floors[0], building_id: b.id })
                  } else {
                    onAddFloor(b)
                  }
                }}
                className="text-[10px] font-semibold px-2 py-0.5 mt-0.5 rounded-full bg-black/50 text-gray-200 hover:text-indigo-300 hover:bg-black/80 border border-white/10 hover:border-indigo-500/50 shadow-sm flex items-center gap-1 transition-all"
                title={b.floors?.length ? "Click to open floor plan drawing canvas" : "Click to add a floor"}
              >
                <Layers size={10} className="text-indigo-400" />
                {b.floors?.length ?? 0} {(b.floors?.length ?? 0) === 1 ? 'floor' : 'floors'}
              </button>

              {/* Floor quick-links when building is selected */}
              {selectedBuildingId === b.id && b.floors && b.floors.length > 0 && (
                <div 
                  className="flex flex-wrap gap-1 justify-center mt-1 max-w-full px-1"
                  onClick={e => e.stopPropagation()}
                >
                  {b.floors.map(fl => (
                    <button
                      key={fl.id}
                      onClick={() => onSelectFloor && onSelectFloor({ ...fl, building_id: b.id })}
                      className="px-1.5 py-0.5 text-[9px] rounded font-medium bg-indigo-600/40 hover:bg-indigo-600 text-indigo-100 border border-indigo-400/30 transition-colors"
                      title={`Open ${fl.name} drawing canvas`}
                    >
                      {fl.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Context actions (visible when selected) */}
              {selectedBuildingId === b.id && (
                <div
                  className="absolute -top-1 -right-1 flex gap-0.5"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    title="Add floor"
                    onClick={() => onAddFloor(b)}
                    className="w-5 h-5 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center transition-colors shadow-md"
                  >
                    <Plus size={9} className="text-white" />
                  </button>
                  <button
                    title="Rename"
                    onClick={() => onRenameBuilding(b)}
                    className="w-5 h-5 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-colors shadow-md"
                  >
                    <Edit2 size={9} className="text-white" />
                  </button>
                  <button
                    title="Delete building"
                    onClick={() => onDeleteBuilding(b)}
                    className="w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors shadow-md"
                  >
                    <Trash2 size={9} className="text-white" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tree Node
// ---------------------------------------------------------------------------
function TreeNode({ depth = 0, icon: Icon, label, isActive, isExpanded, hasChildren, onToggle, onClick, actions }) {
  return (
    <div
      className={`tree-node ${isActive ? 'active' : ''}`}
      style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
      onClick={onClick}
    >
      {/* expand chevron */}
      <span
        className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-600"
        onClick={(e) => { e.stopPropagation(); onToggle?.() }}
      >
        {hasChildren
          ? isExpanded
            ? <ChevronDown size={12} />
            : <ChevronRight size={12} />
          : null}
      </span>
      <Icon size={13} className="shrink-0 opacity-70" />
      <span className="flex-1 truncate text-gray-300">{label}</span>
      {actions && (
        <span className="shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {actions}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main CampusLayout Page
// ---------------------------------------------------------------------------
export default function CampusLayout() {
  const [campuses,        setCampuses]        = useState([])
  const [loading,         setLoading]         = useState(true)

  // Expanded sets
  const [expandedCampuses,  setExpandedCampuses]  = useState(new Set())
  const [expandedBuildings, setExpandedBuildings] = useState(new Set())

  // Selection
  const [activeCampus,  setActiveCampus]  = useState(null)   // campus object
  const [activeFloor,   setActiveFloor]   = useState(null)   // floor object (with grid_data)
  const [selBuilding,   setSelBuilding]   = useState(null)   // building id on campus map

  // Buildings cache: { [campusId]: [...] }
  const [buildingsMap, setBuildingsMap] = useState({})

  // Dragged building live positions
  const [livePos, setLivePos] = useState({}) // { [buildingId]: { x, y } }

  // Modals
  const [modal, setModal] = useState(null)
  // { type: 'campus'|'building'|'rename-campus'|'rename-building'|'floor'|'rename-floor', data }

  // Active tab when viewing a floor: 'painter' | 'distances'
  const [floorTab, setFloorTab] = useState('painter')

  // Save debounce ref for building position
  const posTimer = useRef({})

  // ── Load buildings for a campus ──────────────────────────────────────────
  // Used for targeted refreshes (after create/delete/rename operations).
  const loadBuildings = useCallback(async (campusId) => {
    if (!campusId) return
    try {
      const res = await campusApi.buildings(campusId)
      setBuildingsMap(prev => ({ ...prev, [campusId]: res.data }))
    } catch (err) {
      console.error('Failed to load buildings for campus', campusId, err)
    }
  }, [])

  // ── Load campuses ──────────────────────────────────────────────────────────
  const loadCampuses = useCallback(async () => {
    setLoading(true)
    try {
      const res = await campusApi.list()
      const campusList = res.data
      setCampuses(campusList)

      // Fetch every campus's buildings in parallel, then commit in ONE atomic
      // setBuildingsMap call. The previous approach called setBuildingsMap
      // inside each individual loadBuildings(), which caused each resolved
      // promise to trigger a separate state update at a different microtask
      // tick. React 18 batches within a single tick, but not across ticks, so
      // setExpandedCampuses could fire before all buildings were committed,
      // causing the tree to expand against an empty buildingsMap.
      const entries = await Promise.all(
        campusList.map(async c => {
          try {
            const r = await campusApi.buildings(c.id)
            return [c.id, r.data]
          } catch {
            return [c.id, []]
          }
        })
      )
      // Single atomic update — React 18 batches this with the sets below.
      setBuildingsMap(prev => ({ ...prev, ...Object.fromEntries(entries) }))

      if (campusList.length > 0) {
        setExpandedCampuses(prev => (prev.size === 0 ? new Set([campusList[0].id]) : prev))
        setActiveCampus(prev => prev ?? campusList[0])
      }
    } finally {
      setLoading(false)
    }
  }, [])  // no dependency on loadBuildings — buildings are fetched inline

  useEffect(() => { loadCampuses() }, [loadCampuses])

  // ── Toggle expand for campus node ──────────────────────────────────────────
  const toggleCampus = (campus) => {
    setExpandedCampuses(prev => {
      const next = new Set(prev)
      if (next.has(campus.id)) { next.delete(campus.id) }
      else {
        next.add(campus.id)
        if (!buildingsMap[campus.id]) loadBuildings(campus.id)
      }
      return next
    })
  }

  const toggleBuilding = (buildingId) => {
    setExpandedBuildings(prev => {
      const next = new Set(prev)
      next.has(buildingId) ? next.delete(buildingId) : next.add(buildingId)
      return next
    })
  }

  // ── Select campus → show map (always force-reload buildings) ────────────────
  const selectCampus = (campus) => {
    setActiveCampus(campus)
    setActiveFloor(null)
    setSelBuilding(null)
    // Always reload so the map is fresh after any create/delete
    loadBuildings(campus.id)
    // Always expand in the tree
    setExpandedCampuses(prev => new Set([...prev, campus.id]))
  }

  // ── Select floor → load full data with grid ────────────────────────────
  const selectFloor = async (floor) => {
    try {
      const res = await floorsApi.get(floor.id)
      setActiveFloor(res.data)
    } catch (err) {
      console.error('Failed to load floor', floor.id, err)
    }
  }

  // ── Close floor → return smoothly to campus map ───────────────────────────
  const handleCloseFloor = useCallback(() => {
    // Bug fix: don't nest setState updater calls — use setActiveFloor with an
    // updater that captures the previous floor, then defers side-effects via
    // a microtask (Promise.resolve) so sibling setState calls happen outside
    // of any updater function (safe in both legacy and concurrent React mode).
    setActiveFloor(prevFloor => {
      if (prevFloor) {
        const bldgId = prevFloor.building_id
        if (bldgId) {
          Promise.resolve().then(() => {
            setSelBuilding(bldgId)
            setBuildingsMap(currentMap => {
              for (const [cId, bList] of Object.entries(currentMap)) {
                if (bList.some(b => b.id === bldgId)) {
                  setCampuses(currentCampuses => {
                    const camp = currentCampuses.find(c => c.id === cId)
                    if (camp) {
                      setActiveCampus(camp)
                      loadBuildings(cId)
                    }
                    return currentCampuses
                  })
                  break
                }
              }
              return currentMap
            })
          })
        }
      }
      return null
    })
  }, [loadBuildings])

  // ── Building position drag (live update + debounced save) ──────────────────
  const handleBuildingMove = useCallback((buildingId, x, y) => {
    setLivePos(prev => ({ ...prev, [buildingId]: { x, y } }))
    clearTimeout(posTimer.current[buildingId])
    posTimer.current[buildingId] = setTimeout(async () => {
      try {
        await buildingsApi.update(buildingId, { pos_x: Math.round(x), pos_y: Math.round(y) })
        // Update in cache
        setBuildingsMap(prev => {
          const next = { ...prev }
          for (const [cId, bList] of Object.entries(next)) {
            next[cId] = bList.map(b => b.id === buildingId ? { ...b, pos_x: Math.round(x), pos_y: Math.round(y) } : b)
          }
          return next
        })
      } catch {/* ignore */}
    }, 800)
  }, [])

  // ── Resolve building list for active campus (with live positions) ──────────
  const resolvedBuildings = activeCampus
    ? (buildingsMap[activeCampus.id] ?? []).map(b => {
        const live = livePos[b.id]
        return live ? { ...b, pos_x: live.x, pos_y: live.y } : b
      })
    : []

  // ===========================================================================
  // Modal handlers
  // ===========================================================================

  // Create campus
  const handleCreateCampus = async (name, _) => {
    await campusApi.create({ name })
    setModal(null)
    loadCampuses()
  }

  // Rename campus
  const handleRenameCampus = async (name) => {
    await campusApi.update(modal.data.id, { name })
    setCampuses(prev => prev.map(c => c.id === modal.data.id ? { ...c, name } : c))
    if (activeCampus?.id === modal.data.id) setActiveCampus(p => ({ ...p, name }))
    setModal(null)
  }

  // Delete campus
  const handleDeleteCampus = async (campus) => {
    if (!window.confirm(`Delete campus "${campus.name}" and all its buildings and floors?`)) return
    await campusApi.remove(campus.id)
    setCampuses(prev => prev.filter(c => c.id !== campus.id))
    if (activeCampus?.id === campus.id) setActiveCampus(null)
    setActiveFloor(null)
  }

  // Create building
  const handleCreateBuilding = async (name, code) => {
    const campusId = modal.data.id
    const existingBldgs = buildingsMap[campusId] ?? []
    const existingCodes = new Set(existingBldgs.map(b => b.code))
    const colorIdx = existingBldgs.length % BUILDING_COLORS.length
    const pos_x = 40 + (existingBldgs.length % 5) * 160
    const pos_y = 40 + Math.floor(existingBldgs.length / 5) * 120

    // Determine code: prefer user input, then auto-generate a unique one.
    // Auto-generation increments a suffix to avoid duplicate-code errors.
    let resolvedCode
    if (code) {
      if (existingCodes.has(code)) {
        // User explicitly typed a code that's already taken → tell them.
        alert(`Building code "${code}" already exists in this campus. Please choose a different code.`)
        return
      }
      resolvedCode = code
    } else {
      const base = name.slice(0, 2).toUpperCase() || 'BL'
      resolvedCode = base
      let suffix = 1
      while (existingCodes.has(resolvedCode)) {
        resolvedCode = base + (++suffix)
      }
    }

    try {
      const resp = await buildingsApi.create({
        campus_id: campusId,
        name,
        code: resolvedCode,
        color: BUILDING_COLORS[colorIdx],
        pos_x,
        pos_y,
      })
      const newBuilding = resp.data
      setModal(null)
      // Optimistic update: add to state immediately so the box appears
      setBuildingsMap(prev => ({
        ...prev,
        [campusId]: [...(prev[campusId] ?? []), newBuilding],
      }))
      setActiveCampus(prev => prev?.id === campusId ? prev : campuses.find(c => c.id === campusId) ?? prev)
      setActiveFloor(null)
      setExpandedCampuses(prev => new Set([...prev, campusId]))
      setSelBuilding(newBuilding.id)
      // Reload in background for consistency
      loadBuildings(campusId)
    } catch (err) {
      console.error('Failed to create building:', err)
      // Surface the server error to the user (e.g. duplicate code constraint)
      alert(`Could not create building: ${err.message || 'Unknown error. Check that the code is unique.'}`)
    }
  }

  // Rename building
  const handleRenameBuilding = async (name, code) => {
    const b = modal.data
    await buildingsApi.update(b.id, { name, code: code || b.code })
    setModal(null)
    await loadBuildings(b.campus_id)
  }

  // Delete building
  const handleDeleteBuilding = async (b) => {
    if (!window.confirm(`Delete building "${b.name}" and all its floors?`)) return
    await buildingsApi.remove(b.id)
    await loadBuildings(b.campus_id)
    setSelBuilding(null)
    if (activeFloor?.building_id === b.id) setActiveFloor(null)
  }

  // Create floor
  const handleCreateFloor = async (data) => {
    const building = modal.data
    const targetCampusId =
      building.campus_id ||
      activeCampus?.id ||
      campuses.find(c => (buildingsMap[c.id] ?? []).some(b => b.id === building.id))?.id

    try {
      const newFloor = await floorsApi.create({ ...data, building_id: building.id })
      setModal(null)

      const floorSummary = {
        id: newFloor.data.id,
        name: newFloor.data.name,
        level: newFloor.data.level,
        // Bug fix: include building_id so handleDeleteFloor / handleRenameFloor work
        // when accessing the floor from the tree node without a separate fetch.
        building_id: building.id,
      }

      // Optimistic update of buildingsMap immediately so the building box and tree reflect the new floor
      setBuildingsMap(prev => {
        const next = { ...prev }
        for (const [cId, bList] of Object.entries(next)) {
          next[cId] = bList.map(b => {
            if (b.id === building.id) {
              const currentFloors = b.floors ?? []
              const exists = currentFloors.some(f => f.id === floorSummary.id)
              const updated = exists
                ? currentFloors
                : [...currentFloors, floorSummary].sort((a, b) => a.level - b.level)
              return { ...b, floors: updated }
            }
            return b
          })
        }
        return next
      })

      // Ensure building is expanded in tree
      setExpandedBuildings(prev => new Set([...prev, building.id]))
      setSelBuilding(building.id)

      if (targetCampusId) {
        setExpandedCampuses(prev => new Set([...prev, targetCampusId]))
        loadBuildings(targetCampusId)
      }

      // Auto-open the floor grid painter for the newly created floor
      selectFloor(floorSummary)
    } catch (err) {
      console.error('Failed to create floor:', err)
    }
  }

  // Rename floor
  const handleRenameFloor = async (data) => {
    const floor = modal.data
    await floorsApi.update(floor.id, data)
    setModal(null)
    // Reload from server (in case grid size changed)
    const full = await floorsApi.get(floor.id)
    if (activeFloor?.id === floor.id) setActiveFloor(full.data)
    // Refresh building tree
    const bRes = await buildingsApi.get(floor.building_id)
    setBuildingsMap(prev => {
      const next = { ...prev }
      for (const [cId, bList] of Object.entries(next)) {
        if (bList.find(b => b.id === floor.building_id)) {
          next[cId] = bList.map(b => b.id === floor.building_id ? { ...b, floors: bRes.data.floors } : b)
        }
      }
      return next
    })
  }

  // Delete floor
  const handleDeleteFloor = async (floor) => {
    if (!window.confirm(`Delete floor "${floor.name}"?`)) return
    await floorsApi.remove(floor.id)
    if (activeFloor?.id === floor.id) handleCloseFloor()
    // Refresh buildings
    const bRes = await buildingsApi.get(floor.building_id)
    setBuildingsMap(prev => {
      const next = { ...prev }
      for (const [cId, bList] of Object.entries(next)) {
        if (bList.find(b => b.id === floor.building_id)) {
          next[cId] = bList.map(b => b.id === floor.building_id ? { ...b, floors: bRes.data.floors } : b)
        }
      }
      return next
    })
  }

  // ===========================================================================
  // Render helpers
  // ===========================================================================

  const renderRightPanel = () => {
    if (activeFloor) {
      return (
        <div className="flex flex-col h-full">
          {/* Floor header with tab bar */}
          <div className="flex flex-col flex-shrink-0">
            {/* Top bar — navigation + floor info + actions */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-gray-900/60">
              <button
                onClick={handleCloseFloor}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-100 hover:bg-white/10 transition-all border border-white/5"
                title="Back to Campus Map"
              >
                <ArrowLeft size={13} /> Back to Map
              </button>
              <div className="h-4 w-px bg-white/10" />
              <Layers size={15} className="text-indigo-400" />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-gray-200 truncate">{activeFloor.name}</h2>
                <p className="text-[11px] text-gray-500">
                  {activeFloor.grid_cols} × {activeFloor.grid_rows} cells &nbsp;·&nbsp;
                  1 cell = {activeFloor.cell_size_m}m &nbsp;·&nbsp;
                  Level {activeFloor.level}
                </p>
              </div>
              <button
                onClick={() => setModal({ type: 'rename-floor', data: activeFloor })}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-all"
                title="Edit floor settings"
              >
                <Edit2 size={13} />
              </button>
              <button
                onClick={handleCloseFloor}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/10 transition-all"
                title="Close floor"
              >
                <X size={13} />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-0 px-5 border-b border-white/10 bg-gray-900/40">
              <button
                onClick={() => setFloorTab('painter')}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-all ${
                  floorTab === 'painter'
                    ? 'border-indigo-500 text-indigo-300'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <LayoutGrid size={12} /> Grid Painter
              </button>
              <button
                onClick={() => setFloorTab('distances')}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-all ${
                  floorTab === 'distances'
                    ? 'border-indigo-500 text-indigo-300'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <ArrowRightLeft size={12} /> Room Distances
              </button>
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {floorTab === 'painter' && (
              <FloorGridPainter
                floor={activeFloor}
                onSaved={(updated) => setActiveFloor(updated)}
              />
            )}
            {floorTab === 'distances' && (
              <FloorDistancesTab floor={activeFloor} />
            )}
          </div>
        </div>
      )
    }

    if (activeCampus) {
      return (
        <CampusMap
          campus={activeCampus}
          buildings={resolvedBuildings}
          selectedBuildingId={selBuilding}
          onBuildingMove={handleBuildingMove}
          onBuildingSelect={setSelBuilding}
          onAddBuilding={() => setModal({ type: 'building', data: activeCampus })}
          onDeleteBuilding={handleDeleteBuilding}
          onRenameBuilding={(b) => setModal({ type: 'rename-building', data: b })}
          onAddFloor={(b) => setModal({ type: 'floor', data: b })}
          onSelectFloor={selectFloor}
        />
      )
    }

    // Default welcome screen
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3 opacity-50">
          <GalleryHorizontalEnd size={48} className="mx-auto text-indigo-400" />
          <p className="text-sm text-gray-300 font-medium">Select a campus or floor from the tree</p>
          <p className="text-xs text-gray-500">or create a new campus to get started</p>
        </div>
      </div>
    )
  }

  // ===========================================================================
  // Main render
  // ===========================================================================
  return (
    <div className="campus-layout -m-6 overflow-hidden">
      {/* ══════════════════════════════════════════════════════════════
          LEFT PANEL — Navigation tree
         ══════════════════════════════════════════════════════════════ */}
      <div className="campus-tree bg-gray-900/50">
        {/* Tree header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 flex-shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600 flex items-center gap-1.5">
            <School size={10} /> Campus Layout
          </span>
          <button
            id="add-campus-btn"
            onClick={() => setModal({ type: 'campus' })}
            className="w-5 h-5 rounded-md flex items-center justify-center text-gray-500 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all"
            title="New campus"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Tree body */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-indigo-400" />
            </div>
          )}

          {!loading && campuses.length === 0 && (
            <div className="text-center py-8 space-y-1">
              <p className="text-xs text-gray-600">No campuses yet.</p>
              <button
                onClick={() => setModal({ type: 'campus' })}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                Create one
              </button>
            </div>
          )}

          {campuses.map(campus => {
            const expanded  = expandedCampuses.has(campus.id)
            const buildings = buildingsMap[campus.id] ?? []
            const isActiveCampus = activeCampus?.id === campus.id && !activeFloor

            return (
              <div key={campus.id} className="group">
                {/* Campus node */}
                <div
                  className={`tree-node ${isActiveCampus ? 'active' : ''} group relative`}
                  // Row click: always SELECT (expand, show map). Only the chevron toggles collapse.
                  onClick={() => selectCampus(campus)}
                >
                  <span
                    className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-600 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); toggleCampus(campus) }}
                  >
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  <School size={13} className="shrink-0 text-indigo-400 opacity-80" />
                  <span className="flex-1 truncate font-medium text-gray-200">{campus.name}</span>
                  {/* Campus actions */}
                  <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      title="Rename campus"
                      onClick={(e) => { e.stopPropagation(); setModal({ type: 'rename-campus', data: campus }) }}
                      className="w-5 h-5 rounded flex items-center justify-center text-gray-600 hover:text-gray-200 hover:bg-white/10"
                    ><Edit2 size={10} /></button>
                    <button
                      title="Add building"
                      onClick={(e) => { e.stopPropagation(); selectCampus(campus); setModal({ type: 'building', data: campus }) }}
                      className="w-5 h-5 rounded flex items-center justify-center text-gray-600 hover:text-green-300 hover:bg-green-500/10"
                    ><Plus size={10} /></button>
                    <button
                      title="Delete campus"
                      onClick={(e) => { e.stopPropagation(); handleDeleteCampus(campus) }}
                      className="w-5 h-5 rounded flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10"
                    ><Trash2 size={10} /></button>
                  </span>
                </div>

                {/* Buildings */}
                {expanded && buildings.map(building => {
                  const bExpanded = expandedBuildings.has(building.id)
                  const floors    = building.floors ?? []

                  return (
                    <div key={building.id} className="group">
                      {/* Building node */}
                      <div
                        className={`tree-node group relative ${selBuilding === building.id && !activeFloor ? 'active' : ''}`}
                        style={{ paddingLeft: '1.4rem' }}
                        onClick={() => {
                          toggleBuilding(building.id)
                          if (!activeCampus || activeCampus.id !== campus.id) {
                            setActiveCampus(campus)
                          }
                          loadBuildings(campus.id)
                          setActiveFloor(null)
                          setSelBuilding(building.id)
                        }}
                      >
                        <span
                          className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-300 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); toggleBuilding(building.id) }}
                          title={bExpanded ? "Collapse building" : "Expand building"}
                        >
                          {bExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <Building2 size={12} style={{ color: building.color }} className="shrink-0 opacity-80" />
                        <span className="flex-1 truncate text-gray-300 text-xs flex items-center gap-1.5 min-w-0">
                          <span className="truncate font-medium">{building.name}</span>
                          <span className="text-[10px] text-gray-500 font-mono shrink-0">{building.code}</span>
                        </span>

                        {/* Floor count badge */}
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono shrink-0 transition-all ${
                            floors.length > 0
                              ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25'
                              : 'bg-white/5 text-gray-500 border border-white/10'
                          }`}
                          title={`${floors.length} floor(s)`}
                        >
                          {floors.length} {floors.length === 1 ? 'floor' : 'floors'}
                        </span>

                        {/* Building actions */}
                        <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                          <button
                            title="Add floor"
                            onClick={(e) => { e.stopPropagation(); setModal({ type: 'floor', data: building }) }}
                            className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-green-300 hover:bg-green-500/10"
                          ><Plus size={10} /></button>
                          <button
                            title="Rename building"
                            onClick={(e) => { e.stopPropagation(); setModal({ type: 'rename-building', data: building }) }}
                            className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-white/10"
                          ><Edit2 size={10} /></button>
                          <button
                            title="Delete building"
                            onClick={(e) => { e.stopPropagation(); handleDeleteBuilding(building) }}
                            className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                          ><Trash2 size={10} /></button>
                        </span>
                      </div>

                      {/* Floors Dropdown Section */}
                      {bExpanded && (
                        <div>
                          {floors.length === 0 ? (
                            <div
                              className="flex items-center justify-between text-[11px] text-gray-500 py-1.5 pr-2.5"
                              style={{ paddingLeft: '2.8rem' }}
                            >
                              <span className="italic text-gray-500 text-[10px]">0 floors</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setModal({ type: 'floor', data: building }) }}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline"
                              >
                                <Plus size={10} /> Add Floor
                              </button>
                            </div>
                          ) : (
                            floors.map(floor => (
                              <div
                                key={floor.id}
                                className={`tree-node group relative ${activeFloor?.id === floor.id ? 'active' : ''}`}
                                style={{ paddingLeft: '2.7rem' }}
                                onClick={() => selectFloor(floor)}
                              >
                                <span className="shrink-0 w-4 h-4" />
                                <Layers size={11} className="shrink-0 text-gray-400 opacity-70" />
                                <span className="flex-1 truncate text-gray-300 text-xs">
                                  {floor.name}
                                  <span className="ml-1 text-[10px] text-gray-500">L{floor.level}</span>
                                </span>
                                {/* Floor actions */}
                                <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    title="Edit floor settings"
                                    onClick={(e) => { e.stopPropagation(); setModal({ type: 'rename-floor', data: { ...floor, building_id: building.id } }) }}
                                    className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-white/10"
                                  ><Edit2 size={10} /></button>
                                  <button
                                    title="Delete floor"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteFloor({ ...floor, building_id: building.id }) }}
                                    className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                                  ><Trash2 size={10} /></button>
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </nav>


      </div>

      {/* ══════════════════════════════════════════════════════════════
          RIGHT PANEL — Map or grid painter
         ══════════════════════════════════════════════════════════════ */}
      <div className="campus-content bg-gray-950">
        {renderRightPanel()}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MODALS
         ══════════════════════════════════════════════════════════════ */}
      {modal?.type === 'campus' && (
        <InlineModal
          title="New Campus"
          label="Campus name"
          onConfirm={handleCreateCampus}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'rename-campus' && (
        <InlineModal
          title="Rename Campus"
          label="Campus name"
          initial={modal.data.name}
          onConfirm={handleRenameCampus}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'building' && (
        <InlineModal
          title="New Building"
          label="Building name"
          onConfirm={handleCreateBuilding}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'rename-building' && (
        <InlineModal
          title="Rename Building"
          label="Building name"
          initial={modal.data.name}
          onConfirm={handleRenameBuilding}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'floor' && (
        <FloorModal
          title="New Floor"
          onConfirm={handleCreateFloor}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'rename-floor' && (
        <FloorModal
          title="Edit Floor Settings"
          initial={modal.data}
          onConfirm={handleRenameFloor}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
