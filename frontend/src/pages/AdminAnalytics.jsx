import { useEffect, useState, useCallback } from "react";
import {
  BarChart2, Users, Star, Footprints, Building2,
  ChevronDown, ChevronUp, AlertTriangle, TrendingUp,
  Award, Zap, MapPin, RefreshCw, Calendar,
  Clock, DoorOpen, FlaskConical, GraduationCap, Check,
} from "lucide-react";
import { timetablesApi, campusApi, analyticsApi } from "../api/index";

// ─── Color helpers ───────────────────────────────────────────────────────────
const PREF_COLORS = {
  preferred: { bg: "#22c55e", text: "#bbf7d0", label: "Preferred" },
  willing: { bg: "#60a5fa", text: "#bfdbfe", label: "Willing" },
  avoid: { bg: "#f87171", text: "#fecaca", label: "Avoid" },
};
const UTIL_COLOR = (pct) => {
  if (pct >= 90) return "#f87171";
  if (pct >= 70) return "#fbbf24";
  return "#34d399";
};
const COMMUTE_COLOR = (m) => {
  if (m > 500) return "#f87171";
  if (m > 250) return "#fbbf24";
  return "#60a5fa";
};

// ─── Reusable animated horizontal bar ────────────────────────────────────────
function AnimBar({ pct, color, height = 8 }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(Math.min(pct, 100)), 60);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div
      style={{ height, borderRadius: 99, background: "rgb(154 147 147 / 19%)", overflow: "hidden" }}
    >
      <div
        style={{
          width: `${w}%`,
          height: "100%",
          background: color,
          borderRadius: 99,
          transition: "width 0.7s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      />
    </div>
  );
}

