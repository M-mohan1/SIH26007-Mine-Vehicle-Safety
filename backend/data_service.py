"""Read-only data layer for the SIH26007 web API.

* Reads the CSV files and demo videos the original pipeline already produced.
* Never imports YOLO / OpenCV / pandas and never runs inference.
* Every public function returns plain JSON-serialisable dicts with a
  ``status`` field: ``ok`` | ``partial`` | ``empty`` | ``missing`` | ``error``.
  Nothing is invented: unknown values are ``None`` (the UI shows "Not available").
"""
from __future__ import annotations

import csv
import math
import os
import re
from collections import Counter, OrderedDict
from pathlib import Path
from typing import Any, Optional

from .mp4_info import read_video_info

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("SIH_DATA_DIR", REPO_ROOT / "data")).resolve()

# Paths are relative to DATA_DIR. Only these files can ever be served.
CSV_FILES = {
    "risk_results": "output/risk_results.csv",
    "fog_evaluation": "output/fog_evaluation_summary.csv",
    "recovery_comparison": "output/recovery_comparison.csv",
}

VIDEO_ALLOWLIST: "OrderedDict[str, dict]" = OrderedDict([
    ("fog_risk_demo", {
        "path": "output/fog_risk_demo.mp4",
        "title": "Annotated risk detection (65% synthetic fog)",
        "kind": "annotated",
        "description": "Output of src/risk/risk_demo.py: YOLO11n + ByteTrack boxes, track IDs, "
                       "risk status, estimated distance and proxy TTC drawn on every frame.",
        "telemetry": True,
    }),
    ("visibility_comparison_demo", {
        "path": "output/visibility_comparison_demo.mp4",
        "title": "Visibility recovery comparison (72% synthetic fog)",
        "kind": "comparison",
        "description": "Output of src/detection/visibility_recovery.py: raw foggy RGB (left) beside "
                       "CLAHE-enhanced RGB with a pseudo-IR contrast inset (right).",
        "telemetry": False,
    }),
    ("vehicle_clear", {
        "path": "input/vehicle.mp4",
        "title": "Clear source footage (no annotations)",
        "kind": "source",
        "description": "The original clear video that the synthetic fog is applied to.",
        "telemetry": False,
    }),
])

RISK_VIDEO_ID = "fog_risk_demo"
STATUSES = ("SAFE", "WARNING", "DANGER")
STATUS_RANK = {"SAFE": 0, "WARNING": 1, "DANGER": 2}
MIN_CONFIRM_FRAMES_DEFAULT = 8  # same default as the Streamlit dashboard slider


# --------------------------------------------------------------------------- helpers
def _norm(header: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (header or "").lower())


