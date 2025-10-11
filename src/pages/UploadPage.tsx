// src/pages/UploadPage.tsx
import React, { useMemo, useRef, useState, DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud,
  FileText,
  AlertTriangle,
  Loader2,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import { API_BASE_URL } from "../lib/config";

/** ----------------- types ----------------- */
type Props = { onDataReady?: (rows: any[]) => void };

type UploadResponse = {
  status: "ok";
  dataset_id: string;
  dataset_key?: string;
  rows: number;
  columns: string[];
  stored_paths?: Record<string, string>;
  sample_rows?: any[];
  mapping_used?: Record<string, string>;
  unmapped_incoming_columns?: string[];
  // <--- filename can be returned by backend; mark optional to be safe
  filename?: string;
};


/** ----------------- schema ----------------- */
const REQUIRED = [
  "Status",
  "Date",
  "Start_Time",
  "End_Time",
  "Duration",
  "Alert",
  "Reason",
  "Issue",
  "Comment",
] as const;
type Canonical = typeof REQUIRED[number];

const SYNONYMS: Record<string, Canonical> = {
  status: "Status",
  state: "Status",
  date: "Date",
  day: "Date",
  start: "Start_Time",
  start_time: "Start_Time",
  starttime: "Start_Time",
  "start time": "Start_Time",
  "start time (local)": "Start_Time",
  end: "End_Time",
  end_time: "End_Time",
  endtime: "End_Time",
  "end time": "End_Time",
  "end time (local)": "End_Time",
  duration: "Duration",
  dur: "Duration",
  alert: "Alert",
  alert_flag: "Alert",
  alerted: "Alert",
  reason: "Reason",
  issue: "Issue",
  comment: "Comment",
  notes: "Comment",
  description: "Comment",
};

/** ----------------- helpers ----------------- */
const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, "_");
const fmt = (n: number) => n.toLocaleString();

function mapColumns(header: string[]) {
  const mapping: Record<string, Canonical> = {};
  for (const inc of header) {
    const n = norm(inc);
    for (const req of REQUIRED) {
      if (n === norm(req)) {
        mapping[inc] = req as Canonical;
        break;
      }
    }
  }
  for (const inc of header) {
    if (mapping[inc]) continue;
    const n = norm(inc);
    if (SYNONYMS[n]) mapping[inc] = SYNONYMS[n];
  }
  for (const inc of header) {
    if (mapping[inc]) continue;
    const n = norm(inc);
    const hits = (REQUIRED as readonly string[]).filter(
      (c) => norm(c).includes(n) || n.includes(norm(c))
    );
    if (hits.length === 1) mapping[inc] = hits[0] as Canonical;
  }
  const mappedCanon = new Set(Object.values(mapping));
  const missingCanon = (REQUIRED as readonly Canonical[]).filter((c) => !mappedCanon.has(c));
  return { mapping, missingCanon };
}

function safeSplit(row: string) {
  let inQ = false;
  let buf = "";
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') inQ = !inQ;
    if (ch === "," && inQ) buf += "§§COMMA§§";
    else buf += ch;
  }
  return buf
    .split(",")
    .map((s) => s.replace(/§§COMMA§§/g, ",").replace(/^"|"$/g, "").trim());
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
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

const to2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function computeSummary(rows: any[]) {
  const totalRows = rows.length;
  let active = 0;
  let inactive = 0;
  let alerts = 0;
  let totalDuration = 0;
  const reasonCounts: Record<string, number> = {};

  for (const r of rows) {
    const status = String(r["Status"] ?? "").trim().toUpperCase();
    if (status.startsWith("ACT")) active++;
    else if (status.startsWith("IN")) inactive++;
    if (alertToBool(r["Alert"])) alerts++;
    totalDuration += parseDurationToSeconds(r["Duration"]);
    const reason = (r["Reason"] ?? "").toString().trim() || "Unknown";
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }

  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const activePct = totalRows ? to2((active / totalRows) * 100) : 0;
  const inactivePct = totalRows ? to2((inactive / totalRows) * 100) : 0;

  return { totalRows, active, inactive, alerts, totalDuration, topReasons, activePct, inactivePct };
}

/** ----------------- small utilities for per-user storage ----------------- */
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

