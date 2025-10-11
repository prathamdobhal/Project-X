// src/pages/VisualsPage.tsx
import React, { useEffect, useMemo, useState, ReactNode, isValidElement, cloneElement } from "react";
import { API_BASE_URL } from "../lib/config";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { Download } from "lucide-react";

type Row = Record<string, any>;
type DatasetMeta = {
  dataset_id: string;
  filename?: string;
  created_at?: string;
  rows?: number;
  columns?: string[];
};

function safeSplit(row: string): string[] {
  let inQ = false;
  let buf = "";
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') inQ = !inQ;
    if (ch === "," && inQ) buf += "§§COMMA§§";
    else buf += ch;
  }
  return buf.split(",").map((s) => s.replace(/§§COMMA§§/g, ",").replace(/^"|"$/g, "").trim());
}
function tryParseCSV(csvText: string): Row[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const header = safeSplit(lines[0]);
  const out: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = safeSplit(lines[i]);
    const r: Row = {};
    for (let c = 0; c < header.length; c++) r[header[c]] = cells[c] ?? "";
    out.push(r);
  }
  return out;
}
function alertToBool(v: any): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  if (["yes", "y", "true", "1", "t"].includes(s)) return true;
  if (["no", "n", "false", "0", "f"].includes(s)) return false;
  const n = Number(s);
  return Number.isFinite(n) ? n !== 0 : false;
}
function parseDurationToSeconds(v: any): number {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  if (s.includes(":")) {
    const parts = s.split(":").map((p) => Number(p));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 3) {
      const [h, m, sec] = parts;
      return h * 3600 + m * 60 + sec;
    }
    if (parts.length === 2) {
      const [m, sec] = parts;
      return m * 60 + sec;
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function parseClockToMin(v: any): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const parts = s.split(":").map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) {
    const [h, m] = parts;
    return h * 60 + m;
  }
  if (parts.length === 2) {
    const [h, m] = parts;
    return h * 60 + m;
  }
  return null;
}

const C = {
  blue: "#60a5fa",
  cyan: "#22d3ee",
  teal: "#14b8a6",
  green: "#22c55e",
  amber: "#f59e0b",
  orange: "#fb923c",
  red: "#ef4444",
  pink: "#f472b6",
  violet: "#8b5cf6",
};

// Unified chart height + margins to prevent cutoff
const CH = 320;
const CM = { top: 8, right: 8, bottom: 28, left: 8 } as const;

