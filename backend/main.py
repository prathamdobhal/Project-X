# backend/main.py
import io
import os
import uuid
import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException, status, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.encoders import jsonable_encoder

# === Persistent index (SQLite by default, switchable via DATABASE_URL) ===
from sqlalchemy import (
    create_engine, MetaData, Table, Column, String, Integer, DateTime, JSON,
    select, insert, delete
)

# ------------------filesystem------------------
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)  # <-- ensures backend/data exists

# ------------------ schema ------------------
REQUIRED_COLUMNS: List[str] = [
    "Status", "Date", "Start_Time", "End_Time", "Duration",
    "Alert", "Reason", "Issue", "Comment",
]

SYNONYMS: Dict[str, str] = {
    # status
    "status": "Status", "state": "Status",
    # date
    "date": "Date", "day": "Date",
    # start
    "start": "Start_Time", "start_time": "Start_Time", "starttime": "Start_Time",
    "start time": "Start_Time", "start time (local)": "Start_Time",
    # end
    "end": "End_Time", "end_time": "End_Time", "endtime": "End_Time",
    "end time": "End_Time", "end time (local)": "End_Time",
    # duration
    "duration": "Duration", "dur": "Duration",
    # alert
    "alert": "Alert", "alert_flag": "Alert", "alerted": "Alert",
    # reason / issue
    "reason": "Reason", "issue": "Issue",
    # comment / notes
    "comment": "Comment", "notes": "Comment", "description": "Comment",
}

def _norm(s: str) -> str:
  return (s or "").strip().lower().replace("-", "_").replace(" ", "_")

def map_columns(incoming: List[str]) -> Tuple[Dict[str, str], List[str]]:
  """incoming->canonical mapping + list of missing required after mapping."""
  mapping: Dict[str, str] = {}

  # direct matches
  for inc in incoming:
    n = _norm(inc)
    for req in REQUIRED_COLUMNS:
      if n == _norm(req):
        mapping[inc] = req
        break

  # synonyms
  for inc in incoming:
    if inc in mapping: continue
    n = _norm(inc)
    if n in SYNONYMS:
      mapping[inc] = SYNONYMS[n]

  # conservative partial (unambiguous)
  for inc in incoming:
    if inc in mapping: continue
    n = _norm(inc)
    if not n: continue
    hits = [c for c in REQUIRED_COLUMNS if _norm(c) in n or n in _norm(c)]
    if len(hits) == 1:
      mapping[inc] = hits[0]

  mapped = set(mapping.values())
  missing = [c for c in REQUIRED_COLUMNS if c not in mapped]
  return mapping, missing

# ------------------ app ------------------
app = FastAPI(title="Ops CoPilot Backend", version="1.0.0")

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],  # tighten in prod
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

# ------------------ in-memory registry (kept) ------------------
IN_MEMORY: Dict[str, Dict[str, Any]] = {}

# ------------------ DB bootstrap ------------------
# Uses SQLite file by default: backend/datasets.db
DB_URL = os.getenv("DATABASE_URL") or f"sqlite:///{(BASE_DIR / 'datasets.db').as_posix()}"
engine = create_engine(DB_URL, future=True)
metadata = MetaData()

datasets_table = Table(
  "datasets",
  metadata,
  Column("id", String, primary_key=True),
  Column("filename", String),
  Column("owner", String),                  # NEW: owner column (optional)
  Column("columns", JSON),                 # stored as TEXT JSON on SQLite
  Column("rows", Integer),
  Column("file_path", String),
  Column("created_at", DateTime, default=datetime.datetime.utcnow),
)

# Create table if not exists
metadata.create_all(engine)

@app.get("/health")
def health():
  return {"ok": True, "data_dir": str(DATA_DIR), "db_url": DB_URL}

@app.post("/api/upload")
async def api_upload(file: UploadFile = File(...), owner: Optional[str] = Form(None)):
  """Validate → map → save to backend/data/<dataset_id>.csv → return dataset_id."""
  if not (file.filename or "").lower().endswith(".csv"):
    raise HTTPException(status_code=400, detail="Only .csv files are accepted.")

  raw = await file.read()
  try:
    df_raw = pd.read_csv(io.BytesIO(raw))
  except Exception:
    try:
      df_raw = pd.read_csv(io.BytesIO(raw), encoding="latin1")
    except Exception as e:
      raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

  incoming = list(df_raw.columns)
  mapping, missing = map_columns(incoming)

  if missing:
    # Hard gate: must include all required columns
    return JSONResponse(
      status_code=400,
      content={
        "error": "Missing required columns",
        "message": "file doesnt contain necessary columns",
        "missing": missing,
        "incoming_columns": incoming,
        "mapping_used": mapping,
      },
    )

  # rename and keep extras
  df = df_raw.rename(columns=mapping)
  ordered = REQUIRED_COLUMNS + [c for c in df.columns if c not in REQUIRED_COLUMNS]
  df = df[ordered]

  # --- persist to backend/data ---
  dataset_id = str(uuid.uuid4())
  csv_path = DATA_DIR / f"{dataset_id}.csv"
  try:
    df.to_csv(csv_path, index=False)   # <-- saved here
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to persist CSV: {e}")

  # registry (optional)
  IN_MEMORY[dataset_id] = {
    "rows": int(len(df)),
    "columns": list(df.columns),
    "path": str(csv_path),
    "filename": file.filename,
    "owner": owner,
  }

  # NEW: persist metadata in DB so it survives restarts
  try:
    with engine.begin() as conn:
      conn.execute(
        insert(datasets_table).values(
          id=dataset_id,
          filename=file.filename,
          owner=owner,
          columns=list(df.columns),
          rows=int(len(df)),
          file_path=str(csv_path),
          created_at=datetime.datetime.utcnow(),
        )
      )
  except Exception as e:
    # Do not fail the upload just because the index insert failed
    # (CSV already saved and usable via /api/download)
    print(f"[WARN] Failed to index dataset in DB: {e}")

  sample = df.head(5).replace([np.nan, np.inf, -np.inf], None)
  payload = {
    "status": "ok",
    "dataset_id": dataset_id,
    "dataset_key": dataset_id,              # alias for frontend
    "rows": int(len(df)),
    "columns": list(df.columns),
    "stored_paths": {"csv": str(csv_path)}, # let frontend know where it lives
    "sample_rows": sample.to_dict(orient="records"),
    "mapping_used": mapping,
    "owner": owner,
  }
  return JSONResponse(content=jsonable_encoder(payload))

