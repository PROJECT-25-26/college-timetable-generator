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
  ArrowUpDown,
  Save,
  Link2,
  AlertCircle,
  Network,
  DoorOpen,
  Users,
  Route,
  ChevronDown as ChevronDownIcon,
  Navigation,
  Footprints,
} from 'lucide-react'
import { campusApi, buildingsApi, floorsApi, teachersApi, timetablesApi } from '../api/index'
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
// Entrance Pair Distance Panel (Per-gate inter-building distances)
// ---------------------------------------------------------------------------
function EntrancePairsPanel({ campusId, buildings, onClose }) {
  const [gates,        setGates]        = useState([])
  const [pairs,        setPairs]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [error,        setError]        = useState(null)

  const [srcGateKey, setSrcGateKey] = useState('')
  const [tgtGateKey, setTgtGateKey] = useState('')
  const [distM,      setDistM]      = useState('')

  const loadData = useCallback(() => {
    if (!campusId) return
    setLoading(true)
    setError(null)
    Promise.all([
      campusApi.gates(campusId),
      campusApi.entrancePairs(campusId),
    ])
      .then(([gRes, pRes]) => {
        setGates(Array.isArray(gRes?.data) ? gRes.data : [])
        setPairs(Array.isArray(pRes?.data) ? pRes.data : [])
      })
      .catch(err => setError(err?.message || 'Failed to load entrance pair data'))
      .finally(() => setLoading(false))
  }, [campusId])

  useEffect(() => { loadData() }, [loadData])

  const gateKey = (g) => `${g.floor_id}:${g.row},${g.col}`
  const gateLabelText = (g) => {
    const lbl = g.label ? `"${g.label}"` : `Gate at (${g.row + 1},${g.col + 1})`
    return `[${g.building_name} • ${g.floor_name}] ${lbl}`
  }

  const handleAddPair = () => {
    if (!srcGateKey || !tgtGateKey || !distM || isNaN(Number(distM))) return
    const srcGate = gates.find(g => gateKey(g) === srcGateKey)
    const tgtGate = gates.find(g => gateKey(g) === tgtGateKey)
    if (!srcGate || !tgtGate) return
    if (srcGateKey === tgtGateKey) {
      setError('Source and destination gate cannot be identical.')
      return
    }

    const newEntry = {
      floor_a_id:   srcGate.floor_id,
      gate_a_row:   srcGate.row,
      gate_a_col:   srcGate.col,
      gate_a_label: srcGate.label || `Gate (${srcGate.row + 1},${srcGate.col + 1})`,
      floor_b_id:   tgtGate.floor_id,
      gate_b_row:   tgtGate.row,
      gate_b_col:   tgtGate.col,
      gate_b_label: tgtGate.label || `Gate (${tgtGate.row + 1},${tgtGate.col + 1})`,
      distance_m:   Number(distM),
    }

    setPairs(prev => [...prev, newEntry])
    setSrcGateKey('')
    setTgtGateKey('')
    setDistM('')
    setSaved(false)
    setError(null)
  }

  const handleRemovePair = (index) => {
    setPairs(prev => prev.filter((_, i) => i !== index))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await campusApi.saveEntrancePairs(campusId, pairs)
      setPairs(Array.isArray(res?.data) ? res.data : pairs)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save entrance pair distances')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inter-bldg-panel">
      {/* Header */}
      <div className="inter-bldg-header">
        <DoorOpen size={14} className="text-amber-400" />
        <span>Entrance Pair Distances</span>
        <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors" title="Close">
          <X size={13} />
        </button>
      </div>

      {/* Description */}
      <div className="inter-bldg-desc">
        <AlertCircle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Configure exact outdoor walking distances between specific building gates. The shortest-path engine picks the optimal gate pair for cross-building journeys.
        </p>
      </div>

      {/* Body */}
      <div className="inter-bldg-body space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-500 text-xs">
            <Loader2 size={14} className="animate-spin text-amber-400" /> Loading campus gates…
          </div>
        ) : (
          <>
            {/* Add New Link Form */}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
              <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider block">
                + Add Gate-to-Gate Distance Link
              </span>

              {gates.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No gate cells painted yet. Open a floor grid painter and paint "Gate" cells on your floor plans first.
                </p>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 font-medium">From Gate</label>
                    <select
                      className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10 text-gray-200 outline-none focus:border-amber-500"
                      value={srcGateKey}
                      onChange={e => setSrcGateKey(e.target.value)}
                    >
                      <option value="">— Select Source Gate —</option>
                      {gates.map(g => (
                        <option key={gateKey(g)} value={gateKey(g)}>
                          {gateLabelText(g)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 font-medium">To Gate</label>
                    <select
                      className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10 text-gray-200 outline-none focus:border-amber-500"
                      value={tgtGateKey}
                      onChange={e => setTgtGateKey(e.target.value)}
                    >
                      <option value="">— Select Target Gate —</option>
                      {gates.map(g => (
                        <option key={gateKey(g)} value={gateKey(g)}>
                          {gateLabelText(g)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] text-gray-400 font-medium">Walking Distance (metres)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="e.g. 45"
                        className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10 text-gray-200 outline-none focus:border-amber-500"
                        value={distM}
                        onChange={e => setDistM(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddPair}
                      disabled={!srcGateKey || !tgtGateKey || !distM}
                      className="mt-4 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white transition-all shadow-md shrink-0"
                    >
                      Add Pair
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* List of configured entrance pair rules */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
                Configured Entrance Links ({pairs.length})
              </span>

              {pairs.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">
                  No entrance pair distance overrides configured yet. The engine will use the default building-to-building distances as fallback.
                </p>
              ) : (
                pairs.map((p, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-amber-300 font-semibold truncate">
                        <span>🚪 {p.gate_a_label || 'Gate A'}</span>
                        <span className="text-gray-500 text-[10px]">↔</span>
                        <span>🚪 {p.gate_b_label || 'Gate B'}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {p.floor_a_id.slice(0, 8)}… ↔ {p.floor_b_id.slice(0, 8)}…
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-extrabold text-white font-mono bg-white/10 px-2 py-0.5 rounded text-xs">
                        {p.distance_m} m
                      </span>
                      <button
                        onClick={() => handleRemovePair(idx)}
                        className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                        title="Remove link"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="inter-bldg-footer">
        {error && (
          <p className="text-[11px] text-red-400 flex items-center gap-1 mb-1">
            <AlertCircle size={11} /> {error}
          </p>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`inter-bldg-save-btn ${ saved ? 'saved' : '' }`}
        >
          {saving
            ? <Loader2 size={12} className="animate-spin" />
            : saved
              ? <Check size={12} />
              : <Save size={12} />}
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Entrance Links'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Room Distance Calculator Panel
// ---------------------------------------------------------------------------
function RoomDistanceCalculatorPanel({ campusId, onClose }) {
  const [rooms,         setRooms]         = useState([])
  const [loadingRooms,  setLoadingRooms]  = useState(true)
  const [fromRoomId,    setFromRoomId]    = useState('')
  const [toRoomId,      setToRoomId]      = useState('')
  const [result,        setResult]        = useState(null)
  const [calculating,   setCalculating]   = useState(false)
  const [error,         setError]         = useState(null)

  useEffect(() => {
    if (!campusId) return
    let cancelled = false
    setLoadingRooms(true)
    campusApi.mappedRooms(campusId)
      .then(res => {
        if (cancelled) return
        const list = Array.isArray(res?.data) ? res.data : []
        setRooms(list)
        if (list.length >= 2) {
          setFromRoomId(list[0].id)
          setToRoomId(list[1].id)
        } else if (list.length === 1) {
          setFromRoomId(list[0].id)
        }
      })
      .catch(err => {
        if (!cancelled) setError(err?.message || 'Failed to load mapped rooms')
      })
      .finally(() => {
        if (!cancelled) setLoadingRooms(false)
      })
    return () => { cancelled = true }
  }, [campusId])

  useEffect(() => {
    if (!campusId || !fromRoomId || !toRoomId) {
      setResult(null)
      return
    }
    let cancelled = false
    setCalculating(true)
    campusApi.calculateRoomDistance(campusId, fromRoomId, toRoomId)
      .then(res => {
        if (!cancelled) setResult(res?.data)
      })
      .catch(err => {
        if (!cancelled) setError(err?.message || 'Calculation error')
      })
      .finally(() => {
        if (!cancelled) setCalculating(false)
      })
    return () => { cancelled = true }
  }, [campusId, fromRoomId, toRoomId])

  const handleSwap = () => {
    const temp = fromRoomId
    setFromRoomId(toRoomId)
    setToRoomId(temp)
  }

  const fromRoom = rooms.find(r => r.id === fromRoomId)
  const toRoom   = rooms.find(r => r.id === toRoomId)

  const roomGroups = useMemo(() => {
    const map = {}
    for (const r of rooms) {
      const bname = r.building_name || 'Unassigned Building'
      if (!map[bname]) map[bname] = []
      map[bname].push(r)
    }
    return map
  }, [rooms])

  return (
    <div className="inter-bldg-panel">
      {/* Header */}
      <div className="inter-bldg-header">
        <Ruler size={14} className="text-indigo-400" />
        <span>Room Distance Calculator</span>
        <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors" title="Close">
          <X size={13} />
        </button>
      </div>

      {/* Description */}
      <div className="inter-bldg-desc">
        <AlertCircle size={11} className="text-indigo-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Find exact walking distance between any two rooms across floors or buildings. Uses shortest-path BFS routing and tagged stairwells.
        </p>
      </div>

      {/* Body */}
      <div className="inter-bldg-body space-y-4">
        {loadingRooms ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-500 text-xs">
            <Loader2 size={14} className="animate-spin" /> Loading campus mapped rooms…
          </div>
        ) : rooms.length < 2 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <Building2 size={32} className="text-indigo-400 opacity-40" />
            <p className="text-xs text-gray-500">Map at least 2 rooms on your floor grid canvas to calculate distance.</p>
          </div>
        ) : (
          <>
            {/* From Room */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin size={11} className="text-emerald-400" /> From Room
              </label>
              <select
                className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-gray-200 outline-none focus:border-indigo-500 focus:bg-white/10 transition-all cursor-pointer"
                value={fromRoomId}
                onChange={e => setFromRoomId(e.target.value)}
              >
                {Object.entries(roomGroups).map(([bname, bRooms]) => (
                  <optgroup key={bname} label={bname} className="bg-[#1e2030] text-gray-300 font-semibold">
                    {bRooms.map(r => (
                      <option key={r.id} value={r.id} className="bg-[#1e2030] text-gray-200">
                        [{r.floor_name || 'Floor'}] {r.name} {r.code ? `(${r.code})` : ''} — {r.type}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {fromRoom && (
                <div className="flex items-center gap-2 pt-0.5 text-[10px] text-gray-500">
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-medium text-gray-300">
                    🏢 {fromRoom.building_name}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-medium text-gray-300">
                    🥞 {fromRoom.floor_name}
                  </span>
                </div>
              )}
            </div>

            {/* Swap Button */}
            <div className="flex items-center justify-center my-1">
              <button
                type="button"
                onClick={handleSwap}
                className="p-2 rounded-full bg-white/5 hover:bg-indigo-600/30 border border-white/10 hover:border-indigo-500/50 text-gray-400 hover:text-indigo-200 transition-all shadow-md group"
                title="Swap From and To rooms"
              >
                <ArrowRightLeft size={14} className="group-hover:rotate-180 transition-transform duration-300" />
              </button>
            </div>

            {/* To Room */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin size={11} className="text-red-400" /> To Room
              </label>
              <select
                className="w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-gray-200 outline-none focus:border-indigo-500 focus:bg-white/10 transition-all cursor-pointer"
                value={toRoomId}
                onChange={e => setToRoomId(e.target.value)}
              >
                {Object.entries(roomGroups).map(([bname, bRooms]) => (
                  <optgroup key={bname} label={bname} className="bg-[#1e2030] text-gray-300 font-semibold">
                    {bRooms.map(r => (
                      <option key={r.id} value={r.id} className="bg-[#1e2030] text-gray-200">
                        [{r.floor_name || 'Floor'}] {r.name} {r.code ? `(${r.code})` : ''} — {r.type}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {toRoom && (
                <div className="flex items-center gap-2 pt-0.5 text-[10px] text-gray-500">
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-medium text-gray-300">
                    🏢 {toRoom.building_name}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-medium text-gray-300">
                    🥞 {toRoom.floor_name}
                  </span>
                </div>
              )}
            </div>

            {/* Calculation Result Display Card */}
            <div className="pt-2">
              {calculating ? (
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-center gap-2 text-xs text-gray-400">
                  <Loader2 size={14} className="animate-spin text-indigo-400" /> Calculating shortest walking path…
                </div>
              ) : result ? (
                <div className={`p-4 rounded-2xl border transition-all ${
                  !result.reachable
                    ? 'bg-red-500/10 border-red-500/30'
                    : result.route_type === 'same_floor'
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : result.route_type === 'cross_floor'
                        ? 'bg-indigo-500/10 border-indigo-500/30'
                        : 'bg-purple-500/10 border-purple-500/30'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                      !result.reachable
                        ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                        : result.route_type === 'same_floor'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : result.route_type === 'cross_floor'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    }`}>
                      {!result.reachable
                        ? 'Unreachable'
                        : result.route_type === 'same_floor'
                          ? '🟢 Same Floor'
                          : result.route_type === 'cross_floor'
                            ? '🔵 Cross-Floor'
                            : '🟣 Cross-Building'}
                    </span>

                    {result.reachable && (
                      <div className="text-right">
                        <span className="text-lg font-extrabold text-white font-mono">
                          {result.distance_m ?? 0} <span className="text-xs font-normal text-gray-400">m</span>
                        </span>
                        <span className="block text-[10px] font-mono text-gray-400">
                          ({result.distance_cells ?? 0} cells)
                        </span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-300 leading-relaxed font-medium">
                    {result.description}
                  </p>

                  {result.reachable && fromRoom && toRoom && (
                    <div className="mt-4 pt-3 border-t border-white/10 space-y-2 text-[11px]">
                      <div className="flex items-center gap-2 text-gray-300">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="font-semibold text-white">{fromRoom.name}</span>
                        <span className="text-[10px] text-gray-500 font-mono">({fromRoom.building_name} • {fromRoom.floor_name})</span>
                      </div>
                      <div className="ml-1 pl-3 border-l-2 border-indigo-500/40 text-[10px] text-gray-400 py-1 space-y-1">
                        {result.route_type === 'same_floor' && 'Direct walking path through corridors'}
                        {result.route_type === 'cross_floor' && (
                          <div>
                            <span>Walk to stairwell/lift</span>
                            {result.stair_id && <span className="font-semibold text-indigo-300 ml-1">[{result.stair_id}]</span>}
                            <span> → Traverse floors → Walk to room</span>
                          </div>
                        )}
                        {result.route_type === 'cross_building' && (
                          <div className="space-y-1">
                            <div>
                              🚪 <span className="font-semibold text-amber-300">{result.gate_a_label || 'Exit Gate'}</span>
                              <span className="text-[9px] text-gray-500 font-mono ml-1">({fromRoom.building_name})</span>
                            </div>
                            <div className="text-[10px] text-indigo-300 font-mono pl-3">
                              ↕ Outdoor walking route
                            </div>
                            <div>
                              🚪 <span className="font-semibold text-amber-300">{result.gate_b_label || 'Entry Gate'}</span>
                              <span className="text-[9px] text-gray-500 font-mono ml-1">({toRoom.building_name})</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-gray-300">
                        <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                        <span className="font-semibold text-white">{toRoom.name}</span>
                        <span className="text-[10px] text-gray-500 font-mono">({toRoom.building_name} • {toRoom.floor_name})</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Teacher Commute Panel & Overlay — daily walk path with Module 7f distances
// ---------------------------------------------------------------------------
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function TeacherCommutePanel({
  campusId,
  teachers,
  timetables,
  teacherId,
  setTeacherId,
  timetableId,
  setTimetableId,
  dayOfWeek,
  setDayOfWeek,
  commute,
  loading,
  loadingMeta,
  error,
  hoveredHopIndex,
  setHoveredHopIndex,
  selectedHopIndex,
  setSelectedHopIndex,
  onClose,
  onRefresh,
}) {
  const roomColor = (rtype) => ({
    staffroom: { bg: 'rgba(168,85,247,0.18)', border: '#a855f7', dot: '#a855f7', text: '#d8b4fe' },
    classroom: { bg: 'rgba(99,102,241,0.18)',  border: '#6366f1', dot: '#6366f1', text: '#a5b4fc' },
    lab:       { bg: 'rgba(6,182,212,0.18)',   border: '#06b6d4', dot: '#06b6d4', text: '#67e8f9' },
    seminar:   { bg: 'rgba(245,158,11,0.18)',  border: '#f59e0b', dot: '#f59e0b', text: '#fcd34d' },
    unknown:   { bg: 'rgba(107,114,128,0.18)', border: '#6b7280', dot: '#6b7280', text: '#9ca3af' },
  }[rtype] || { bg: 'rgba(107,114,128,0.18)', border: '#6b7280', dot: '#6b7280', text: '#9ca3af' })

  return (
    <div className="inter-bldg-panel">
      {/* Header */}
      <div className="inter-bldg-header">
        <Route size={14} className="text-violet-400" />
        <span className="font-semibold text-gray-100">Teacher Commute Itinerary</span>
        <button
          onClick={onClose}
          className="ml-auto p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
          title="Close Itinerary Drawer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Description */}
      <div className="inter-bldg-desc">
        <Navigation size={11} className="text-violet-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Daily walk sequence: <strong className="text-violet-300">Staffroom</strong> → each period's room in order → <strong className="text-violet-300">Staffroom</strong>, labeled with Module 7f distances.
        </p>
      </div>

      {/* Body */}
      <div className="inter-bldg-body space-y-3">
        {loadingMeta ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-400 text-xs">
            <Loader2 size={14} className="animate-spin text-violet-400" /> Loading teachers…
          </div>
        ) : (
          <>
            {/* Quick selectors */}
            <div className="space-y-2.5 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
              {/* Teacher select */}
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={10} className="text-violet-400" /> Teacher
                </label>
                <select
                  className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10 text-gray-200 outline-none focus:border-violet-500 cursor-pointer"
                  value={teacherId}
                  onChange={e => setTeacherId(e.target.value)}
                >
                  <option value="">— Select Teacher —</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Timetable select */}
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Timetable Run</label>
                <select
                  className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10 text-gray-200 outline-none focus:border-violet-500 cursor-pointer"
                  value={timetableId}
                  onChange={e => setTimetableId(e.target.value)}
                >
                  <option value="">— Select Timetable —</option>
                  {timetables.map(tt => (
                    <option key={tt.id} value={tt.id}>
                      {tt.label || `Run ${tt.id.slice(0, 8)}`} ({new Date(tt.created_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
                {timetables.length === 0 && (
                  <p className="text-[10px] text-gray-500">No successful timetable runs yet.</p>
                )}
              </div>

              {/* Day selector */}
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Day of Week</label>
                <div className="flex gap-1 flex-wrap">
                  {DAY_SHORT.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => setDayOfWeek(i)}
                      className={`px-2 py-1 text-[10px] rounded-lg border font-semibold transition-all ${
                        dayOfWeek === i
                          ? 'bg-violet-600 text-white border-violet-500 shadow-sm'
                          : 'bg-white/5 text-gray-400 border-white/10 hover:border-violet-500/40 hover:text-violet-300'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 flex items-start gap-2">
                <AlertCircle size={11} className="mt-0.5 shrink-0" /> {error}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-6 gap-2 text-gray-400 text-xs">
                <Loader2 size={13} className="animate-spin text-violet-400" /> Computing Module 7f commute distances…
              </div>
            )}

            {/* Commute result */}
            {commute && !loading && (
              <div className="space-y-3">
                {/* Summary card */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-violet-600/20 via-violet-900/10 to-transparent border border-violet-500/30 shadow-lg">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-violet-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Footprints size={12} className="text-violet-400" />
                      {commute.teacher_name}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold">
                      {commute.day_name}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white font-mono tracking-tight">
                      {commute.total_distance_m}
                    </span>
                    <span className="text-xs font-semibold text-gray-400">meters total walk</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-gray-400">
                    <div>
                      <span className="text-gray-200 font-bold">{commute.reachable_hops}</span>
                      /{commute.total_hops} hops connected
                    </div>
                    {commute.staffroom_name && (
                      <div className="truncate max-w-[190px]" title={commute.staffroom_name}>
                        Base: <span className="text-violet-300 font-semibold">{commute.staffroom_name}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Journey timeline */}
                {commute.hops.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-500 bg-white/[0.02] rounded-xl border border-white/5">
                    No scheduled periods on {commute.day_name} for this teacher.
                  </div>
                ) : (
                  <div className="space-y-1 relative pt-1">
                    <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider px-1 mb-2 flex items-center justify-between">
                      <span>Commute Timeline</span>
                      <span className="text-[9px] text-gray-500 font-normal">Hover or click to highlight on map</span>
                    </div>

                    {/* Timeline of Waypoints */}
                    {(() => {
                      const waypoints = commute.waypoints && commute.waypoints.length > 0
                        ? commute.waypoints
                        : [
                            { index: 0, room_id: commute.hops[0]?.from_room_id, room_name: commute.hops[0]?.from_room_name, room_type: commute.hops[0]?.from_room_type, is_staffroom: true, building_name: commute.hops[0]?.from_building_name, floor_name: commute.hops[0]?.from_floor_name },
                            ...commute.hops.map((hop, hIdx) => ({
                              index: hIdx + 1,
                              room_id: hop.to_room_id,
                              room_name: hop.to_room_name,
                              room_type: hop.to_room_type,
                              is_staffroom: hIdx === commute.hops.length - 1,
                              period_index: hop.period_index,
                              subject_name: hop.subject_name,
                              subject_code: hop.subject_code,
                              section_name: hop.section_name,
                              building_name: hop.to_building_name,
                              floor_name: hop.to_floor_name,
                            }))
                          ]

                      return waypoints.map((wp, idx) => {
                        const hop = commute.hops[idx - 1] // arriving hop
                        const clr = roomColor(wp.room_type || 'classroom')
                        const isFirst = idx === 0
                        const isLast = idx === waypoints.length - 1
                        const hopIdx = idx - 1
                        const isHopHovered = hopIdx >= 0 && hoveredHopIndex === hopIdx
                        const isHopSelected = hopIdx >= 0 && selectedHopIndex === hopIdx

                        return (
                          <div
                            key={idx}
                            className={`commute-hop-card rounded-xl transition-all ${
                              isHopHovered || isHopSelected ? 'bg-violet-600/10 ring-1 ring-violet-500/40' : ''
                            }`}
                            onMouseEnter={() => hopIdx >= 0 && setHoveredHopIndex(hopIdx)}
                            onMouseLeave={() => setHoveredHopIndex(null)}
                            onClick={() => hopIdx >= 0 && setSelectedHopIndex(selectedHopIndex === hopIdx ? null : hopIdx)}
                          >
                            <div className="flex items-start">
                              {/* Left line & dot */}
                              <div className="flex flex-col items-center" style={{ width: 30, minWidth: 30 }}>
                                {/* Hop connection pill above */}
                                {!isFirst && hop && (
                                  <div className="flex flex-col items-center w-full py-0.5">
                                    <div className="w-0.5 h-2 bg-white/10" />
                                    <div
                                      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full border shadow-sm cursor-pointer transition-all ${
                                        !hop.reachable
                                          ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                          : hop.distance_m === 0
                                          ? 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                                          : hop.distance_m < 30
                                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                          : hop.distance_m < 80
                                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                          : 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                                      } ${isHopHovered || isHopSelected ? 'scale-110 shadow-violet-500/50' : ''}`}
                                      title={hop.reachable ? `Hop #${hopIdx + 1}: ${hop.distance_m}m (${hop.distance_cells} cells · ${hop.route_type || 'walking'})` : 'No path found'}
                                    >
                                      {hop.reachable ? `${hop.distance_m}m` : '✕'}
                                    </div>
                                    <div className="w-0.5 h-2 bg-white/10" />
                                  </div>
                                )}

                                {/* Waypoint Dot */}
                                <div
                                  className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-all ${
                                    isFirst || isLast ? 'ring-2 ring-violet-500/40' : ''
                                  }`}
                                  style={{
                                    background: clr.bg,
                                    borderColor: clr.dot,
                                    boxShadow: `0 0 10px ${clr.dot}55`,
                                  }}
                                />
                                {!isLast && (
                                  <div className="w-0.5 bg-white/10 flex-1" style={{ minHeight: 10 }} />
                                )}
                              </div>

                              {/* Right room card */}
                              <div
                                className="ml-1.5 mb-1.5 flex-1 rounded-xl border px-3 py-2 cursor-pointer transition-all"
                                style={{
                                  background: isHopHovered || isHopSelected ? 'rgba(139,92,246,0.14)' : clr.bg,
                                  borderColor: isHopHovered || isHopSelected ? '#a855f7' : clr.border + '44',
                                }}
                              >
                                <div className="flex items-start justify-between gap-1.5">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {isFirst ? (
                                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-violet-600/30 text-violet-200 border border-violet-500/40">
                                          🏠 Start · Staffroom
                                        </span>
                                      ) : isLast ? (
                                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-violet-600/30 text-violet-200 border border-violet-500/40">
                                          🏠 Return · Staffroom
                                        </span>
                                      ) : wp.period_index != null && (
                                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/10 text-gray-300 border border-white/10 font-mono">
                                          P{wp.period_index + 1}
                                        </span>
                                      )}
                                      <span className="text-xs font-semibold text-gray-100 truncate" style={{ color: clr.text }}>
                                        {wp.room_name}
                                      </span>
                                    </div>

                                    {wp.subject_name && (
                                      <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                                        {wp.subject_code && <span className="font-mono text-gray-300 mr-1">[{wp.subject_code}]</span>}
                                        {wp.subject_name}
                                        {wp.section_name && <span className="ml-1 text-gray-500">· {wp.section_name}</span>}
                                      </div>
                                    )}

                                    {/* Building & floor breadcrumb */}
                                    {(wp.building_name || wp.floor_name) && (
                                      <div className="text-[9px] text-gray-500 mt-0.5 flex items-center gap-1 font-mono">
                                        <Building2 size={9} className="text-gray-400" />
                                        <span>{wp.building_name || 'Building'}</span>
                                        {wp.floor_name && <span>› {wp.floor_name}</span>}
                                      </div>
                                    )}
                                  </div>

                                  <span
                                    className="text-[9px] px-1.5 py-0.5 rounded-full font-mono border shrink-0 uppercase"
                                    style={{ background: clr.bg, color: clr.text, borderColor: clr.border + '55' }}
                                  >
                                    {wp.room_type || 'room'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Campus Map — draggable building boxes with Teacher Commute Path Overlay
// ---------------------------------------------------------------------------
function CampusMap({ campus, buildings, onBuildingMove, onBuildingSelect, onAddBuilding, selectedBuildingId, onDeleteBuilding, onRenameBuilding, onAddFloor, onSelectFloor }) {
  const mapRef     = useRef(null)
  const dragging   = useRef(null)   // { id, startX, startY, origX, origY }

  // Side panels
  const [showCalcPanel,     setShowCalcPanel]     = useState(false)
  const [showEntrancePanel, setShowEntrancePanel] = useState(false)
  const [showCommutePanel,  setShowCommutePanel]  = useState(false)

  // Teacher Commute Mode state
  const [commuteMode,        setCommuteMode]        = useState(false)
  const [teachers,           setTeachers]           = useState([])
  const [timetables,         setTimetables]         = useState([])
  const [loadingMeta,        setLoadingMeta]        = useState(false)
  const [commuteTeacherId,   setCommuteTeacherId]   = useState('')
  const [commuteTimetableId, setCommuteTimetableId] = useState('')
  const [commuteDayOfWeek,   setCommuteDayOfWeek]   = useState(0)
  const [commute,            setCommute]            = useState(null)
  const [commuteLoading,     setCommuteLoading]     = useState(false)
  const [commuteError,       setCommuteError]       = useState(null)
  const [hoveredHopIndex,    setHoveredHopIndex]    = useState(null)
  const [selectedHopIndex,   setSelectedHopIndex]   = useState(null)

  const MAP_W = 1600
  const MAP_H = 900

  // Index buildings by ID
  const buildingMap = useMemo(() => {
    const map = {}
    buildings.forEach(b => { map[b.id] = b })
    return map
  }, [buildings])

  // Dragging logic
  const startDrag = (e, building) => {
    if (e.button !== 0) return
    e.stopPropagation()
    dragging.current = {
      id: building.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: building.pos_x,
      origY: building.pos_y,
      width:  building.width  ?? 120,
      height: building.height ?? 90,
    }
  }

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return
      const dx = e.clientX - dragging.current.startClientX
      const dy = e.clientY - dragging.current.startClientY
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

  // Enter/toggle commute mode
  const toggleCommuteMode = () => {
    if (!commuteMode) {
      setCommuteMode(true)
      setShowCommutePanel(true)
      setShowCalcPanel(false)
      setShowEntrancePanel(false)
      if (teachers.length === 0) {
        setLoadingMeta(true)
        Promise.all([teachersApi.list(), timetablesApi.list()])
          .then(([tRes, ttRes]) => {
            const tList = Array.isArray(tRes?.data) ? tRes.data : []
            const ttList = Array.isArray(ttRes?.data) ? ttRes.data : []
            setTeachers(tList)
            const okTt = ttList.filter(t => t.status === 'ok')
            setTimetables(okTt)
            if (tList.length > 0 && !commuteTeacherId) setCommuteTeacherId(tList[0].id)
            if (okTt.length > 0 && !commuteTimetableId) setCommuteTimetableId(okTt[0].id)
          })
          .catch(err => setCommuteError(err?.message || 'Failed to load teachers'))
          .finally(() => setLoadingMeta(false))
      }
    } else {
      setCommuteMode(false)
      setShowCommutePanel(false)
      setSelectedHopIndex(null)
      setHoveredHopIndex(null)
    }
  }

  // Fetch commute path data whenever teacher, timetable, or day changes
  useEffect(() => {
    if (!commuteMode || !commuteTeacherId || !commuteTimetableId) return
    let cancelled = false
    setCommuteLoading(true)
    setCommuteError(null)
    campusApi.teacherCommute(campus.id, commuteTeacherId, commuteTimetableId, commuteDayOfWeek)
      .then(res => {
        if (!cancelled) {
          setCommute(res.data)
          setSelectedHopIndex(null)
        }
      })
      .catch(err => {
        if (!cancelled) setCommuteError(err?.response?.data?.detail || err?.message || 'Failed to load commute path')
      })
      .finally(() => {
        if (!cancelled) setCommuteLoading(false)
      })
    return () => { cancelled = true }
  }, [commuteMode, campus.id, commuteTeacherId, commuteTimetableId, commuteDayOfWeek])

  // Buildings involved in commute
  const commuteBldgMeta = useMemo(() => {
    if (!commute?.hops || !commuteMode) return {}
    const meta = {}
    commute.hops.forEach(hop => {
      if (hop.from_building_id) {
        if (!meta[hop.from_building_id]) meta[hop.from_building_id] = { periods: [], hasStaffroom: false }
        if (hop.from_room_type === 'staffroom') meta[hop.from_building_id].hasStaffroom = true
      }
      if (hop.to_building_id) {
        if (!meta[hop.to_building_id]) meta[hop.to_building_id] = { periods: [], hasStaffroom: false }
        if (hop.to_room_type === 'staffroom') meta[hop.to_building_id].hasStaffroom = true
        if (hop.period_index != null && !meta[hop.to_building_id].periods.includes(hop.period_index + 1)) {
          meta[hop.to_building_id].periods.push(hop.period_index + 1)
        }
      }
    })
    return meta
  }, [commute, commuteMode])

  // Computed SVG hop paths and badges
  const hopRenderData = useMemo(() => {
    if (!commute?.hops || !commuteMode) return []
    return commute.hops.map((hop, i) => {
      const fromB = hop.from_building_id ? buildingMap[hop.from_building_id] : null
      const toB = hop.to_building_id ? buildingMap[hop.to_building_id] : null

      if (!fromB || !toB) return null

      const isSame = fromB.id === toB.id
      let pathD = ''
      let midX = 0
      let midY = 0

      if (!isSame) {
        const x1 = fromB.pos_x + (fromB.width ?? 120) / 2
        const y1 = fromB.pos_y + (fromB.height ?? 90) / 2
        const x2 = toB.pos_x + (toB.width ?? 120) / 2
        const y2 = toB.pos_y + (toB.height ?? 90) / 2

        const dx = x2 - x1
        const dy = y2 - y1
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len
        const ny = dx / len

        // Alternate curvature spread so opposite hops don't overlap directly
        const offset = (i % 2 === 0 ? 1 : -1) * (34 + ((i * 14) % 40))
        const cx = (x1 + x2) / 2 + nx * offset
        const cy = (y1 + y2) / 2 + ny * offset

        pathD = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
        midX = 0.25 * x1 + 0.5 * cx + 0.25 * x2
        midY = 0.25 * y1 + 0.5 * cy + 0.25 * y2
      } else {
        // Intra-building loop above the building
        const bx = fromB.pos_x + (fromB.width ?? 120) / 2
        const by = fromB.pos_y
        pathD = `M ${bx - 24} ${by} C ${bx - 44} ${by - 48}, ${bx + 44} ${by - 48}, ${bx + 24} ${by}`
        midX = bx
        midY = by - 42
      }

      let hex = '#a855f7'
      let markerKey = 'violet'
      if (!hop.reachable) {
        hex = '#ef4444'
        markerKey = 'red'
      } else if (hop.distance_m === 0) {
        hex = '#9ca3af'
        markerKey = 'gray'
      } else if (hop.distance_m < 30) {
        hex = '#10b981'
        markerKey = 'emerald'
      } else if (hop.distance_m < 80) {
        hex = '#f59e0b'
        markerKey = 'amber'
      }

      return {
        hop,
        index: i,
        pathD,
        midX,
        midY,
        hex,
        markerKey,
        isSame,
      }
    }).filter(Boolean)
  }, [commute, commuteMode, buildingMap])

  // Active hop info for tooltip
  const activeHop = (selectedHopIndex != null && commute?.hops?.[selectedHopIndex]) ||
                    (hoveredHopIndex != null && commute?.hops?.[hoveredHopIndex]) || null
  const activeHopIdx = selectedHopIndex != null ? selectedHopIndex : hoveredHopIndex

  return (
    <div className="flex flex-col h-full select-none">
      {/* Top Header & Commute Controls */}
      <div className={`flex items-center justify-between px-5 py-3 border-b flex-shrink-0 transition-colors ${
        commuteMode
          ? 'bg-gradient-to-r from-violet-950/40 via-gray-900 to-gray-900 border-violet-500/30'
          : 'border-white/10'
      }`}>
        {/* Left Title / Commute Quick Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              <MapPin size={14} className={commuteMode ? "text-violet-400" : "text-indigo-400"} />
              {campus.name} — Campus Map
            </h2>
            {campus.description && !commuteMode && (
              <p className="text-xs text-gray-500 mt-0.5">{campus.description}</p>
            )}
          </div>

          {commuteMode && (
            <div className="flex items-center gap-2 pl-3 border-l border-white/10 flex-wrap">
              {/* Teacher selector */}
              <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-xl border border-violet-500/30">
                <Users size={12} className="text-violet-400" />
                <select
                  className="bg-transparent text-xs font-semibold text-violet-200 outline-none cursor-pointer"
                  value={commuteTeacherId}
                  onChange={e => setCommuteTeacherId(e.target.value)}
                >
                  <option value="" className="bg-gray-900 text-gray-300">— Select Teacher —</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id} className="bg-gray-900 text-gray-200">{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Day pills */}
              <div className="flex items-center gap-0.5 bg-black/40 p-0.5 rounded-xl border border-white/10">
                {DAY_SHORT.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => setCommuteDayOfWeek(i)}
                    className={`px-2 py-0.5 text-[10px] rounded-lg font-bold transition-all ${
                      commuteDayOfWeek === i
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              {/* Commute summary badge */}
              {commute && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-200 text-xs font-mono font-bold shadow-sm">
                  <Footprints size={12} className="text-violet-400" />
                  <span>{commute.total_distance_m}m total</span>
                  <span className="text-[10px] font-normal text-violet-300/70">
                    ({commute.reachable_hops}/{commute.total_hops} hops)
                  </span>
                </div>
              )}

              {commuteLoading && (
                <div className="flex items-center gap-1 text-[11px] text-violet-300 animate-pulse">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Calculating path…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Find Room Distance */}
          <button
            id="room-distance-calc-btn"
            onClick={() => {
              setShowCalcPanel(o => !o)
              setShowEntrancePanel(false)
              if (!showCalcPanel && commuteMode) setCommuteMode(false)
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              showCalcPanel
                ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/50'
                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-indigo-600/15 hover:text-indigo-300 hover:border-indigo-500/30'
            }`}
            title="Find walking distance between any two rooms across floors or buildings"
          >
            <Ruler size={13} />
            Find Room Distance
          </button>

          {/* Entrance Links */}
          <button
            id="campus-entrance-pairs-btn"
            onClick={() => {
              setShowEntrancePanel(o => !o)
              setShowCalcPanel(false)
              if (!showEntrancePanel && commuteMode) setCommuteMode(false)
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              showEntrancePanel
                ? 'bg-amber-600/30 text-amber-200 border-amber-500/50'
                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-amber-600/15 hover:text-amber-300 hover:border-amber-500/30'
            }`}
            title="Configure specific gate-to-gate inter-building walking distances"
          >
            <DoorOpen size={13} />
            Entrance Links
          </button>

          {/* Teacher Commute Mode Toggle */}
          <button
            id="teacher-commute-btn"
            onClick={toggleCommuteMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              commuteMode
                ? 'bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-600/30 ring-2 ring-violet-500/40'
                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-violet-600/15 hover:text-violet-300 hover:border-violet-500/30'
            }`}
            title="Overlay a teacher's full daily commute path with Module 7f distances"
          >
            <Route size={13} />
            {commuteMode ? 'Commute Mode Active' : 'Teacher Commute'}
          </button>

          {/* Commute Itinerary Drawer Toggle (only when in Commute Mode) */}
          {commuteMode && (
            <button
              onClick={() => setShowCommutePanel(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                showCommutePanel
                  ? 'bg-violet-600/30 text-violet-200 border-violet-500/50'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-200'
              }`}
              title="Toggle detailed commute itinerary list"
            >
              <Navigation size={13} />
              Itinerary
            </button>
          )}

          {/* Add Building Button */}
          {!commuteMode && (
            <button
              id="add-building-btn"
              onClick={onAddBuilding}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 hover:text-indigo-200 transition-all"
            >
              <Plus size={13} /> Add Building
            </button>
          )}
        </div>
      </div>

      {/* Map canvas with SVG commute path overlay */}
      <div className="campus-map-canvas relative overflow-auto flex-1">
        <div
          ref={mapRef}
          style={{ width: MAP_W, height: MAP_H, position: 'relative', minWidth: '100%', minHeight: '100%' }}
          onClick={() => {
            onBuildingSelect(null)
            setSelectedHopIndex(null)
          }}
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

          {/* SVG OVERLAY FOR TEACHER COMMUTE PATHS */}
          {commuteMode && (
            <svg
              className="absolute inset-0 pointer-events-none z-10"
              style={{ width: MAP_W, height: MAP_H }}
            >
              <defs>
                <filter id="commute-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                {['violet', 'emerald', 'amber', 'red', 'gray'].map(c => {
                  const colorHex = {
                    violet: '#a855f7',
                    emerald: '#10b981',
                    amber: '#f59e0b',
                    red: '#ef4444',
                    gray: '#9ca3af',
                  }[c]
                  return (
                    <marker
                      key={c}
                      id={`commute-arrow-${c}`}
                      viewBox="0 0 10 10"
                      refX="7"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={colorHex} />
                    </marker>
                  )
                })}
              </defs>

              {/* Render Hop Paths */}
              {hopRenderData.map(({ hop, index: i, pathD, midX, midY, hex, markerKey, isSame }) => {
                const isHovered = hoveredHopIndex === i
                const isSelected = selectedHopIndex === i
                const isAnyHovered = hoveredHopIndex !== null || selectedHopIndex !== null
                const opacity = (isHovered || isSelected) ? 1.0 : (isAnyHovered ? 0.35 : 0.85)
                const strokeW = (isHovered || isSelected) ? 4.5 : 2.5

                return (
                  <g key={`hop-path-${i}`} className="pointer-events-auto">
                    {/* Background glow stroke */}
                    {(isHovered || isSelected) && (
                      <path
                        d={pathD}
                        fill="none"
                        stroke={hex}
                        strokeWidth={strokeW + 6}
                        strokeOpacity={0.4}
                        filter="url(#commute-glow)"
                      />
                    )}

                    {/* Animated flow path */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isHovered || isSelected ? '#ffffff' : hex}
                      strokeWidth={strokeW}
                      strokeOpacity={opacity}
                      strokeDasharray={hop.reachable ? "8 6" : "4 4"}
                      className={hop.reachable ? "commute-flow-line cursor-pointer" : "cursor-pointer"}
                      markerEnd={`url(#commute-arrow-${markerKey})`}
                      onMouseEnter={() => setHoveredHopIndex(i)}
                      onMouseLeave={() => setHoveredHopIndex(null)}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedHopIndex(selectedHopIndex === i ? null : i)
                      }}
                    />

                    {/* Midpoint distance label badge */}
                    <foreignObject
                      x={midX - 45}
                      y={midY - 14}
                      width="90"
                      height="28"
                      className="overflow-visible pointer-events-auto"
                    >
                      <div
                        onMouseEnter={() => setHoveredHopIndex(i)}
                        onMouseLeave={() => setHoveredHopIndex(null)}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedHopIndex(selectedHopIndex === i ? null : i)
                        }}
                        className={`cursor-pointer px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border shadow-lg flex items-center justify-center gap-1 transition-all select-none ${
                          isHovered || isSelected ? 'scale-125 z-40' : 'hover:scale-110'
                        }`}
                        style={{
                          background: isHovered || isSelected ? hex : '#12141f',
                          borderColor: hex,
                          color: isHovered || isSelected ? '#ffffff' : hex,
                          boxShadow: isHovered || isSelected ? `0 0 16px ${hex}` : '0 2px 8px rgba(0,0,0,0.7)',
                        }}
                        title={`Hop #${i + 1}: ${hop.from_room_name} → ${hop.to_room_name} (${hop.reachable ? `${hop.distance_m}m · ${hop.distance_cells} cells` : 'Unreachable'})`}
                      >
                        <span className="text-[9px] opacity-80 font-sans font-bold">#{i + 1}</span>
                        <span>{hop.reachable ? `${hop.distance_m}m` : '✕'}</span>
                      </div>
                    </foreignObject>
                  </g>
                )
              })}
            </svg>
          )}

          {/* BUILDINGS */}
          {buildings.map(b => {
            const bMeta = commuteMode && commuteBldgMeta[b.id]
            const isCommuteBldg = !!bMeta
            const isHoveredHopBldg = hoveredHopIndex != null && commute?.hops?.[hoveredHopIndex] && (
              commute.hops[hoveredHopIndex].from_building_id === b.id ||
              commute.hops[hoveredHopIndex].to_building_id === b.id
            )

            return (
              <div
                key={b.id}
                className={`building-box ${selectedBuildingId === b.id ? 'selected' : ''} ${
                  isCommuteBldg ? 'ring-2 ring-violet-500/80 shadow-[0_0_24px_rgba(168,85,247,0.4)]' : ''
                } ${isHoveredHopBldg ? 'ring-4 ring-white shadow-[0_0_30px_rgba(255,255,255,0.7)]' : ''}`}
                style={{
                  left:   b.pos_x,
                  top:    b.pos_y,
                  width:  b.width,
                  height: b.height,
                  color:  b.color,
                  background: isCommuteBldg ? 'rgba(139,92,246,0.18)' : b.color + '22',
                  zIndex: isHoveredHopBldg ? 25 : (isCommuteBldg ? 20 : 1),
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
                {/* Commute building badge header */}
                {commuteMode && bMeta && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none z-30 whitespace-nowrap">
                    {bMeta.hasStaffroom && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-600 text-white shadow-md flex items-center gap-1 border border-violet-400/50">
                        🏠 Staffroom
                      </span>
                    )}
                    {bMeta.periods.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-indigo-950/90 text-indigo-200 border border-indigo-400/40 shadow-md">
                        P: {bMeta.periods.join(', ')}
                      </span>
                    )}
                  </div>
                )}

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
                {selectedBuildingId === b.id && !commuteMode && (
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
            )
          })}

          {/* ACTIVE HOP FLOATING CARD TOOLTIP */}
          {commuteMode && activeHop && activeHopIdx != null && (
            <div
              className="absolute bottom-5 left-5 z-40 max-w-sm rounded-2xl bg-[#121420]/95 border border-violet-500/40 p-3.5 shadow-2xl backdrop-blur-md pointer-events-auto transition-all animate-fadeIn"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-white/10">
                <span className="text-[11px] font-bold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Navigation size={12} className="text-violet-400" />
                  Hop #{activeHopIdx + 1} Details
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                  !activeHop.reachable ? 'bg-red-500/20 text-red-300 border-red-500/40'
                    : (activeHop.distance_m || 0) < 30 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : (activeHop.distance_m || 0) < 80 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                }`}>
                  {activeHop.reachable ? `${activeHop.distance_m}m · ${activeHop.distance_cells} cells` : 'Unreachable'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-gray-300">
                  <span className="text-gray-500 text-[10px]">From:</span>
                  <span className="font-semibold text-gray-200">
                    {activeHop.from_room_name} <span className="text-gray-500 text-[10px]">({activeHop.from_building_name || 'Campus'})</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-300">
                  <span className="text-gray-500 text-[10px]">To:</span>
                  <span className="font-semibold text-violet-200">
                    {activeHop.to_room_name} <span className="text-gray-500 text-[10px]">({activeHop.to_building_name || 'Campus'})</span>
                  </span>
                </div>
                {activeHop.period_index != null && (
                  <div className="flex items-center justify-between text-gray-300 pt-1 border-t border-white/5">
                    <span className="text-gray-500 text-[10px]">Period:</span>
                    <span className="font-mono text-gray-200 font-bold">
                      Period {activeHop.period_index + 1}
                      {activeHop.subject_name && ` · ${activeHop.subject_name}`}
                      {activeHop.section_name && ` (${activeHop.section_name})`}
                    </span>
                  </div>
                )}
                {activeHop.route_type && (
                  <div className="flex items-center justify-between text-gray-400 text-[10px]">
                    <span className="text-gray-500">Route Type:</span>
                    <span className="font-mono capitalize text-gray-300">{activeHop.route_type.replace('_', ' ')}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Room Distance Calculator Side Panel */}
      {showCalcPanel && (
        <div className="inter-bldg-overlay" onClick={() => setShowCalcPanel(false)}>
          <div className="inter-bldg-drawer" onClick={e => e.stopPropagation()}>
            <RoomDistanceCalculatorPanel
              campusId={campus.id}
              onClose={() => setShowCalcPanel(false)}
            />
          </div>
        </div>
      )}

      {/* Entrance Pair Distance Side Panel */}
      {showEntrancePanel && (
        <div className="inter-bldg-overlay" onClick={() => setShowEntrancePanel(false)}>
          <div className="inter-bldg-drawer" onClick={e => e.stopPropagation()}>
            <EntrancePairsPanel
              campusId={campus.id}
              buildings={buildings}
              onClose={() => setShowEntrancePanel(false)}
            />
          </div>
        </div>
      )}

      {/* Teacher Commute Path Side Drawer (Non-blocking so user can view/pan map) */}
      {commuteMode && showCommutePanel && (
        <div className="commute-drawer-overlay">
          <div className="commute-drawer" onClick={e => e.stopPropagation()}>
            <TeacherCommutePanel
              campusId={campus.id}
              teachers={teachers}
              timetables={timetables}
              teacherId={commuteTeacherId}
              setTeacherId={setCommuteTeacherId}
              timetableId={commuteTimetableId}
              setTimetableId={setCommuteTimetableId}
              dayOfWeek={commuteDayOfWeek}
              setDayOfWeek={setCommuteDayOfWeek}
              commute={commute}
              loading={commuteLoading}
              loadingMeta={loadingMeta}
              error={commuteError}
              hoveredHopIndex={hoveredHopIndex}
              setHoveredHopIndex={setHoveredHopIndex}
              selectedHopIndex={selectedHopIndex}
              setSelectedHopIndex={setSelectedHopIndex}
              onClose={() => setShowCommutePanel(false)}
              onRefresh={() => {
                if (commuteTeacherId && commuteTimetableId) {
                  setCommuteLoading(true)
                  campusApi.teacherCommute(campus.id, commuteTeacherId, commuteTimetableId, commuteDayOfWeek)
                    .then(res => setCommute(res.data))
                    .catch(err => setCommuteError(err?.message))
                    .finally(() => setCommuteLoading(false))
                }
              }}
            />
          </div>
        </div>
      )}
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
