"""Minimal, dependency-free MP4 header reader.

Reads only the `moov` atom (never decodes video) to report resolution,
duration and frame count, so the API does not need OpenCV or ffprobe.
Returns None for anything it cannot read - callers show "Not available".
"""
from __future__ import annotations

import struct
from pathlib import Path
from typing import Optional

_CONTAINERS = {b"moov", b"trak", b"mdia", b"minf", b"stbl"}


def _boxes(buf: bytes, start: int, end: int):
    pos = start
    while pos + 8 <= end:
        size, kind = struct.unpack(">I4s", buf[pos:pos + 8])
        header = 8
        if size == 1:
            if pos + 16 > end:
                return
            size = struct.unpack(">Q", buf[pos + 8:pos + 16])[0]
            header = 16
        elif size == 0:
            size = end - pos
        if size < header or pos + size > end:
            return
        yield kind, pos + header, pos + size
        pos += size


def _walk(buf: bytes, start: int, end: int, trak: dict | None, out: list):
    for kind, b_start, b_end in _boxes(buf, start, end):
        if kind == b"trak":
            t: dict = {}
            _walk(buf, b_start, b_end, t, out)
            out.append(t)
        elif kind in _CONTAINERS:
            _walk(buf, b_start, b_end, trak, out)
        elif trak is not None:
            if kind == b"tkhd":
                version = buf[b_start]
                # width/height follow the 36-byte matrix at the end of tkhd
                if version == 0:
                    off = b_start + 4 + 4 + 4 + 4 + 4 + 4 + 8 + 2 + 2 + 2 + 2 + 36
                else:
                    off = b_start + 4 + 8 + 8 + 4 + 4 + 8 + 8 + 2 + 2 + 2 + 2 + 36
                if off + 8 <= b_end:
                    w, h = struct.unpack(">II", buf[off:off + 8])
                    trak["width"], trak["height"] = w >> 16, h >> 16
            elif kind == b"hdlr":
                trak["handler"] = buf[b_start + 8:b_start + 12]
            elif kind == b"mdhd":
                version = buf[b_start]
                if version == 0:
                    ts, dur = struct.unpack(">II", buf[b_start + 12:b_start + 20])
                else:
                    ts = struct.unpack(">I", buf[b_start + 20:b_start + 24])[0]
                    dur = struct.unpack(">Q", buf[b_start + 24:b_start + 32])[0]
                trak["timescale"], trak["duration"] = ts, dur
            elif kind == b"stts":
                n = struct.unpack(">I", buf[b_start + 4:b_start + 8])[0]
                frames = 0
                for i in range(n):
                    o = b_start + 8 + i * 8
                    if o + 8 > b_end:
                        break
                    count, _delta = struct.unpack(">II", buf[o:o + 8])
                    frames += count
                trak["frames"] = frames


def read_video_info(path: Path) -> Optional[dict]:
    """Return {width,height,duration_s,frames,fps} or None if unreadable."""
    try:
        with open(path, "rb") as fh:
            pos = 0
            moov = None
            file_size = path.stat().st_size
            while pos + 8 <= file_size:
                fh.seek(pos)
                head = fh.read(16)
                size, kind = struct.unpack(">I4s", head[:8])
                header = 8
                if size == 1:
                    size = struct.unpack(">Q", head[8:16])[0]
                    header = 16
                elif size == 0:
                    size = file_size - pos
                if size < header:
                    break
                if kind == b"moov":
                    fh.seek(pos)
                    moov = fh.read(size)
                    break
                pos += size
            if moov is None:
                return None
        traks: list = []
        _walk(moov, 0, len(moov), None, traks)
        video = next((t for t in traks if t.get("handler") == b"vide"), None)
        if not video or not video.get("timescale"):
            return None
        duration_s = video["duration"] / video["timescale"]
        frames = video.get("frames")
        fps = (frames / duration_s) if frames and duration_s > 0 else None
        return {
            "width": video.get("width") or None,
            "height": video.get("height") or None,
            "duration_s": round(duration_s, 3),
            "frames": frames,
            "fps": round(fps, 3) if fps else None,
        }
    except (OSError, struct.error, ValueError, IndexError):
        return None