// ─── Panel tabs ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "workload", label: "Workload", icon: BarChart2 },
  { id: "preferences", label: "Preferences", icon: Star },
  { id: "rooms", label: "Rooms", icon: Building2 },
  { id: "commute", label: "Commute Cost", icon: Footprints },
];

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Skeleton({ rows = 5 }) {
  return (
    <div className="space-y-3 mt-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div style={{ width: 140, height: 14, borderRadius: 6, background: "rgba(255,255,255,0.08)" }} />
          <div style={{ flex: 1, height: 10, borderRadius: 99, background: "rgba(255,255,255,0.06)" }} />
          <div style={{ width: 40, height: 14, borderRadius: 6, background: "rgba(255,255,255,0.05)" }} />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL 1: Workload Distribution
// ─────────────────────────────────────────────────────────────────────────────
function WorkloadPanel({ data, loading }) {
  if (loading) return <Skeleton />;
  if (!data?.teachers?.length) return (
    <p className="text-muted text-sm mt-6 text-center">No workload data available for this run.</p>
  );

  const totalTeachers = data.teachers.length;
  const totalAssigned = data.teachers.reduce((s, t) => s + (t.periods_per_week || 0), 0);
  const avgLoad = (totalAssigned / (totalTeachers || 1)).toFixed(1);
  const overloaded = data.teachers.filter((t) => t.utilisation_pct > 100).length;
  const highLoad = data.teachers.filter((t) => t.utilisation_pct >= 85 && t.utilisation_pct <= 100).length;

  const maxP = Math.max(...data.teachers.map((t) => t.periods_per_week), 1);
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Active faculty", val: totalTeachers, Icon: Users, color: "var(--c-primary)", bg: "rgba(46,42,107,0.08)" },
          { label: "Total assigned periods", val: `${totalAssigned} hrs`, Icon: Clock, color: "var(--c-primary)", bg: "rgba(46,42,107,0.08)" },
          { label: "Average workload", val: `${avgLoad} p/wk`, Icon: BarChart2, color: "#2e7d32", bg: "rgba(46,125,50,0.08)" },
          {
            label: overloaded > 0 ? "Overloaded faculty" : "Optimal load",
            val: overloaded > 0 ? `${overloaded} alert` : `${highLoad} high load`,
            Icon: overloaded > 0 ? AlertTriangle : Award,
            color: overloaded > 0 ? "#c62828" : "#2E2A6B",
            bg: overloaded > 0 ? "rgba(198,40,40,0.08)" : "rgba(46,42,107,0.08)",
          },
        ].map((s) => (
          <div key={s.label} className="card p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <div style={{ width: 32, height: 32, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
                <s.Icon size={16} strokeWidth={2} />
              </div>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-muted)' }}>{s.label}</span>
            </div>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--c-body)', marginTop: 4 }} className="tabular-nums">{s.val}</p>
          </div>
        ))}
      </div>
      <div className="space-y-1 mt-4">
        {data.teachers.map((t) => {
          const pct = (t.periods_per_week / maxP) * 100;
          const color = UTIL_COLOR(t.utilisation_pct);
          return (
            <div key={t.teacher_id} className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-ground transition-colors">
              <div style={{ width: 180, minWidth: 180 }}>
                <p className="text-sm font-medium text-body truncate">{t.teacher_name}</p>
                <p className="text-xs text-muted truncate">{t.department}</p>
              </div>
              <div style={{ flex: 1 }}>
                <AnimBar pct={pct} color={color} height={9} />
              </div>
              <div style={{ width: 84, textAlign: "right" }}>
                <span className="text-sm font-bold tabular-nums" style={{ color }}>
                  {t.periods_per_week}
                </span>
                <span className="text-xs text-muted"> / {t.max_periods_per_week}</span>
              </div>
              <div
                style={{ width: 60, textAlign: "right" }}
                className="text-xs font-semibold tabular-nums"
              >
                <span
                  className="px-2 py-0.5 rounded-md text-xs font-bold"
                  style={{ background: color + "20", color }}
                >
                  {t.utilisation_pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL 2: Preference Breakdown
// ─────────────────────────────────────────────────────────────────────────────
function SummaryDonut({ summary }) {
  if (!summary) return null;
  const segments = [
    { key: "preferred", pct: summary.preferred_pct, count: summary.preferred_count },
    { key: "willing", pct: summary.willing_pct, count: summary.willing_count },
    { key: "avoid", pct: summary.avoid_pct, count: summary.avoid_count },
  ];
  // SVG donut
  const R = 36, cx = 44, cy = 44, stroke = 10;
  const circumference = 2 * Math.PI * R;
  let offset = 0;
  const arcs = segments.map((s) => {
    const dashLen = (s.pct / 100) * circumference;
    const arc = { ...s, dashLen, offset };
    offset += dashLen;
    return arc;
  });

  return (
    <div className="flex items-center gap-5 mb-5 px-1">
      <svg width={88} height={88} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={PREF_COLORS[arc.key].bg}
            strokeWidth={stroke}
            strokeDasharray={`${arc.dashLen} ${circumference - arc.dashLen}`}
            strokeDashoffset={-arc.offset}
            strokeLinecap="butt"
            style={{ transformOrigin: `${cx}px ${cy}px`, transform: "rotate(-90deg)" }}
          />
        ))}
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fill="#2E2A6B" fontWeight="700">
          {summary.preferred_pct}%
        </text>
      </svg>
      <div className="grid grid-cols-3 gap-3 flex-1">
        {segments.map((s) => (
          <div key={s.key} className="flex flex-col gap-1 px-3 py-2 rounded-xl" style={{ background: "#FFFFFF" }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PREF_COLORS[s.key].bg }}>
              {PREF_COLORS[s.key].label}
            </span>
            <span className="text-xl font-bold tabular-nums text-[#2E2A6B]">{s.pct}%</span>
            <span className="text-xs text-muted">{s.count} periods</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreferencesPanel({ data, loading }) {
  if (loading) return <Skeleton />;
  if (!data?.teachers?.length) return (
    <p className="text-muted text-sm mt-6 text-center">No preference data available.</p>
  );

  return (
    <div>
      <SummaryDonut summary={data.summary} />
      <div className="space-y-1">
        {data.teachers.map((t) => (
          <div key={t.teacher_id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-ground transition-colors group">
            <div style={{ width: 148, minWidth: 148 }}>
              <p className="text-sm font-medium text-body truncate">{t.teacher_name}</p>
              <p className="text-xs text-muted">{t.total_periods} periods</p>
            </div>
            {/* Stacked preference bar */}
            <div style={{ flex: 1, height: 8, borderRadius: 99, overflow: "hidden", display: "flex", background: "rgba(255,255,255,0.07)" }}>
              {["preferred", "willing", "avoid"].map((k) => (
                t[`${k}_pct`] > 0 && (
                  <div
                    key={k}
                    title={`${PREF_COLORS[k].label}: ${t[`${k}_pct`]}%`}
                    style={{
                      width: `${t[`${k}_pct`]}%`,
                      background: PREF_COLORS[k].bg,
                      transition: "width 0.7s cubic-bezier(0.34,1.56,0.64,1)",
                    }}
                  />
                )
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {t.avoid_pct > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: "#f8717120", color: "#f87171" }}>
                  {t.avoid_pct}% avoid
                </span>
              )}
              {t.preferred_pct >= 60 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: "#22c55e20", color: "#22c55e" }}>
                  {t.preferred_pct}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL 3: Room Utilisation
// ─────────────────────────────────────────────────────────────────────────────
function RoomRow({ room }) {
  const [open, setOpen] = useState(false);
  const color = UTIL_COLOR(room.utilisation_pct);
  const RoomIcon = { lab: FlaskConical, seminar: GraduationCap, classroom: Building2 }[room.room_type] ?? DoorOpen;

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-ground transition-colors text-left"
      >
        <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(46,42,107,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--c-primary)" }}>
          <RoomIcon size={15} strokeWidth={2} />
        </div>
        <div style={{ width: 140, minWidth: 140 }}>
          <p className="text-sm font-medium text-body truncate">{room.room_name}</p>
          <p className="text-xs text-muted">{room.room_code} · {room.room_type}</p>
        </div>
        <div style={{ flex: 1 }}>
          <AnimBar pct={room.utilisation_pct} color={color} height={8} />
        </div>
        <div style={{ width: 80, textAlign: "right" }}>
          <span className="text-sm font-bold tabular-nums" style={{ color }}>
            {room.utilisation_pct}%
          </span>
          <p className="text-[10px] text-muted">{room.occupied_slots}/{room.total_slot_capacity} slots</p>
        </div>
        <span className="ml-2 text-muted">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && room.proximity_substitutes?.length > 0 && (
        <div className="border-t border-primary/8 px-4 pb-3 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">
            Proximity-Ranked Substitutes ({room.room_type})
          </p>
          <div className="space-y-1.5">
            {room.proximity_substitutes.map((sub, i) => (
              <div key={sub.room_id} className="flex items-center gap-2 text-sm">
                <span className="text-[10px] font-bold text-muted w-4">#{i + 1}</span>
                <span className="text-body truncate flex-1">{sub.room_name}</span>
                <span className="text-muted text-xs">{sub.room_code}</span>
                {sub.reachable ? (
                  <span className="text-xs tabular-nums px-1.5 py-0.5 rounded" style={{ background: "#60a5fa15", color: "#60a5fa" }}>
                    {sub.distance_m}m
                  </span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "#6b7280" }}>
                    no route
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {open && !room.proximity_substitutes?.length && (
        <div className="border-t border-primary/8 px-4 py-2">
          <p className="text-xs text-muted">No substitute rooms of type "{room.room_type}" found.</p>
        </div>
      )}
    </div>
  );
}

function RoomsPanel({ data, loading }) {
  if (loading) return <Skeleton rows={4} />;
  if (!data?.rooms?.length) return (
    <p className="text-muted text-sm mt-6 text-center">No room data available for this run.</p>
  );

  const avgUtil = (data.rooms.reduce((s, r) => s + r.utilisation_pct, 0) / data.rooms.length).toFixed(1);
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Rooms in use", val: data.rooms.length, Icon: DoorOpen, color: "var(--c-primary)", bg: "rgba(46,42,107,0.08)" },
          { label: "Average utilisation", val: `${avgUtil}%`, Icon: BarChart2, color: "#2e7d32", bg: "rgba(46,125,50,0.08)" },
          { label: "Total capacity", val: `${data.total_slot_capacity} slots`, Icon: Calendar, color: "var(--c-primary)", bg: "rgba(46,42,107,0.08)" },
        ].map((s) => (
          <div key={s.label} className="card p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <div style={{ width: 32, height: 32, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
                <s.Icon size={16} strokeWidth={2} />
              </div>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-muted)' }}>{s.label}</span>
            </div>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--c-body)', marginTop: 4 }} className="tabular-nums">{s.val}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {data.rooms.map((room) => <RoomRow key={room.room_id} room={room} />)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL 4: Commute Cost Report
// ─────────────────────────────────────────────────────────────────────────────
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CommuteRow({ teacher }) {
  const [open, setOpen] = useState(false);
  const color = COMMUTE_COLOR(teacher.weekly_total_m);
  const hasGaps = teacher.gap_hops > 0;

  return (
    <div className="card overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ground transition-colors text-left"
      >
        <div style={{ width: 148, minWidth: 148 }}>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-body truncate">{teacher.teacher_name}</p>
            {hasGaps && (
              <span title={`${teacher.gap_hops} gap-hop(s) back to staffroom`}>
                <AlertTriangle size={12} className="text-amber-400 shrink-0" />
              </span>
            )}
          </div>
          <p className="text-xs text-muted truncate">{teacher.department}</p>
        </div>
        <div style={{ flex: 1 }}>
          <AnimBar pct={Math.min((teacher.weekly_total_m / 800) * 100, 100)} color={color} height={8} />
        </div>
        <div style={{ width: 80, textAlign: "right" }}>
          <span className="text-sm font-bold tabular-nums" style={{ color }}>
            {teacher.weekly_total_m > 0 ? `${teacher.weekly_total_m}m` : "—"}
          </span>
          <p className="text-[10px] text-muted">{teacher.total_hops} hops/wk</p>
        </div>
        {hasGaps && (
          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: "#fbbf2420", color: "#fbbf24" }}>
            {teacher.gap_hops} gaps
          </span>
        )}
        <span className="ml-2 text-muted">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div className="border-t border-primary/8 px-4 pb-4 pt-3">
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { l: "Direct Hops", v: teacher.direct_hops, c: "#60a5fa" },
              { l: "Gap Hops", v: teacher.gap_hops, c: "#fbbf24" },
              { l: "Total Cells", v: teacher.weekly_total_cells ?? "—", c: "#a78bfa" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg px-3 py-2 text-center" style={{ background: s.c + "12" }}>
                <p className="text-base font-bold tabular-nums" style={{ color: s.c }}>{s.v}</p>
                <p className="text-[10px] text-muted mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>

          {/* Daily breakdown table */}
          {Object.keys(teacher.daily_breakdown).length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted text-left">
                  <th className="pb-1.5 font-semibold">Day</th>
                  <th className="pb-1.5 font-semibold text-right">Periods</th>
                  <th className="pb-1.5 font-semibold text-right">Distance</th>
                  <th className="pb-1.5 font-semibold text-right">Hops</th>
                  <th className="pb-1.5 font-semibold text-right">Gaps</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(teacher.daily_breakdown)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([dayIdx, day]) => (
                    <tr key={dayIdx} className="border-t border-primary/8">
                      <td className="py-1.5 text-body">{DAY_LABELS[Number(dayIdx)] ?? `Day${dayIdx}`}</td>
                      <td className="py-1.5 text-right text-muted tabular-nums">{day.periods_count}</td>
                      <td className="py-1.5 text-right text-body tabular-nums font-semibold">
                        {day.total_m > 0 ? `${day.total_m}m` : "—"}
                      </td>
                      <td className="py-1.5 text-right text-muted tabular-nums">{day.hops}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {day.gap_hops > 0 ? (
                          <span className="px-1.5 py-0.5 rounded" style={{ background: "#fbbf2418", color: "#fbbf24" }}>
                            {day.gap_hops}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function CommutePanel({ data, loading }) {
  if (loading) return <Skeleton rows={4} />;
  if (!data?.teachers?.length) return (
    <p className="text-muted text-sm mt-6 text-center">No commute data available.</p>
  );

  const totalKm = (data.teachers.reduce((s, t) => s + t.weekly_total_m, 0) / 1000).toFixed(2);
  const gapTeachers = data.teachers.filter((t) => t.gap_hops > 0).length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Total weekly walk", val: `${totalKm} km`, Icon: Footprints, color: "var(--c-primary)", bg: "rgba(46,42,107,0.08)" },
          { label: "Teachers with gaps", val: gapTeachers, Icon: AlertTriangle, color: gapTeachers > 0 ? "#c62828" : "#2e7d32", bg: gapTeachers > 0 ? "rgba(198,40,40,0.08)" : "rgba(46,125,50,0.08)" },
          { label: "Teachers ranked", val: data.teachers.length, Icon: Award, color: "var(--c-primary)", bg: "rgba(46,42,107,0.08)" },
        ].map((s) => (
          <div key={s.label} className="card p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <div style={{ width: 32, height: 32, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
                <s.Icon size={16} strokeWidth={2} />
              </div>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-muted)' }}>{s.label}</span>
            </div>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--c-body)', marginTop: 4 }} className="tabular-nums">{s.val}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {data.teachers.map((t) => <CommuteRow key={t.teacher_id} teacher={t} />)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminAnalytics() {
  const [tab, setTab] = useState("workload");

  // Selectors
  const [timetables, setTimetables] = useState([]);
  const [selectedTT, setSelectedTT] = useState("");
  const [campuses, setCampuses] = useState([]);
  const [selectedCampus, setSelectedCampus] = useState("");

  // Panel data
  const [workload, setWorkload] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [rooms, setRooms] = useState(null);
  const [commute, setCommute] = useState(null);

  // Loading states per panel
  const [loadW, setLoadW] = useState(false);
  const [loadP, setLoadP] = useState(false);
  const [loadR, setLoadR] = useState(false);
  const [loadC, setLoadC] = useState(false);

  // Load timetable list + campus list on mount
  useEffect(() => {
    timetablesApi.list().then((r) => {
      const ok = r.data.filter((t) => t.status === "ok");
      setTimetables(ok);
      if (ok.length) setSelectedTT(ok[0].id);
    }).catch(() => { });

    campusApi.list().then((r) => {
      setCampuses(r.data || []);
      if (r.data?.length) setSelectedCampus(r.data[0].id);
    }).catch(() => { });
  }, []);

  // Fetch all panels when timetable or campus changes
  const fetchAll = useCallback(() => {
    if (!selectedTT) return;

    setLoadW(true);
    analyticsApi.workload(selectedTT)
      .then((r) => setWorkload(r.data))
      .catch(() => setWorkload(null))
      .finally(() => setLoadW(false));

    setLoadP(true);
    analyticsApi.preferences(selectedTT)
      .then((r) => setPreferences(r.data))
      .catch(() => setPreferences(null))
      .finally(() => setLoadP(false));

    setLoadR(true);
    analyticsApi.roomUtil(selectedTT, selectedCampus || null)
      .then((r) => setRooms(r.data))
      .catch(() => setRooms(null))
      .finally(() => setLoadR(false));

    setLoadC(true);
    analyticsApi.commuteCosts(selectedTT, selectedCampus || null)
      .then((r) => setCommute(r.data))
      .catch(() => setCommute(null))
      .finally(() => setLoadC(false));
  }, [selectedTT, selectedCampus]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const activeLoad = { workload: loadW, preferences: loadP, rooms: loadR, commute: loadC }[tab];

  return (
    <div className="page-wrapper">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-heading">Analytics</h1>
          <p className="page-sub">Workload · Preferences · Room utilisation · Commute costs</p>
        </div>
        <button
          id="analytics-refresh-btn"
          onClick={fetchAll}
          disabled={!selectedTT}
          className="btn btn-secondary btn-sm"
        >
          <RefreshCw size={14} className={`${loadW || loadP || loadR || loadC ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Selectors row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {/* Timetable picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
          <Calendar size={14} style={{ color: 'var(--c-muted)', flexShrink: 0 }} />
          <select
            id="analytics-timetable-select"
            value={selectedTT}
            onChange={(e) => setSelectedTT(e.target.value)}
            className="form-input"
          >
            <option value="">— Select timetable —</option>
            {timetables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label || `Run ${t.id.slice(0, 8)}`} · {new Date(t.created_at).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>

        {/* Campus picker (for distance features) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
          <MapPin size={14} style={{ color: 'var(--c-muted)', flexShrink: 0 }} />
          <select
            id="analytics-campus-select"
            value={selectedCampus}
            onChange={(e) => setSelectedCampus(e.target.value)}
            className="form-input"
          >
            <option value="">— No campus (distance data unavailable) —</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tab strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: 4,
        borderRadius: 16,
        background: 'rgba(46,42,107,0.06)',
        border: '1px solid var(--c-border)',
        marginBottom: 4,
      }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = tab === id;
          const isLoading = { workload: loadW, preferences: loadP, rooms: loadR, commute: loadC }[id];
          return (
            <button
              key={id}
              id={`analytics-tab-${id}`}
              onClick={() => setTab(id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                padding: '9px 12px',
                borderRadius: 12,
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                transition: 'all 0.15s ease',
                cursor: 'pointer',
                fontFamily: 'Figtree, sans-serif',
                background: isActive ? '#FFFFFF' : 'transparent',
                color: isActive ? '#2E2A6B' : 'var(--c-muted)',
                border: isActive ? '1px solid var(--c-border-md)' : '1px solid transparent',
                boxShadow: isActive ? 'var(--shadow-card)' : 'none',
              }}
            >
              <Icon size={14} />
              <span>{label}</span>
              {isLoading && <span style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid currentColor', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />}
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      <div className="card-padded">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {(() => {
            const cur = TABS.find((t) => t.id === tab);
            if (!cur) return null;
            const Icon = cur.icon;
            return (
              <>
                <Icon size={16} style={{ color: '#2E2A6B' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--c-body)', margin: 0 }}>{cur.label}</h3>
              </>
            );
          })()}
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--c-muted)', marginBottom: 20 }}>
          {{
            workload: "Periods/week per teacher with capacity utilisation.",
            preferences: "Assignment quality breakdown: preferred, willing, and avoid period counts.",
            rooms: "Room occupancy across the timetable run. Expand a row to see proximity-ranked substitutes.",
            commute: "Weekly walking distance per teacher. Gap hops indicate extra walks caused by free-period breaks.",
          }[tab]}
        </p>
        {tab === "workload" && <WorkloadPanel data={workload} loading={loadW} />}
        {tab === "preferences" && <PreferencesPanel data={preferences} loading={loadP} />}
        {tab === "rooms" && <RoomsPanel data={rooms} loading={loadR} />}
        {tab === "commute" && <CommutePanel data={commute} loading={loadC} />}
      </div>
    </div>
  );
}
