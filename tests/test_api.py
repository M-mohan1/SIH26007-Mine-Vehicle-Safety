"""API tests against the real project files.

Run from the repository root:
    pip install -r requirements-api.txt pytest httpx
    pytest tests -v
"""
import csv
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.main import app  # noqa: E402
from backend import data_service as ds  # noqa: E402

client = TestClient(app)


def csv_rows(rel):
    with open(ROOT / "data" / rel, newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["inference_enabled"] is False
    assert body["mode"] == "recorded_experiment"
    assert {c["id"] for c in body["csv_files"]} == {"risk_results", "fog_evaluation", "recovery_comparison"}


def test_overview_matches_csv():
    rows = csv_rows("output/risk_results.csv")
    body = client.get("/api/overview").json()
    assert body["tracks"]["total"] == len({r["track_id"] for r in rows})
    obs = body["distribution"]["observations"]
    assert obs["total"] == len(rows)
    for s in ("SAFE", "WARNING", "DANGER"):
        assert obs[s] == sum(1 for r in rows if r["risk_status"] == s)
    assert body["distribution"]["frames"]["with_vehicle"] == len({r["frame"] for r in rows})


def test_risk_events_are_derived_from_csv():
    rows = csv_rows("output/risk_results.csv")
    body = client.get("/api/risk-events").json()
    flagged = sum(1 for r in rows if r["risk_status"] != "SAFE")
    assert sum(e["frames"] for e in body["events"]) == flagged
    assert all(e["status"] in ("WARNING", "DANGER") for e in body["events"])
    for e in body["events"]:
        assert e["end_frame"] - e["start_frame"] + 1 == e["frames"]


def test_risk_events_filter_and_validation():
    body = client.get("/api/risk-events?status=DANGER").json()
    assert body["events"] and all(e["status"] == "DANGER" for e in body["events"])
    assert client.get("/api/risk-events?status=BOGUS").status_code == 422
    assert client.get("/api/risk-events?limit=0").status_code == 422


def test_telemetry_count():
    body = client.get("/api/telemetry").json()
    assert body["count"] == len(csv_rows("output/risk_results.csv"))
    assert body["fps"] == 24.0


def test_fog_benchmark_matches_csv():
    rows = csv_rows("output/fog_evaluation_summary.csv")
    body = client.get("/api/fog-benchmark").json()
    assert len(body["rows"]) == len(rows)
    assert [r["detection_rate_pct"] for r in body["rows"]] == [float(r["Detection Rate (%)"]) for r in rows]


def test_recovery_comparison():
    body = client.get("/api/recovery-comparison").json()
    assert {r["role"] for r in body["rows"]} == {"baseline", "enhanced"}
    assert body["delta"]["detection_rate_pp"] == pytest.approx(15.0)


def test_videos_list():
    body = client.get("/api/videos").json()
    ids = {v["id"] for v in body["videos"]}
    assert ids == set(ds.VIDEO_ALLOWLIST)
    assert all(v["available"] for v in body["videos"])


def test_video_full_and_range():
    size = (ROOT / "data/output/fog_risk_demo.mp4").stat().st_size
    full = client.get("/api/videos/fog_risk_demo/stream")
    assert full.status_code == 200 and len(full.content) == size
    assert full.headers["accept-ranges"] == "bytes"
    assert full.headers["content-type"] == "video/mp4"

    part = client.get("/api/videos/fog_risk_demo/stream", headers={"Range": "bytes=100-199"})
    assert part.status_code == 206
    assert part.headers["content-range"] == f"bytes 100-199/{size}"
    assert part.content == full.content[100:200]

    open_end = client.get("/api/videos/fog_risk_demo/stream", headers={"Range": "bytes=1000-"})
    assert open_end.status_code == 206 and open_end.content == full.content[1000:]

    suffix = client.get("/api/videos/fog_risk_demo/stream", headers={"Range": "bytes=-50"})
    assert suffix.status_code == 206 and suffix.content == full.content[-50:]

    bad = client.get("/api/videos/fog_risk_demo/stream", headers={"Range": f"bytes={size + 10}-"})
    assert bad.status_code == 416
    assert bad.headers["content-range"] == f"bytes */{size}"


def test_video_head():
    r = client.head("/api/videos/fog_risk_demo/stream")
    assert r.status_code == 200 and int(r.headers["content-length"]) > 0


@pytest.mark.parametrize("vid", ["../../etc/passwd", "..%2f..%2fetc%2fpasswd", "nope", "fog_risk_demo.mp4"])
def test_video_rejects_non_allowlisted(vid):
    r = client.get(f"/api/videos/{vid}/stream")
    assert r.status_code == 404


# ---- degraded-data behaviour (uses a temporary data dir) -------------------------------
@pytest.fixture
def empty_data(tmp_path, monkeypatch):
    (tmp_path / "output").mkdir()
    monkeypatch.setattr(ds, "DATA_DIR", tmp_path)
    return tmp_path


def test_missing_files(empty_data):
    assert client.get("/api/fog-benchmark").json()["status"] == "missing"
    assert client.get("/api/risk-events").json()["status"] == "missing"
    assert client.get("/api/overview").json()["status"] == "missing"
    assert client.get("/api/videos/fog_risk_demo/stream").status_code == 404
    assert client.get("/api/health").json()["status"] == "degraded"


def test_empty_and_malformed(empty_data):
    out = empty_data / "output"
    (out / "fog_evaluation_summary.csv").write_text("")
    assert client.get("/api/fog-benchmark").json()["status"] == "empty"

    (out / "recovery_comparison.csv").write_text("Pipeline Mode,Total Frames\n")
    assert client.get("/api/recovery-comparison").json()["status"] == "empty"

    (out / "risk_results.csv").write_text("foo,bar\n1,2\n")
    body = client.get("/api/risk-events").json()
    assert body["status"] == "error" and "missing required columns" in body["message"]

    (out / "risk_results.csv").write_text(
        "frame,track_id,risk_status\n1,1,SAFE\nx,1,SAFE\n2,1,WARNING\n3,1,NONSENSE\n")
    body = client.get("/api/risk-events").json()
    assert body["status"] == "partial"
    assert body["distribution"]["observations"]["total"] == 2
    assert any("skipped" in w for w in body["warnings"])
    assert body["events"][0]["min_est_distance_m"] is None  # optional column absent -> None, not invented