def _num(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        f = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _int(value: Any) -> Optional[int]:
    f = _num(value)
    if f is None or f != int(f):
        return None
    return int(f)


def _r(value: Optional[float], nd: int = 2) -> Optional[float]:
    return None if value is None else round(value, nd)


def _rel(path: str) -> str:
    return "data/" + path


def read_csv(rel_path: str) -> dict:
    """Return {state, headers, rows, message}. state: ok|missing|empty|error."""
    path = (DATA_DIR / rel_path)
    if not path.is_file():
        return {"state": "missing", "headers": [], "rows": [],
                "message": f"{_rel(rel_path)} was not found."}
    try:
        with open(path, newline="", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            headers = [h for h in (reader.fieldnames or []) if h is not None]
            rows = [r for r in reader if any((v or "").strip() for v in r.values() if isinstance(v, str))]
    except (OSError, UnicodeDecodeError, csv.Error) as exc:
        return {"state": "error", "headers": [], "rows": [],
                "message": f"{_rel(rel_path)} could not be read: {exc}"}
    if not headers:
        return {"state": "empty", "headers": [], "rows": [],
                "message": f"{_rel(rel_path)} is empty."}
    if not rows:
        return {"state": "empty", "headers": headers, "rows": [],
                "message": f"{_rel(rel_path)} has a header but no data rows."}
    return {"state": "ok", "headers": headers, "rows": rows, "message": None}


def _map_columns(headers: list[str], spec: dict[str, str]) -> dict[str, Optional[str]]:
    """Map our field names to the CSV's real headers via normalised prefixes."""
    normed = {h: _norm(h) for h in headers}
    out: dict[str, Optional[str]] = {}
    for field, prefix in spec.items():
        out[field] = next((h for h, n in normed.items() if n.startswith(prefix)), None)
    return out


# --------------------------------------------------------------------------- videos
def video_path(video_id: str) -> Optional[Path]:
    """Resolve an allowlisted id to a file path, or None. Never touches user input paths."""
    entry = VIDEO_ALLOWLIST.get(video_id)
    if entry is None:
        return None
    p = (DATA_DIR / entry["path"]).resolve()
    try:
        p.relative_to(DATA_DIR)
    except ValueError:
        return None
    return p if p.is_file() else None


_info_cache: dict[tuple[str, float, int], Optional[dict]] = {}


def _video_info_cached(path: Path) -> Optional[dict]:
    st = path.stat()
    key = (str(path), st.st_mtime, st.st_size)
    if key not in _info_cache:
        _info_cache[key] = read_video_info(path)
    return _info_cache[key]


def get_videos() -> dict:
    items = []
    for vid, meta in VIDEO_ALLOWLIST.items():
        p = video_path(vid)
        item = {
            "id": vid, "title": meta["title"], "kind": meta["kind"],
            "description": meta["description"], "has_telemetry": meta["telemetry"],
            "available": p is not None, "file": _rel(meta["path"]),
            "stream_url": f"/api/videos/{vid}/stream" if p else None,
            "size_bytes": None, "width": None, "height": None,
            "duration_s": None, "frames": None, "fps": None,
        }
        if p:
            item["size_bytes"] = p.stat().st_size
            info = _video_info_cached(p) or {}
            for k in ("width", "height", "duration_s", "frames", "fps"):
                item[k] = info.get(k)
        items.append(item)
    n = sum(1 for i in items if i["available"])
    return {"status": "ok" if n == len(items) else ("partial" if n else "missing"),
            "videos": items, "available_count": n}


def _risk_video_info() -> dict:
    p = video_path(RISK_VIDEO_ID)
    return (_video_info_cached(p) if p else None) or {}


# --------------------------------------------------------------------------- telemetry
_TELEMETRY_SPEC = {
    "frame": "frame", "track_id": "trackid", "class_name": "classname",
    "confidence": "confidence", "width_px": "widthpx", "height_px": "heightpx",
    "growth_px": "growthpx", "est_distance_m": "estdistancem",
    "closing_speed_mps": "closingspeedmps", "proxy_ttc_s": "proxyttcs",
    "risk_status": "riskstatus",
}
_REQUIRED = ("frame", "track_id", "risk_status")


def load_telemetry() -> dict:
    """Parse risk_results.csv into clean observation dicts plus diagnostics."""
    raw = read_csv(CSV_FILES["risk_results"])
    base = {"source": _rel(CSV_FILES["risk_results"]), "warnings": [], "observations": []}
    if raw["state"] != "ok":
        return {**base, "status": raw["state"], "message": raw["message"]}

    cols = _map_columns(raw["headers"], _TELEMETRY_SPEC)
    missing_required = [c for c in _REQUIRED if cols[c] is None]
    if missing_required:
        return {**base, "status": "error",
                "message": "risk_results.csv is missing required columns: " + ", ".join(missing_required),
                "columns_found": raw["headers"]}
    optional_missing = [c for c, h in cols.items() if h is None]
    if optional_missing:
        base["warnings"].append("Optional columns missing: " + ", ".join(optional_missing))

    skipped = 0
    obs = []
    for row in raw["rows"]:
        frame, tid = _int(row.get(cols["frame"])), _int(row.get(cols["track_id"]))
        status = (row.get(cols["risk_status"]) or "").strip().upper()
        if frame is None or tid is None or frame < 1 or status not in STATUS_RANK:
            skipped += 1
            continue

        def g(field: str):
            h = cols[field]
            return row.get(h) if h else None

        obs.append({
            "frame": frame, "track_id": tid,
            "class_name": (g("class_name") or "").strip() or None,
            "confidence": _r(_num(g("confidence")), 2),
            "width_px": _r(_num(g("width_px")), 1), "height_px": _r(_num(g("height_px")), 1),
            "growth_px": _r(_num(g("growth_px")), 1),
            "est_distance_m": _r(_num(g("est_distance_m")), 2),
            "closing_speed_mps": _r(_num(g("closing_speed_mps")), 2),
            "proxy_ttc_s": _r(_num(g("proxy_ttc_s")), 1),
            "risk_status": status,
        })
    if skipped:
        base["warnings"].append(f"{skipped} malformed row(s) were skipped.")
    if not obs:
        return {**base, "status": "empty", "message": "No valid rows in risk_results.csv."}
    obs.sort(key=lambda o: (o["frame"], o["track_id"]))
    return {**base, "status": "partial" if base["warnings"] else "ok", "observations": obs,
            "skipped_rows": skipped}


def _worst(statuses) -> str:
    return max(statuses, key=lambda s: STATUS_RANK[s])


def _track_summaries(obs: list[dict], min_confirm: int) -> list[dict]:
    by_track: dict[int, list[dict]] = {}
    for o in obs:
        by_track.setdefault(o["track_id"], []).append(o)
    out = []
    for tid, rows in sorted(by_track.items()):
        classes = Counter(r["class_name"] for r in rows if r["class_name"])
        counts = Counter(r["risk_status"] for r in rows)

        def mn(key):
            vals = [r[key] for r in rows if r[key] is not None]
            return min(vals) if vals else None

        def mx(key):
            vals = [r[key] for r in rows if r[key] is not None]
            return max(vals) if vals else None

        confs = [r["confidence"] for r in rows if r["confidence"] is not None]
        labels = [r["class_name"] for r in rows if r["class_name"]]
        switches = sum(1 for a, b in zip(labels, labels[1:]) if a != b)
        out.append({
            "track_id": tid,
            "class_name": classes.most_common(1)[0][0] if classes else None,
            "frames_seen": len(rows),
            "class_switches": switches,  # label flips change the width prior used for distance
            "first_frame": rows[0]["frame"], "last_frame": rows[-1]["frame"],
            "confirmed": len(rows) >= min_confirm,
            "peak_status": _worst(counts),
            "status_frames": {s: counts.get(s, 0) for s in STATUSES},
            "max_growth_px": mx("growth_px"),
            "max_width_px": mx("width_px"),
            "min_est_distance_m": mn("est_distance_m"),
            "min_proxy_ttc_s": mn("proxy_ttc_s"),
            "max_closing_speed_mps": mx("closing_speed_mps"),
            "avg_confidence": _r(sum(confs) / len(confs), 2) if confs else None,
        })
    return out


def _events(obs: list[dict], fps: Optional[float]) -> list[dict]:
    """Contiguous runs of the same non-SAFE status for one track (consecutive frames)."""
    events: list[dict] = []
    by_track: dict[int, list[dict]] = {}
    for o in obs:
        by_track.setdefault(o["track_id"], []).append(o)
    for tid, rows in by_track.items():
        run: list[dict] = []
        for o in rows + [None]:  # sentinel flushes the last run
            if run and (o is None or o["risk_status"] != run[0]["risk_status"]
                        or o["frame"] != run[-1]["frame"] + 1):
                if run[0]["risk_status"] != "SAFE":
                    def vals(k):
                        return [r[k] for r in run if r[k] is not None]
                    events.append({
                        "track_id": tid, "class_name": run[0]["class_name"],
                        "status": run[0]["risk_status"],
                        "start_frame": run[0]["frame"], "end_frame": run[-1]["frame"],
                        "frames": len(run),
                        "start_time_s": _r((run[0]["frame"] - 1) / fps, 2) if fps else None,
                        "end_time_s": _r(run[-1]["frame"] / fps, 2) if fps else None,
                        "peak_growth_px": max(vals("growth_px"), default=None),
                        "min_est_distance_m": min(vals("est_distance_m"), default=None),
                        "min_proxy_ttc_s": min(vals("proxy_ttc_s"), default=None),
                        "max_closing_speed_mps": max(vals("closing_speed_mps"), default=None),
                    })
                run = []
            if o is not None:
                run.append(o)
    events.sort(key=lambda e: (e["start_frame"], e["track_id"]))
    for i, e in enumerate(events, 1):
        e["id"] = f"E{i}"
    return events


def _frame_distribution(obs: list[dict], total_frames: Optional[int]) -> dict:
    per_frame: dict[int, str] = {}
    for o in obs:
        cur = per_frame.get(o["frame"])
        per_frame[o["frame"]] = o["risk_status"] if cur is None else _worst([cur, o["risk_status"]])
    c = Counter(per_frame.values())
    dist = {s: c.get(s, 0) for s in STATUSES}
    dist["with_vehicle"] = len(per_frame)
    dist["total"] = total_frames
    dist["no_vehicle"] = (total_frames - len(per_frame)) if total_frames else None
    return dist


def get_telemetry() -> dict:
    t = load_telemetry()
    if t["status"] in ("missing", "empty", "error"):
        return {k: v for k, v in t.items() if k != "observations"} | {"frames": [], "fps": None}
    info = _risk_video_info()
    return {
        "status": t["status"], "source": t["source"], "warnings": t["warnings"],
        "video_id": RISK_VIDEO_ID, "fps": info.get("fps"),
        "total_frames": info.get("frames"),
        "count": len(t["observations"]), "observations": t["observations"],
    }


def get_risk_events(min_confirm: int = MIN_CONFIRM_FRAMES_DEFAULT, status: Optional[str] = None,
                    limit: Optional[int] = None) -> dict:
    t = load_telemetry()
    if t["status"] in ("missing", "empty", "error"):
        return {k: v for k, v in t.items() if k != "observations"} | {
            "events": [], "vehicles": [], "distribution": None}
    obs = t["observations"]
    info = _risk_video_info()
    fps, total_frames = info.get("fps"), info.get("frames")
    events = _events(obs, fps)
    if status:
        events = [e for e in events if e["status"] == status.upper()]
    shown = events[:limit] if limit else events
    obs_counts = Counter(o["risk_status"] for o in obs)
    return {
        "status": t["status"], "source": t["source"], "warnings": t["warnings"],
        "video_id": RISK_VIDEO_ID, "fps": fps, "total_frames": total_frames,
        "min_confirm_frames": min_confirm,
        "event_count": len(events), "events": shown,
        "vehicles": _track_summaries(obs, min_confirm),
        "distribution": {
            "observations": {**{s: obs_counts.get(s, 0) for s in STATUSES}, "total": len(obs)},
            "frames": _frame_distribution(obs, total_frames),
        },
        "classification": {  # read from the engine's documented defaults, shown for explanation
            "rule": "growth_px = bbox width now minus bbox width up to 4 frames earlier (5-frame window)",
            "warning_above_px": 25.0, "danger_above_px": 50.0,
            "ttc_used_for_classification": False,
        },
    }


# --------------------------------------------------------------------------- benchmarks
_FOG_SPEC = {
    "condition": "visibilitycondition", "fog_intensity": "fogintensity",
    "total_frames": "totalframes", "active_frames": "activeframes",
    "blind_spot_frames": "blindspotframes", "detection_rate_pct": "detectionrate",
    "confirmed_tracks": "confirmedtracks", "noise_ids": "noiseflickerids",
    "avg_confidence": "avgconfidence",
}
_REC_SPEC = {
    "pipeline": "pipelinemode", "total_frames": "totalframes",
    "active_frames": "activedetectionframes", "missed_frames": "missedblindspotframes",
    "detection_rate_pct": "detectionrate", "avg_confidence": "avgconfidence",
}


def _table(csv_key: str, spec: dict, int_fields: set, float_fields: set, text_fields: set) -> dict:
    raw = read_csv(CSV_FILES[csv_key])
    base = {"source": _rel(CSV_FILES[csv_key]), "warnings": [], "rows": []}
    if raw["state"] != "ok":
        return {**base, "status": raw["state"], "message": raw["message"]}
    cols = _map_columns(raw["headers"], spec)
    absent = [f for f, h in cols.items() if h is None]
    if absent:
        base["warnings"].append("Columns not found in CSV: " + ", ".join(absent))
    rows, skipped = [], 0
    for r in raw["rows"]:
        out: dict[str, Any] = {}
        for f, h in cols.items():
            v = r.get(h) if h else None
            if f in int_fields:
                out[f] = _int(v)
            elif f in float_fields:
                out[f] = _num(v)
            else:
                out[f] = (v or "").strip() or None
        if all(out[f] is None for f in out):
            skipped += 1
            continue
        rows.append(out)
    if skipped:
        base["warnings"].append(f"{skipped} unreadable row(s) skipped.")
    if not rows:
        return {**base, "status": "empty", "message": "No usable rows."}
    return {**base, "rows": rows, "status": "partial" if base["warnings"] else "ok"}


def get_fog_benchmark() -> dict:
    res = _table("fog_evaluation", _FOG_SPEC,
                 {"total_frames", "active_frames", "blind_spot_frames", "confirmed_tracks", "noise_ids"},
                 {"detection_rate_pct", "avg_confidence"}, {"condition", "fog_intensity"})
    for r in res["rows"]:
        r["fog_intensity_pct"] = _num((r.get("fog_intensity") or "").replace("%", ""))
    res["rows"].sort(key=lambda r: (r["fog_intensity_pct"] is None, r["fog_intensity_pct"] or 0))
    base = next((r for r in res["rows"] if r["fog_intensity_pct"] == 0), None)
    for r in res["rows"]:
        r["detection_rate_delta_pp"] = (
            _r(r["detection_rate_pct"] - base["detection_rate_pct"], 1)
            if base and r is not base and r["detection_rate_pct"] is not None
            and base["detection_rate_pct"] is not None else None)
    res["baseline_condition"] = base["condition"] if base else None
    return res


def get_recovery_comparison() -> dict:
    res = _table("recovery_comparison", _REC_SPEC,
                 {"total_frames", "active_frames", "missed_frames"},
                 {"detection_rate_pct", "avg_confidence"}, {"pipeline"})
    rows = res["rows"]
    raw = next((r for r in rows if re.search(r"standard|raw", r["pipeline"] or "", re.I)), None)
    enh = next((r for r in rows if re.search(r"clahe|enhanc", r["pipeline"] or "", re.I)), None)
    for r in rows:
        r["role"] = "baseline" if r is raw else ("enhanced" if r is enh else "other")
    delta = None
    if raw and enh:
        def d(a, b, nd=1):
            return None if raw[a] is None or enh[b] is None else _r(enh[b] - raw[a], nd)
        delta = {
            "detection_rate_pp": d("detection_rate_pct", "detection_rate_pct"),
            "blind_frames_recovered": (raw["missed_frames"] - enh["missed_frames"]
                                       if raw["missed_frames"] is not None and enh["missed_frames"] is not None
                                       else None),
            "avg_confidence": d("avg_confidence", "avg_confidence", 2),
        }
    res["delta"] = delta
    video = video_path("visibility_comparison_demo")
    res["video_id"] = "visibility_comparison_demo" if video else None
    return res


# --------------------------------------------------------------------------- health / overview
def _csv_health() -> list[dict]:
    out = []
    for key, rel in CSV_FILES.items():
        p = DATA_DIR / rel
        raw = read_csv(rel)
        out.append({"id": key, "kind": "csv", "file": _rel(rel), "state": raw["state"],
                    "rows": len(raw["rows"]), "message": raw["message"],
                    "modified": int(p.stat().st_mtime) if p.is_file() else None})
    return out


def get_health() -> dict:
    csvs = _csv_health()
    vids = get_videos()["videos"]
    ok = all(c["state"] == "ok" for c in csvs) and all(v["available"] for v in vids)
    return {
        "status": "ok" if ok else "degraded",
        "service": "SIH26007 mine-vehicle-safety API",
        "mode": "recorded_experiment",
        "inference_enabled": False,
        "data_dir_exists": DATA_DIR.is_dir(),
        "csv_files": csvs,
        "videos": [{"id": v["id"], "file": v["file"], "available": v["available"]} for v in vids],
    }


def get_overview(min_confirm: int = MIN_CONFIRM_FRAMES_DEFAULT) -> dict:
    ev = get_risk_events(min_confirm=min_confirm)
    info = _risk_video_info()
    health = get_health()
    base = {
        "mode": "recorded_experiment",
        "mode_note": "All figures come from a recorded, offline run on synthetic-fog footage. "
                     "This is not a live mine-camera feed.",
        "health": health,
        "run": {"video_id": RISK_VIDEO_ID, "total_frames": info.get("frames"),
                "fps": info.get("fps"), "duration_s": info.get("duration_s"),
                "width": info.get("width"), "height": info.get("height")},
    }
    if ev["status"] in ("missing", "empty", "error"):
        return {**base, "status": ev["status"], "message": ev.get("message"),
                "tracks": None, "distribution": None, "recent_events": [], "peak_status": None}
    vehicles = ev["vehicles"]
    classes = Counter(v["class_name"] for v in vehicles if v["class_name"])
    peak = _worst([v["peak_status"] for v in vehicles])
    recent = sorted(ev["events"], key=lambda e: -e["start_frame"])[:6]
    return {
        **base, "status": ev["status"], "warnings": ev["warnings"],
        "tracks": {"total": len(vehicles),
                   "confirmed": sum(1 for v in vehicles if v["confirmed"]),
                   "min_confirm_frames": min_confirm, "by_class": dict(classes),
                   "ids": [v["track_id"] for v in vehicles]},
        "distribution": ev["distribution"], "peak_status": peak,
        "event_count": ev["event_count"], "recent_events": recent,
        "vehicles": vehicles,
    }
