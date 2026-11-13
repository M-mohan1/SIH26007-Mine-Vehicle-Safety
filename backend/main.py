"""FastAPI backend for the SIH26007 mine-vehicle-safety web dashboard.

Lightweight by design: it only reads the CSV files and MP4 demo videos that the
original pipeline already produced. It never loads YOLO and never runs inference.

Run from the repository root:
    uvicorn backend.main:app --reload --port 8000
"""
from __future__ import annotations

import os
from typing import Iterator, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from . import data_service as ds

app = FastAPI(
    title="SIH26007 Mine Vehicle Safety API",
    version="1.0.0",
    description="Read-only API over precomputed CSV results and demo videos.",
)

_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_methods=["GET", "HEAD", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)


@app.get("/api/health")
def health():
    return ds.get_health()


@app.get("/api/overview")
def overview(min_confirm_frames: int = Query(ds.MIN_CONFIRM_FRAMES_DEFAULT, ge=1, le=100)):
    return ds.get_overview(min_confirm=min_confirm_frames)


@app.get("/api/risk-events")
def risk_events(
    min_confirm_frames: int = Query(ds.MIN_CONFIRM_FRAMES_DEFAULT, ge=1, le=100),
    status: Optional[str] = Query(None),
    limit: Optional[int] = Query(None, ge=1, le=1000),
):
    if status is not None and status.upper() not in ds.STATUSES:
        raise HTTPException(status_code=422, detail="status must be one of SAFE, WARNING, DANGER")
    return ds.get_risk_events(min_confirm=min_confirm_frames, status=status, limit=limit)


@app.get("/api/telemetry")
def telemetry():
    return ds.get_telemetry()


@app.get("/api/fog-benchmark")
def fog_benchmark():
    return ds.get_fog_benchmark()


@app.get("/api/recovery-comparison")
def recovery_comparison():
    return ds.get_recovery_comparison()


@app.get("/api/videos")
def videos():
    return ds.get_videos()


# ----------------------------------------------------------------- video streaming
_CHUNK = 256 * 1024


def _parse_range(header: str, size: int) -> Optional[tuple[int, int]]:
    """Return (start, end) inclusive for a single byte range.

    None  -> header unusable (ignore it and send the whole file, per RFC 9110)
    raises ValueError -> syntactically valid but unsatisfiable (416)
    """
    unit, _, spec = header.partition("=")
    if unit.strip().lower() != "bytes" or "," in spec:
        return None
    first, dash, last = spec.strip().partition("-")
    if not dash:
        return None
    try:
        if first == "":  # suffix range: last N bytes
            n = int(last)
            if n <= 0:
                raise ValueError("unsatisfiable")
            return max(0, size - n), size - 1
        start = int(first)
        end = int(last) if last != "" else size - 1
    except ValueError as exc:
        if str(exc) == "unsatisfiable":
            raise
        return None
    if start < 0 or (last != "" and end < start):
        return None
    if start >= size:
        raise ValueError("unsatisfiable")
    return start, min(end, size - 1)


def _iter_file(path, start: int, end: int) -> Iterator[bytes]:
    remaining = end - start + 1
    with open(path, "rb") as fh:
        fh.seek(start)
        while remaining > 0:
            chunk = fh.read(min(_CHUNK, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@app.api_route("/api/videos/{video_id}/stream", methods=["GET", "HEAD"])
def stream_video(video_id: str, request: Request):
    if video_id not in ds.VIDEO_ALLOWLIST:
        raise HTTPException(status_code=404, detail=f"Unknown video id '{video_id}'.")
    path = ds.video_path(video_id)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Video '{video_id}' is allowed but its file ({ds.VIDEO_ALLOWLIST[video_id]['path']}) "
                   "is not present on the server.",
        )
    size = path.stat().st_size
    headers = {"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600"}
    range_header = request.headers.get("range")
    start, end, status = 0, size - 1, 200
    if range_header:
        try:
            parsed = _parse_range(range_header, size)
        except ValueError:
            return Response(status_code=416, headers={**headers, "Content-Range": f"bytes */{size}"})
        if parsed:
            start, end = parsed
            status = 206
            headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    length = end - start + 1
    headers["Content-Length"] = str(length)
    if request.method == "HEAD":
        return Response(status_code=status, headers=headers, media_type="video/mp4")
    return StreamingResponse(_iter_file(path, start, end), status_code=status,
                             headers=headers, media_type="video/mp4")
