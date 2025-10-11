import React, { useMemo, useState, DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, FileText } from "lucide-react";
// If your validator file is named/placed differently, adjust this import.
import { validateHeader, toTwoDecimals, REQUIRED_COLUMNS } from "./SchemeValidator";

type Row = Record<string, any>;

export default function Dashboard({ onDataReady }: { onDataReady: (rows: Row[]) => void }) {
  const [schemaStatus, setSchemaStatus] = useState<string>("No file uploaded");
  const [rows, setRows] = useState<Row[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string } | null>(null);
  const navigate = useNavigate();

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setSchemaStatus("Please upload a valid CSV file.");
      return;
    }
    setFileInfo({ name: file.name, size: (file.size / 1024).toFixed(1) + " KB" });
    const text = await file.text();
    parseCSV(text);
  }

  /** Robust CSV splitting (handles quotes and commas in quotes) */
  function splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          cur += '"'; // escaped quote
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());

    // strip surrounding quotes
    return out.map((v) => (v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v));
  }

  function parseCSV(text: string) {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
    if (!lines.length) {
      setSchemaStatus("Empty file.");
      return;
    }

    const header = splitCsvLine(lines[0]).map((s) => s.trim());
    const val = validateHeader(header);
    setSchemaStatus(val.message);
    if (!val.ok) return;

    const data: Row[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i]);
      const obj: Row = {};
      header.forEach((h, idx) => (obj[h] = cells[idx] ?? ""));

      // numeric fields to normalize
      const numericKeys = [
        "Production_Tons",
        "Fuel_Consumption_Liters",
        "Operating_Hours",
        "Maintenance_Duration_Hours",
        "Downtime_Hours",
        "Maintenance_Cost_USD",
        "Fuel_Efficiency_TonPerLiter",
      ];
      for (const key of numericKeys) {
        const raw = obj[key];
        if (raw !== undefined && raw !== null && raw !== "") {
          const n = Number(String(raw).replace(/,/g, ""));
          if (!Number.isNaN(n)) obj[key] = toTwoDecimals(n);
        }
      }
      data.push(obj);
    }

    setRows(data);
    onDataReady(data);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const totals = useMemo(() => {
    if (!rows.length) return null;
    const sum = (key: string) =>
      rows.reduce((a, r) => a + (Number(String(r[key]).replace(/,/g, "")) || 0), 0);

    const prod = sum("Production_Tons");
    const fuel = sum("Fuel_Consumption_Liters");
    const hours = sum("Operating_Hours");
    const efficiency = fuel ? prod / fuel : 0;

    const qualityVals = rows
      .map((r) => Number(String(r["Quality_Grade"] ?? "").replace(/,/g, "")))
      .filter((n) => Number.isFinite(n));
    const avgQuality = qualityVals.length
      ? qualityVals.reduce((a, b) => a + b, 0) / qualityVals.length
      : 0;

    const cost = sum("Maintenance_Cost_USD");

    return {
      Total_Production_Tons: toTwoDecimals(prod),
      Total_Fuel_Consumption_Liters: toTwoDecimals(fuel),
      Total_Operating_Hours: toTwoDecimals(hours),
      Fleet_Fuel_Efficiency: toTwoDecimals(efficiency),
      Average_Quality_Grade: toTwoDecimals(avgQuality),
      Total_Maintenance_Cost_USD: toTwoDecimals(cost),
      Records: rows.length,
    };
  }, [rows]);

  return (
    <div className="upload-page">
      {/* Upload area (before upload) */}
      {!rows.length && (
        <div
          className={`upload-area ${isDragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <UploadCloud size={100} strokeWidth={1.5} />
          <h2>Upload Your Dataset</h2>
          <p className="upload-text">
            Drop your CSV here or <span>click to upload</span>
          </p>

          {/* Expected schema hint */}
          {Array.isArray(REQUIRED_COLUMNS) && REQUIRED_COLUMNS.length > 0 && (
            <div className="upload-hint">
              Expected columns: <code>{REQUIRED_COLUMNS.join(", ")}</code>
            </div>
          )}

          <input
            id="file-input"
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
          />
          <div className="upload-status">{schemaStatus}</div>
        </div>
      )}

      {/* After upload: file info + summary stats */}
      {!!rows.length && (
        <div className="upload-results">
          {fileInfo && (
            <div className="file-banner">
              <FileText size={22} />
              <span className="file-name">{fileInfo.name}</span>
              <span className="file-size">{fileInfo.size}</span>
            </div>
          )}

          <h2 className="summary-title">📊 Dataset Summary</h2>
          <div className="stats-grid">
            {Object.entries(totals ?? {}).map(([k, v]) => (
              <div key={k} className="stat-card">
                {/* avoid replaceAll for TS/lib compatibility */}
                <div className="stat-title">{k.split("_").join(" ")}</div>
                <div className="stat-value">{String(v)}</div>
              </div>
            ))}
          </div>

          <div className="next-steps full">
            <div className="next-title">Dataset loaded ✓</div>
            <div className="next-sub">Where do you want to go next?</div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-accent" onClick={() => navigate("/visuals")}>
                Go to Data Viz
              </button>
              <button className="btn" onClick={() => navigate("/chat")}>
                Open Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