/** ----------------- component ----------------- */
export default function UploadPage({ onDataReady }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [status, setStatus] = useState<string>("Drop a CSV or click to select.");
  const [summary, setSummary] = useState<ReturnType<typeof computeSummary> | null>(null);
  const [datasetKey, setDatasetKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ready, setReady] = useState(false);
  const [errorSimple, setErrorSimple] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  function resetAll() {
    setIsDragging(false);
    setFileName("");
    setStatus("Drop a CSV or click to select.");
    setSummary(null);
    setDatasetKey(null);
    setUploading(false);
    setReady(false);
    setErrorSimple(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    if (!file || !file.name.toLowerCase().endsWith(".csv")) {
      setStatus("Please upload a valid CSV file (.csv).");
      return;
    }
    setFileName(file.name);
    setStatus("Reading CSV…");
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length === 0) return setStatus("Empty file.");

    const header = safeSplit(lines[0]);
    const { mapping, missingCanon } = mapColumns(header);

    // ⛔ Hard gate: show error view if missing columns
    if (missingCanon.length > 0) {
      setErrorSimple("file doesnt contain necessary columns");
      return;
    }

    const canonHeader = header.map((h) => mapping[h] ?? (h as any));
    const allRows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cells = safeSplit(line);
      const obj: any = {};
      canonHeader.forEach((colKey, idx) => (obj[colKey] = cells[idx] ?? ""));
      allRows.push(obj);
    }

    const sum = computeSummary(allRows);
    setSummary(sum);
    setReady(true);
    setStatus("Summary generated. Uploading to backend…");

    // --- NEW: prevent duplicate uploads by fingerprint ---
    // fingerprint consists of filename::size::lastModified which is stable per-file client side
    const fingerprint = `${file.name}::${file.size}::${file.lastModified}`;
    const email = currentUserEmail();
    const listKey = userDatasetsKey(email);
    const rawList = localStorage.getItem(listKey);
    const prev: any[] = rawList ? JSON.parse(rawList) : [];

    // If any previous entry has the same fingerprint, block the upload
    if (prev.some((p) => p?.fingerprint === fingerprint)) {
      setStatus("This file has already been uploaded for the current user.");
      return;
    }
    // ----------------------------------------------------

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE_URL}/api/upload`, { method: "POST", body: form });
      const data: UploadResponse = await res.json();

      // determine current user
      // const email = currentUserEmail(); // already computed above
      const key = data.dataset_key || data.dataset_id;

      // store per-user dataset key (instead of global dataset_key)
      localStorage.setItem(userDatasetKeyName(email), key);
      setDatasetKey(key);

      // Update per-user datasets list (store minimal metadata)
      // const listKey = userDatasetsKey(email); // already computed above
      // const rawList = localStorage.getItem(listKey);
      // const prev: any[] = rawList ? JSON.parse(rawList) : [];
      const newEntry = {
        dataset_id: data.dataset_id,
        filename: data.filename || file.name,
        created_at: new Date().toISOString(),
        rows: data.rows,
        columns: data.columns || [],
        fingerprint, // persist fingerprint so future uploads can be detected
      };
      // ensure unique by id
      const filtered = prev.filter((p) => p.dataset_id !== newEntry.dataset_id);
      filtered.unshift(newEntry); // newest first
      localStorage.setItem(listKey, JSON.stringify(filtered));

      localStorage.setItem(`dataset_columns_${key}`, JSON.stringify(data.columns || []));
      if (Array.isArray(data.sample_rows)) {
        localStorage.setItem(`dataset_sample_${key}`, JSON.stringify(data.sample_rows));
        onDataReady?.(data.sample_rows);
      }
    } catch (err) {
      console.error(err);
      setStatus("Upload failed. Check console for details.");
    } finally {
      setUploading(false);
    }
  }

  const durationHHMMSS = useMemo(() => {
    if (!summary) return "00:00:00";
    let sec = Math.max(0, Math.floor(summary.totalDuration));
    const h = Math.floor(sec / 3600);
    sec -= h * 3600;
    const m = Math.floor(sec / 60);
    sec -= m * 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }, [summary]);

  return (
    <div
      className="upload-page"
      style={{
        flex: 1,
        padding: 24,
        color: "var(--text)",
        paddingBottom: 120,
      }}
    >
      {/* State 1: Choose a file */}
      {!ready && !errorSimple && (
        <div
          className={`upload-area ${isDragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          style={{ marginTop: 60 }}
        >
          <UploadCloud size={100} strokeWidth={1.5} />
          <h2>Upload Your Dataset</h2>
          <p className="upload-text">
            Drop your CSV here or <span>click to upload</span>
          </p>
          <input
            ref={inputRef}
            id="file-input"
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
          />
          {fileName && <div className="upload-status">Selected: {fileName}</div>}
          <div className="upload-status">{status}</div>
        </div>
      )}

      {/* State 2: Missing columns → error card + re-choose */}
      {errorSimple && (
        <div
          className="upload-results"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            alignItems: "center",
            marginTop: 40,
          }}
        >
          <div
            className="card"
            style={{
              borderColor: "rgba(239,68,68,.5)",
              background: "rgba(239,68,68,.08)",
              maxWidth: 860,
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <div className="row" style={{ gap: 10, alignItems: "center" }}>
              <AlertTriangle size={20} />
              <div style={{ fontWeight: 700 }}>file doesnt contain necessary columns</div>
            </div>
            <div className="tile-title" style={{ marginTop: 8 }}>
              Please select another CSV that includes all required headers.
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={resetAll}>
                Choose another file
              </button>
            </div>
          </div>
        </div>
      )}

      {/* State 3: Valid file → KPIs + Top Reasons + CTAs */}
      {ready && summary && (
        <div
          className="upload-results"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 32,
            marginTop: 30,
            alignItems: "flex-start",
            maxWidth: 1100,
            width: "100%",
            marginInline: "auto",
            marginBottom: 80,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={16} />
            <span>{fileName}</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 24,
              width: "100%",
            }}
          >
            <Tile label="Total Records" value={fmt(summary.totalRows)} glow="0,153,255" border="rgba(59,130,246,.35)" />
            <Tile label="Active" value={fmt(summary.active)} glow="0,212,255" border="rgba(34,211,238,.35)" />
            <Tile label="Inactive" value={fmt(summary.inactive)} glow="255,178,36" border="rgba(245,158,11,.35)" />
            <Tile label="Alerts" value={fmt(summary.alerts)} glow="255,76,64" border="rgba(239,68,68,.35)" />
          </div>

          <div style={{ width: "100%", maxWidth: 420, marginTop: 16 }}>
            <Tile label="Total Duration" value={durationHHMMSS} glow="34,197,94" border="rgba(34,197,94,.35)" big />
          </div>

          <div
            className="card"
            style={{
              width: "100%",
              borderRadius: 14,
              border: "1px solid rgba(148,163,184,.18)",
              background: "linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,0))",
              boxShadow: "0 20px 50px rgba(0,0,0,.35)",
              padding: 18,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 12 }}>Top Reasons</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              {summary.topReasons.map(([r, c]) => (
                <li key={r}>
                  <span style={{ opacity: 0.9 }}>{r}</span> — <b>{fmt(c as number)}</b>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ width: "100%", marginTop: 10 }}>
            <div>{uploading ? "Uploading to backend…" : "Jump in"}</div>
            <div style={{ marginTop: 4 }}>Buttons will enable once backend save completes.</div>
            <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <button
                className="btn btn-accent"
                onClick={() => navigate("/visuals")}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <BarChart3 size={16} /> Go to Data Viz
              </button>
              <button
                className="btn"
                onClick={() => navigate("/chat")}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <MessageSquare size={16} /> Open Chat
              </button>
              <button className="btn" onClick={resetAll}>Upload Another</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ---- KPI Tile ---- */
function Tile({
  label,
  value,
  glow,
  border,
  big = false,
}: {
  label: string;
  value: string | number;
  glow: string;
  border: string;
  big?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        border: `1px solid ${border}`,
        borderRadius: 14,
        padding: "16px 20px",
        background: "linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,0))",
        boxShadow: `0 10px 40px rgba(${glow}, .18)`,
        minHeight: 95,
        transition: "transform 0.25s ease, box-shadow 0.25s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.04)";
        e.currentTarget.style.boxShadow = `0 12px 50px rgba(${glow}, .35)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = `0 10px 40px rgba(${glow}, .18)`;
      }}
    >
      <div style={{ opacity: 0.8 }}>{label}</div>
      <div
        style={{
          fontWeight: 900,
          fontSize: big ? 26 : 24,
          marginTop: 6,
          lineHeight: 1.15,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}