/** ----- small helpers for per-user localstorage ----- */
function currentUserEmail(): string | null {
  try {
    const raw = localStorage.getItem("ops_user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    return (u?.email || null) as string | null;
  } catch {
    return null;
  }
}
function userDatasetsKey(email: string | null) {
  return `ops_datasets_${email ?? "__anon"}`;
}
function userDatasetKeyName(email: string | null) {
  return `dataset_key_${email ?? "__anon"}`;
}

export default function VisualsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // NEW: list of known datasets for dropdown (from server)
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);

  const [expandedTitle, setExpandedTitle] = useState<string | null>(null);
  const [expandedChild, setExpandedChild] = useState<ReactNode | null>(null);

  const email = currentUserEmail();

  // NEW: fetch list from backend (sorted newest first) — we will filter to user's items later
  async function fetchDatasets(): Promise<DatasetMeta[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/datasets`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: DatasetMeta[] = Array.isArray(data?.datasets) ? data.datasets : [];
      return list.sort((a, b) =>
        a.created_at && b.created_at ? (a.created_at < b.created_at ? 1 : -1) : 0
      );
    } catch (e) {
      console.error("Failed to fetch datasets:", e);
      return [];
    }
  }

  // load CSV by id (same as before)
  async function loadById(id: string) {
    const res = await fetch(`${API_BASE_URL}/api/download/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    setRows(tryParseCSV(text));
    setDatasetId(id);
    // preserve per-user last used
    localStorage.setItem(userDatasetKeyName(email), id);
  }

  // Boot logic — **ONLY** load datasets associated with the current user.
  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      setErr(null);

      try {
        if (!email) {
          // No signed-in user — do not auto-load previous user's data
          setDatasets([]);
          setRows([]);
          setDatasetId(null);
          setErr("Please sign in to view your datasets.");
          setLoading(false);
          return;
        }

        // fetch all datasets index then filter to the user's dataset list stored in localStorage
        const all = await fetchDatasets();
        if (cancel) return;
        setDatasets(all);

        const myListRaw = localStorage.getItem(userDatasetsKey(email));
        const myList: DatasetMeta[] = myListRaw ? JSON.parse(myListRaw) : [];

        if (myList.length > 0) {
          // prefer the user's latest local record (client-side)
          const latest = myList[0].dataset_id;
          await loadById(latest);
        } else {
          // no user-owned datasets found locally — show message prompting upload
          setRows([]);
          setDatasetId(null);
          setErr("You don't have any uploaded datasets yet. Upload one from the Upload page.");
        }
      } catch (e: any) {
        console.error(e);
        setErr("Failed to load datasets. Check connection.");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    load();
    return () => {
      cancel = true;
    };
  }, [email]);

  // dropdown handler — when switching within user's list
  async function handleDatasetChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id) return;
    try {
      await loadById(id);
    } catch (e) {
      console.error(e);
      setErr("Failed to switch dataset.");
    }
  }

  // delete all on server — kept but note it clears disk globally
  async function resetAllDatasets() {
    if (!window.confirm("Delete ALL uploaded datasets from the server? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/datasets/clear`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // clear local per-user lists
      const allKeys = Object.keys(localStorage);
      const userKey = userDatasetsKey(email);
      localStorage.removeItem(userKey);
      localStorage.removeItem(userDatasetKeyName(email));
      setRows([]);
      setDatasetId(null);
      setDatasets([]);
      setErr("All datasets deleted successfully.");
    } catch (e) {
      console.error(e);
      alert("Failed to delete datasets on the server. Check backend logs.");
    }
  }

  /** ---------- Derived aggregations (unchanged) ---------- */
  const daily = useMemo(() => {
    const bucket: Record<
      string,
      { date: string; active: number; inactive: number; alerts: number; seconds: number; count: number }
    > = {};
    for (const r of rows) {
      const d = String(r["Date"] ?? "").trim();
      if (!d) continue;
      if (!bucket[d]) bucket[d] = { date: d, active: 0, inactive: 0, alerts: 0, seconds: 0, count: 0 };
      const s = String(r["Status"] ?? "").trim().toUpperCase();
      if (s.startsWith("ACT")) bucket[d].active++;
      else if (s.startsWith("IN")) bucket[d].inactive++;
      if (alertToBool(r["Alert"])) bucket[d].alerts++;
      bucket[d].seconds += parseDurationToSeconds(r["Duration"]);
      bucket[d].count += 1;
    }
    return Object.values(bucket).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [rows]);

  const topReasons = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      const reason = (r["Reason"] ?? "").toString().trim() || "Unknown";
      map[reason] = (map[reason] || 0) + 1;
    }
    return Object.entries(map)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [rows]);

  const statusSplit = useMemo(() => {
    const active = rows.filter((r) => (r["Status"] ?? "").toString().toUpperCase().startsWith("ACT")).length;
    const inactive = rows.filter((r) => (r["Status"] ?? "").toString().toUpperCase().startsWith("IN")).length;
    return [
      { name: "Active", value: active },
      { name: "Inactive", value: inactive },
    ];
  }, [rows]);

  const alertsDonut = useMemo(() => {
    const alerts = rows.reduce((a, r) => a + (alertToBool(r["Alert"]) ? 1 : 0), 0);
    const noAlerts = Math.max(rows.length - alerts, 0);
    return [
      { name: "Alerts", value: alerts },
      { name: "No Alerts", value: noAlerts },
    ];
  }, [rows]);

  const durationByReason = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      const reason = (r["Reason"] ?? "").toString().trim() || "Unknown";
      map[reason] = (map[reason] || 0) + parseDurationToSeconds(r["Duration"]);
    }
    return Object.entries(map)
      .map(([reason, seconds]) => ({ reason, seconds }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 12);
  }, [rows]);

  const alertsByReason = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      if (!alertToBool(r["Alert"])) continue;
      const reason = (r["Reason"] ?? "").toString().trim() || "Unknown";
      map[reason] = (map[reason] || 0) + 1;
    }
    return Object.entries(map)
      .map(([reason, alerts]) => ({ reason, alerts }))
      .sort((a, b) => b.alerts - a.alerts)
      .slice(0, 12);
  }, [rows]);

  const issuesTop = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      const issue = (r["Issue"] ?? "").toString().trim() || "Unknown";
      map[issue] = (map[issue] || 0) + 1;
    }
    return Object.entries(map)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [rows]);

  const cumulativeDuration = useMemo(() => {
    let run = 0;
    return daily.map((d) => {
      run += d.seconds;
      return { date: d.date, cumSeconds: run };
    });
  }, [daily]);

  const activePctPerDay = useMemo(() => {
    return daily.map((d) => {
      const total = d.active + d.inactive || 1;
      return { date: d.date, activePct: Math.round((d.active / total) * 10000) / 100 };
    });
  }, [daily]);

  const eventsByHour = useMemo(() => {
    const bucket: Record<number, number> = {};
    for (let h = 0; h < 24; h++) bucket[h] = 0;
    for (const r of rows) {
      const s = String(r["Start_Time"] ?? "").trim();
      if (!s) continue;
      const h = Number((s.split(":")[0] || "").trim());
      if (!Number.isNaN(h) && h >= 0 && h <= 23) bucket[h] += 1;
    }
    return Object.entries(bucket).map(([hour, count]) => ({
      hour,
      count,
    }));
  }, [rows]);

  const durationVsStart = useMemo(() => {
    const data: { startMin: number; durSec: number }[] = [];
    for (const r of rows) {
      const sm = parseClockToMin(r["Start_Time"]);
      if (sm == null) continue;
      data.push({ startMin: sm, durSec: parseDurationToSeconds(r["Duration"]) });
    }
    return data.slice(0, 1000);
  }, [rows]);

  const totalRows = rows.length;

  if (loading) return <div style={{ padding: 20 }}>Loading dataset…</div>;

  if ((!rows || rows.length === 0) && err) {
    return (
      <div
        style={{
          height: "100vh",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          boxSizing: "border-box",
        }}
      >
        <div className="card" style={{ maxWidth: 720, width: "100%", textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>No data found</div>
          <div className="tile-title" style={{ marginBottom: 14 }}>{err}</div>
          <a className="btn btn-accent" href="/upload" style={{ display: "inline-block" }}>
            Upload a dataset
          </a>
        </div>
      </div>
    );
  }

  /** ---------- expansion helpers ---------- */
  function openExpanded(title: string, child: ReactNode) {
    setExpandedTitle(title);
    setExpandedChild(child);
    // prevent background scroll
    document.body.style.overflow = "hidden";
  }
  function closeExpanded() {
    setExpandedTitle(null);
    setExpandedChild(null);
    document.body.style.overflow = ""; // restore
  }

  // Get user's local dataset list for dropdown (localStorage)
  const myLocalDatasets: DatasetMeta[] = (() => {
    const raw = localStorage.getItem(userDatasetsKey(email));
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })();

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        maxWidth: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        padding: 16,
        boxSizing: "border-box",
        display: "grid",
        gap: 14,
        gridAutoRows: "min-content",
      }}
    >
      {/* Header */}
      <div
        className="card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div>
          <strong>Data Visualization</strong>
          <div style={{ opacity: 0.6, fontSize: 13 }}>
            {datasetId ? `Dataset ID: ${datasetId}` : "Local dataset"} • {totalRows.toLocaleString()} rows
          </div>
        </div>

        {/* UI: only show user's datasets in selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={datasetId ?? ""}
            onChange={handleDatasetChange}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "#0a1724", // changed background color (per request)
              color: "var(--text)",
              fontSize: 14,
              minWidth: 220,
            }}
          >
            <option value="">{email ? "Select your dataset" : "Sign in to select a dataset"}</option>
            {myLocalDatasets.map((d) => (
              <option key={d.dataset_id} value={d.dataset_id}>
                {d.filename || d.dataset_id} {d.created_at ? `(${new Date(d.created_at).toLocaleString()})` : ""}
              </option>
            ))}
          </select>

          <button className="btn" onClick={resetAllDatasets} title="Deletes all datasets on server and clears local cache">
            Reset Cache
          </button>

          {datasetId && (
            <a
              className="btn"
              href={`${API_BASE_URL}/api/download/${datasetId}`}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Download size={16} /> Download CSV
            </a>
          )}
        </div>
      </div>

      {/* Charts grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: 16,
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          justifyItems: "stretch",
          alignItems: "stretch",
        }}
      >
        {/* 1. Status Split */}
        <CardClickable title="Status Split" onExpand={(c) => openExpanded("Status Split", c)}>
          <ResponsiveContainer width="100%" height={CH}>
            <PieChart margin={CM}>
              <Pie dataKey="value" data={statusSplit} cx="50%" cy="50%" outerRadius={100} label>
                <Cell fill={C.cyan} />
                <Cell fill={C.amber} />
              </Pie>
              <Legend />
              <RTooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardClickable>

        {/* 2. Top Reasons (count) */}
        <CardClickable title="Top Reasons (count)" onExpand={(c) => openExpanded("Top Reasons (count)", c)}>
          <ResponsiveContainer width="100%" height={CH}>
            <BarChart data={topReasons} margin={CM}>
              <CartesianGrid strokeOpacity={0.2} />
              <XAxis dataKey="reason" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis />
              <RTooltip />
              <Bar dataKey="count" fill={C.violet} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardClickable>

        {/* ... the rest of the graphs remain exactly the same (unchanged) ... */}

        {/* 3. Status by Date */}
        <CardClickable title="Status by Date" onExpand={(c) => openExpanded("Status by Date", c)}>
          <ResponsiveContainer width="100%" height={CH}>
            <AreaChart data={daily} margin={CM}>
              <CartesianGrid strokeOpacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-20} height={60} textAnchor="end" />
              <YAxis />
              <RTooltip />
              <Area type="monotone" dataKey="active" stackId="s" fill={C.cyan} stroke={C.cyan} fillOpacity={0.3} />
              <Area type="monotone" dataKey="inactive" stackId="s" fill={C.amber} stroke={C.amber} fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </CardClickable>

        {/* 4. Alerts per Day */}
        <CardClickable title="Alerts per Day" onExpand={(c) => openExpanded("Alerts per Day", c)}>
          <ResponsiveContainer width="100%" height={CH}>
            <LineChart data={daily} margin={CM}>
              <CartesianGrid strokeOpacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-20} height={60} textAnchor="end" />
              <YAxis />
              <RTooltip />
              <Line type="monotone" dataKey="alerts" stroke={C.red} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardClickable>

        {/* 5. Alerts vs No Alerts */}
        <CardClickable title="Alerts vs No Alerts" onExpand={(c) => openExpanded("Alerts vs No Alerts", c)}>
          <ResponsiveContainer width="100%" height={CH}>
            <PieChart margin={CM}>
              <Pie dataKey="value" data={alertsDonut} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
                <Cell fill={C.red} />
                <Cell fill={C.green} />
              </Pie>
              <Legend />
              <RTooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardClickable>

        {/* 6. Duration by Reason (seconds) */}
        <CardClickable title="Duration by Reason (s)" onExpand={(c) => openExpanded("Duration by Reason (s)", c)}>
          <ResponsiveContainer width="100%" height={CH}>
            <BarChart data={durationByReason} margin={CM}>
              <CartesianGrid strokeOpacity={0.2} vertical={false} />
              <XAxis dataKey="reason" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis />
              <RTooltip />
              <Bar dataKey="seconds" fill={C.teal} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardClickable>

        {/* 7. Cumulative Duration */}
        <CardClickable title="Cumulative Duration (s)" onExpand={(c) => openExpanded("Cumulative Duration (s)", c)}>
          <ResponsiveContainer width="100%" height={CH}>
            <AreaChart data={cumulativeDuration} margin={CM}>
              <CartesianGrid strokeOpacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-20} height={60} textAnchor="end" />
              <YAxis />
              <RTooltip />
              <Area type="monotone" dataKey="cumSeconds" stroke={C.green} fill={C.green} fillOpacity={0.28} />
            </AreaChart>
          </ResponsiveContainer>
        </CardClickable>

        {/* 8. Active % per Day */}
        <CardClickable title="Active % per Day" onExpand={(c) => openExpanded("Active % per Day", c)}>
          <ResponsiveContainer width="100%" height={CH}>
            <LineChart data={activePctPerDay} margin={CM}>
              <CartesianGrid strokeOpacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-20} height={60} textAnchor="end" />
              <YAxis domain={[0, 100]} />
              <RTooltip formatter={(v: any) => [`${Number(v ?? 0).toFixed(2)}%`, "Active %"]} />
              <Line type="monotone" dataKey="activePct" stroke={C.blue} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardClickable>

        {/* 9. Events by Hour (from Start_Time) */}
        <CardClickable title="Events by Hour (Start_Time)" onExpand={(c) => openExpanded("Events by Hour (Start_Time)", c)}>
          <ResponsiveContainer width="100%" height={CH}>
            <BarChart data={eventsByHour} margin={CM}>
              <CartesianGrid strokeOpacity={0.2} vertical={false} />
              <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} />
              <YAxis />
              <RTooltip labelFormatter={(h: any) => `${h}:00`} />
              <Bar dataKey="count" fill={C.orange} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardClickable>

        {/* 10. Alerts by Reason */}
        <CardClickable title="Alerts by Reason" onExpand={(c) => openExpanded("Alerts by Reason", c)}>
          <ResponsiveContainer width="100%" height={CH}>
            <BarChart data={alertsByReason} margin={CM}>
              <CartesianGrid strokeOpacity={0.2} vertical={false} />
              <XAxis dataKey="reason" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis />
              <RTooltip />
              <Bar dataKey="alerts" fill={C.pink} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardClickable>

        {/* 11. Top Issues */}
        <CardClickable title="Top Issues (count)" onExpand={(c) => openExpanded("Top Issues (count)", c)}>
          <ResponsiveContainer width="100%" height={CH}>
            <BarChart data={issuesTop} margin={CM}>
              <CartesianGrid strokeOpacity={0.2} vertical={false} />
              <XAxis dataKey="issue" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis />
              <RTooltip />
              <Bar dataKey="count" fill={C.amber} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardClickable>

        {/* 12. Scatter: Duration vs Start Time (mins) */}
        <CardClickable title="Duration vs Start Time (mins)" onExpand={(c) => openExpanded("Duration vs Start Time (mins)", c)}>
          <ResponsiveContainer width="100%" height={CH}>
            <ScatterChart margin={CM}>
              <CartesianGrid strokeOpacity={0.2} />
              <XAxis type="number" dataKey="startMin" name="Start (min)" />
              <YAxis type="number" dataKey="durSec" name="Duration (s)" />
              <ZAxis range={[60, 220]} />
              <RTooltip />
              <Scatter data={durationVsStart} fill={C.violet} />
            </ScatterChart>
          </ResponsiveContainer>
        </CardClickable>
      </div>

      {/* Expanded overlay (if any) */}
      {expandedChild && expandedTitle && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeExpanded}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(5,10,16,0.9)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
            boxSizing: "border-box",
            cursor: "zoom-out",
          }}
        >
          <div
            className="card"
            onClick={(ev) => ev.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "1200px",
              height: "90vh",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              overflow: "hidden",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>
                {expandedTitle} <span style={{ opacity: 0.6, fontWeight: 500, marginLeft: 8, fontSize: 13 }}>— click outside to close</span>
              </div>
              <div>
                <button
                  onClick={closeExpanded}
                  className="btn"
                  style={{ background: "transparent", color: "#cbd5e1", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
              {/* If expandedChild is a single React element we attempt to clone it and set larger dimensions;
                  otherwise render as-is inside a ResponsiveContainer wrapper. */}
              {isValidElement(expandedChild) ? (
                // If it's a ResponsiveContainer already, clone and override props
                (() => {
                  try {
                    // If child is a ResponsiveContainer element, clone and override props
                    const cloned = cloneElement(expandedChild as React.ReactElement<any>, {
                      width: "100%",
                      height: "100%",
                      style: { width: "100%", height: "100%" },
                    });
                    return <div style={{ width: "100%", height: "100%" }}>{cloned}</div>;
                  } catch {
                    // Fallback: render inside ResponsiveContainer
                    return (
                      <ResponsiveContainer width="100%" height="100%">
                        {expandedChild as any}
                      </ResponsiveContainer>
                    );
                  }
                })()
              ) : (
                // Not a React element: just render it inside a container
                <div style={{ width: "100%", height: "100%", overflow: "auto" }}>{expandedChild}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ---------- small components ---------- */

/** CardClickable
 *  - wraps a card and enables click-to-expand by passing the exact child node to the parent handler.
 *  - adds a subtle hover scale effect.
 */
function CardClickable({
  title,
  children,
  onExpand,
}: {
  title: string;
  children: ReactNode;
  onExpand?: (child: ReactNode) => void;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 10,
        display: "grid",
        gap: 8,
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
        transformOrigin: "center center",
        cursor: onExpand ? "zoom-in" : "default",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "scale(1.02)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 10px 30px rgba(0,0,0,0.45)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "";
      }}
      onClick={() => {
        if (onExpand) onExpand(children);
      }}
    >
      <div className="tile-title" style={{ fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{title}</span>
        {onExpand ? <span style={{ fontSize: 12, opacity: 0.6 }}>Click to expand</span> : null}
      </div>
      <div style={{ width: "100%", height: CH, overflow: "hidden" }}>{children}</div>
    </div>
  );
}
