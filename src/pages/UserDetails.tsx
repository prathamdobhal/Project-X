// src/pages/UserDetails.tsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../lib/config";

type Dataset = {
  id: string;
  name?: string;
  file_name?: string;
  created_at?: string | number | null;
  uploaded_at?: string | number | null;
};

/**
 * parseToDate
 * - Accepts numeric epoch (seconds or ms), ISO-like strings, and naive "YYYY-MM-DD HH:MM:SS" strings.
 * - If a string has no timezone part, we treat it as UTC by appending 'Z' before parsing.
 *
 * NOTE: The param is typed as `any` to allow `instanceof Date` checks without TS errors.
 */
function parseToDate(input?: any): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return input;

  const s = String(input).trim();
  if (!s) return null;

  // Pure numeric timestamp (seconds or ms)
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    // if less than 1e12 -> seconds, else ms
    return new Date(n < 1e12 ? n * 1000 : n);
  }

  // If it already has a timezone offset or Z, parse normally
  if (/[zZ]$/.test(s) || /[+\-]\d{2}:\d{2}$/.test(s) || /[+\-]\d{2}\d{2}$/.test(s)) {
    const parsed = Date.parse(s);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }

  // If string looks like "YYYY-MM-DD" (date only)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // treat as UTC midnight for consistency
    const parsed = Date.parse(`${s}T00:00:00Z`);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }

  // If string looks like "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS" without tz
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(s)) {
    const isoUtc = s.replace(" ", "T") + "Z";
    const parsed = Date.parse(isoUtc);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }

  // Fallback: try normal Date.parse
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return new Date(parsed);

  // Last resort: replace space with 'T' and append Z
  const alt = s.replace(" ", "T");
  const altParsed = Date.parse(alt + "Z");
  if (!Number.isNaN(altParsed)) return new Date(altParsed);

  return null;
}

/**
 * fmtDate
 * - Formats to India Standard Time (Asia/Kolkata).
 * - Returns "—" when date invalid.
 */
function fmtDate(ts?: string | number | null) {
  const d = parseToDate(ts);
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return d.toString();
  }
}

function pickName(d: Dataset) {
  return d.name || d.file_name || d.id || "Unnamed dataset";
}

/**
 * Helpers for per-user dataset index stored in localStorage.
 * Key scheme: `user_datasets_<userKey>` where userKey is email or name lowercased.
 */
function getUserKeyFromLocalStorage(): string | null {
  try {
    const raw = localStorage.getItem("ops_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const key = (parsed?.email || parsed?.name || parsed?.username || parsed?.user || "").toString().trim();
    return key ? key.toLowerCase().replace(/\s+/g, "_") : null;
  } catch {
    return null;
  }
}

function readUserDatasetList(userKey: string | null): string[] {
  if (!userKey) return [];
  const k = `user_datasets_${userKey}`;
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (Array.isArray(list)) return list.filter(Boolean).map(String);
    return [];
  } catch {
    return [];
  }
}