@app.get("/api/download/{dataset_id}")
def api_download(dataset_id: str, owner: Optional[str] = None):
  """Visuals page downloads the saved CSV from backend/data. Enforce owner if dataset has owner."""
  # First try file on disk
  csv_path = DATA_DIR / f"{dataset_id}.csv"
  # Attempt to read DB metadata to enforce owner rules (if present)
  db_owner: Optional[str] = None
  db_file_path: Optional[str] = None
  try:
    with engine.begin() as conn:
      row = conn.execute(
        select(datasets_table.c.owner, datasets_table.c.file_path).where(datasets_table.c.id == dataset_id)
      ).fetchone()
      if row:
        db_owner = row.owner
        db_file_path = row.file_path
  except Exception:
    # DB read failing should not immediately block; we'll fallback to file path detection
    db_owner = None
    db_file_path = None

  # If dataset has an owning user (in DB or in memory), require owner param match
  mem = IN_MEMORY.get(dataset_id)
  mem_owner = mem.get("owner") if mem else None
  effective_owner = db_owner if db_owner is not None else mem_owner

  if effective_owner:
    # require owner param and match it
    if not owner:
      raise HTTPException(status_code=403, detail="Owner required to download this dataset")
    if str(owner) != str(effective_owner):
      raise HTTPException(status_code=403, detail="Forbidden: owner mismatch")
    # owner matches -- proceed
  # else: no owner set, allow public download (legacy)

  # prefer disk path from DATA_DIR if exists
  if csv_path.exists():
    return FileResponse(csv_path, media_type="text/csv", filename=f"{dataset_id}.csv")

  # fallback: if DB knows a path and file exists there
  if db_file_path and Path(db_file_path).exists():
    return FileResponse(db_file_path, media_type="text/csv", filename=f"{dataset_id}.csv")

  # last attempt: in-memory path
  if mem and mem.get("path") and Path(mem.get("path")).exists():
    return FileResponse(mem.get("path"), media_type="text/csv", filename=f"{dataset_id}.csv")

  raise HTTPException(status_code=404, detail="Dataset not found")

@app.get("/api/datasets")
def api_datasets(owner: Optional[str] = None):
  """
  Return persistent dataset index from DB (preferred), falling back to in-memory registry.
  If `owner` query param is supplied, filter results to that owner.
  Keeps original response shape: { count, datasets: [ {dataset_id, rows, columns, path, filename, created_at?, owner?} ] }
  """
  datasets: List[Dict[str, Any]] = []
  used_db = False
  try:
    with engine.begin() as conn:
      if owner:
        rows = conn.execute(select(datasets_table).where(datasets_table.c.owner == owner)).fetchall()
      else:
        rows = conn.execute(select(datasets_table)).fetchall()
      for r in rows:
        datasets.append({
          "dataset_id": r.id,
          "rows": r.rows,
          "columns": r.columns,
          "path": r.file_path,
          "filename": r.filename,
          "created_at": r.created_at.isoformat() if r.created_at else None,
          "owner": r.owner if hasattr(r, "owner") else None,
        })
      used_db = True
  except Exception as e:
    print(f"[WARN] /api/datasets DB read failed, falling back to memory: {e}")

  if not used_db:
    # Fallback to in-memory (legacy behavior)
    for k, v in IN_MEMORY.items():
      if owner:
        if v.get("owner") != owner:
          continue
      datasets.append({"dataset_id": k, **v})

  return {"count": len(datasets), "datasets": datasets}

# NEW: delete all datasets (disk + DB + memory)
@app.delete("/api/datasets/clear")
def api_clear_datasets():
  """Delete all datasets from database, disk, and memory."""
  deleted_files = []
  failed_files = []

  # Remove CSV files
  for f in DATA_DIR.glob("*.csv"):
    try:
      f.unlink()
      deleted_files.append(f.name)
    except Exception as e:
      failed_files.append({"file": f.name, "error": str(e)})

  # Clear DB table
  try:
    with engine.begin() as conn:
      conn.execute(delete(datasets_table))
  except Exception as e:
    print(f"Warning: Could not clear DB table: {e}")

  # Clear in-memory
  IN_MEMORY.clear()

  return JSONResponse(
    content={
      "status": "ok",
      "deleted_files": deleted_files,
      "failed_files": failed_files,
      "message": "All datasets cleared successfully."
    },
    status_code=status.HTTP_200_OK
  )

@app.get("/")
def root():
  return {"message": "Backend running. See /docs", "data_dir": str(DATA_DIR), "db_url": DB_URL}