export default function UserDetails(): JSX.Element {
  const nav = useNavigate();

  const [user, setUser] = useState<{ name?: string; email?: string; joined?: string } | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [savedDatasetId, setSavedDatasetId] = useState<string | null>(() => localStorage.getItem("dataset_key"));
  const [uploadCount, setUploadCount] = useState<number>(() => Number(localStorage.getItem("upload_count") || "0"));
  const [lastUpload, setLastUpload] = useState<string | null>(() => localStorage.getItem("last_upload"));
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Keep the user's key for per-user dataset list
  const [userKey, setUserKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ops_user");
      if (!raw) {
        nav("/auth", { replace: true });
        return;
      }
      const parsed = JSON.parse(raw);
      setUser({
        name: parsed?.name ?? parsed?.displayName ?? parsed?.username,
        email: parsed?.email ?? parsed?.user,
        joined: parsed?.joined ?? parsed?.created_at,
      });
      const k = (parsed?.email || parsed?.name || parsed?.username || parsed?.user || "").toString().trim();
      const normalizedKey = k ? k.toLowerCase().replace(/\s+/g, "_") : null;
      setUserKey(normalizedKey);
    } catch {
      nav("/auth", { replace: true });
    }
  }, [nav]);

  /**
   * fetchDatasets:
   * - fetches dataset index from backend (if available)
   * - filters the list to only show those dataset ids that belong to current user (from localStorage)
   * - updates upload_count / last_upload / saved dataset info using the filtered list
   *
   * NOTE: The dataset sections are not displayed in this edited layout, but we keep logic in case other parts depend on it.
   */
  const fetchDatasets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const base = API_BASE_URL ?? "";
      if (!base) throw new Error("No backend base URL configured.");

      const res = await fetch(`${base}/api/datasets`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // backend returns {count, datasets: [...] } in our backend; support both shapes
      const listRaw: any[] = Array.isArray(json) ? json : Array.isArray(json.datasets) ? json.datasets : [];

      // Normalize dataset shape
      const normalized = listRaw
        .map((d: any) => ({
          id: (d.id ?? d.dataset_id ?? d.key ?? "") as string,
          name: (d.name ?? d.title ?? d.file_name ?? "") as string,
          created_at: (d.created_at ?? d.uploaded_at ?? d.created ?? null) as string | null,
          uploaded_at: (d.uploaded_at ?? d.created_at ?? null) as string | null,
        }))
        .filter((d) => d.id)
        .sort((a, b) => {
          const da = parseToDate(a.uploaded_at ?? a.created_at);
          const db = parseToDate(b.uploaded_at ?? b.created_at);
          return (db?.getTime() ?? 0) - (da?.getTime() ?? 0);
        });

      // Read per-user dataset id list from localStorage
      const ownedIds = readUserDatasetList(userKey);

      // Filter normalized list to only show datasets that are in user's ownedIds.
      const filtered = ownedIds.length > 0 ? normalized.filter((d) => ownedIds.includes(d.id)) : [];

      // Save displayed datasets
      setDatasets(filtered);

      if (filtered.length > 0) {
        const latest = filtered[0];
        const parsedLatest = parseToDate(latest.uploaded_at ?? latest.created_at);
        const iso = parsedLatest ? parsedLatest.toISOString() : new Date().toISOString();

        localStorage.setItem("dataset_key", latest.id);
        localStorage.setItem("last_upload", iso);
        localStorage.setItem("upload_count", String(filtered.length));
        setSavedDatasetId(latest.id);
        setLastUpload(iso);
        setUploadCount(filtered.length);
      } else {
        setDatasets([]);
        setSavedDatasetId(null);
        setLastUpload(null);
        setUploadCount(0);
        localStorage.removeItem("dataset_key");
        localStorage.removeItem("dataset_sample");
        localStorage.setItem("upload_count", "0");
        localStorage.removeItem("last_upload");
      }
    } catch (err: any) {
      const ownedIds = readUserDatasetList(userKey);
      if (ownedIds.length > 0) {
        const fallback = ownedIds.map((id) => ({ id, name: "", created_at: null, uploaded_at: null }));
        setDatasets(fallback);
        setUploadCount(fallback.length);
        setLastUpload(null);
        setSavedDatasetId(fallback[0]?.id ?? null);
      } else {
        setDatasets([]);
        setUploadCount(0);
        setSavedDatasetId(null);
      }
      setError("Could not reach backend; showing local values.");
    } finally {
      setLoading(false);
    }
  }, [userKey]);

  useEffect(() => {
    // fetch after userKey is known
    if (userKey === undefined) return;
    fetchDatasets();
  }, [fetchDatasets, userKey]);

  const handleSignOut = () => {
    localStorage.removeItem("ops_user");
    // Keep per-user dataset lists persisted, but remove ephemeral dataset_key/sample to avoid cross-user leak
    localStorage.removeItem("dataset_key");
    localStorage.removeItem("dataset_sample");
    localStorage.removeItem("last_upload");
    localStorage.removeItem("upload_count");
    nav("/auth", { replace: true });
  };

  const goUpload = () => nav("/upload");
  const downloadSaved = () => {
    if (!savedDatasetId) return;
    const base = API_BASE_URL ?? "";
    window.open(`${base}/api/download/${savedDatasetId}`, "_blank");
  };

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        overflowY: "auto",
        boxSizing: "border-box",
        padding: "20px 36px",
        background: "var(--bg, #0b1220)",
        color: "var(--text, #e6eef8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Centered full-page user card */}
      <div
        style={{
          width: "100%",
          maxWidth: 980,
          borderRadius: 16,
          padding: 36,
          background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.00))",
          border: "1px solid rgba(255,255,255,0.04)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              minWidth: 96,
              minHeight: 96,
              borderRadius: 16,
              background: "linear-gradient(135deg,#22d3ee,#60a5fa)",
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
              fontSize: 28,
              color: "#021627",
            }}
          >
            {user?.name ? user.name.split(" ").map((p) => p[0]).slice(0, 2).join("") : "OC"}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{user?.name ?? "OpsCoPilot user"}</div>
            <div style={{ color: "#94a3b8", fontSize: 16 }}>{user?.email ?? "—"}</div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginTop: 8,
          }}
        >
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              background: "rgba(255,255,255,0.01)",
              border: "1px solid rgba(255,255,255,0.03)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ color: "#94a3b8", fontSize: 13 }}>Account ID</div>
            <div style={{ marginTop: 10, fontFamily: "monospace", fontSize: 18, fontWeight: 800 }}>
              {user?.name ? `user_${user.name.replace(/\s+/g, "_").toLowerCase()}` : "—"}
            </div>
          </div>

          <div
            style={{
              padding: 18,
              borderRadius: 12,
              background: "rgba(255,255,255,0.01)",
              border: "1px solid rgba(255,255,255,0.03)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ color: "#94a3b8", fontSize: 13 }}>Joined</div>
            <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>{fmtDate(user?.joined)}</div>
          </div>
        </div>

        {/* Controls row */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 6 }}>
          <button
            onClick={goUpload}
            style={{
              background: "linear-gradient(90deg,#0ea5e9,#0284c7)",
              color: "#04212a",
              border: "none",
              padding: "10px 16px",
              borderRadius: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Upload Dataset
          </button>
          <button
            onClick={handleSignOut}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "#e6eef8",
              padding: "10px 14px",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {error && (
        <div style={{ position: "fixed", bottom: 20, left: 20, color: "#fca5a5", fontSize: 13 }}>{error}</div>
      )}
    </div>
  );
}

const tileStyle: React.CSSProperties = {
  borderRadius: 12,
  padding: 14,
  background: "rgba(255,255,255,0.01)",
  border: "1px solid rgba(255,255,255,0.03)",
};

const cardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.01)",
  border: "1px solid rgba(255,255,255,0.03)",
};
