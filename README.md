# SIH26007 – Mine Vehicle Safety in Fog and Low Visibility

Safe and efficient operation of mine vehicles in fog and low-visibility conditions in open-cast iron ore mines.

This repository has two parts:

1. **The AI pipeline** (`src/`): YOLO11n detection, ByteTrack tracking, a box-growth risk engine, pinhole distance/TTC estimates, a fog benchmark, and CLAHE visibility recovery. A Streamlit dashboard (`src/dashboard/app.py`) is included. **Unchanged.**
2. **A web dashboard** (`frontend/` + `backend/`): a React app and a small FastAPI API that display the pipeline's saved results (CSV files and demo videos).

> **Recorded data, not live.** The web app shows results of an offline run on pre-recorded footage with *synthetic* fog. It does not stream from a camera and does not run any detection. The "pseudo-IR" image is a false-colour rendering of RGB video, **not** thermal-camera footage.

## Architecture

```
Video input ─► YOLO11n ─► ByteTrack ─► Distance / closing speed ─► Risk status ─► Dashboards
 (MP4 file)   (cars,     (track IDs)    (pinhole model)           (SAFE/WARNING/   (Streamlit,
               trucks)                                            DANGER)          React + FastAPI)
```

Web app data flow:

```
data/output/*.csv, data/**/*.mp4 ──► FastAPI (backend/) ──JSON + Range video──► React (frontend/)
```

The API reads files only. It never imports YOLO, OpenCV or pandas.

## Folder structure

```
SIH26007-Mine-Vehicle-Safety/
├── src/                      original AI code (detection/, risk/, dashboard/) – unchanged
├── data/
│   ├── input/                vehicle.mp4 (+ mine_fog*.mp4, git-ignored)
│   └── output/               risk_results.csv, fog_evaluation_summary.csv, recovery_comparison.csv,
│                             fog_risk_demo.mp4, visibility_comparison_demo.mp4
├── backend/                  FastAPI app: main.py, data_service.py, mp4_info.py
├── frontend/                 React + TypeScript + Vite + Tailwind + Recharts
├── tests/test_api.py         API tests against the real project files
├── docs/
│   ├── PROJECT_ANALYSIS.md   analysis of the original project
│   └── sample_responses/     real API responses saved from this project's data
├── requirements.txt          original (Streamlit / pipeline)
├── requirements-api.txt      web API only: fastapi, uvicorn
├── render.yaml               Render blueprint (not deployed)
└── README.md
```

## Prerequisites

* Python 3.10+ (3.12 recommended)
* Node.js 18+ and npm
* To re-run the original pipeline (optional): the packages in `requirements.txt`, `ffmpeg`, and internet access for the first download of `yolo11n.pt` (not included in the ZIP). See `docs/PROJECT_ANALYSIS.md` §6 for version caveats.

## Install and run locally

Open two terminals in the project root.

**Terminal 1 – backend**

```bash
python -m venv .venv-api
source .venv-api/bin/activate            # Windows PowerShell: .venv-api\Scripts\Activate.ps1
pip install -r requirements-api.txt
uvicorn backend.main:app --reload --port 8000
```

Check it: <http://127.0.0.1:8000/api/health> (interactive docs at `/docs`).

**Terminal 2 – frontend**

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. In development Vite proxies `/api` to `http://127.0.0.1:8000`, so no extra configuration is needed.

**Production build of the frontend**

```bash
cd frontend
npm run build        # outputs frontend/dist
npm run preview      # serves it at http://localhost:4173 (needs VITE_API_BASE_URL, see below)
```

When the built site is served from a different origin than the API, set the API address at build time and allow the origin on the API:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run build          # Windows PowerShell: $env:VITE_API_BASE_URL="http://127.0.0.1:8000"; npm run build
CORS_ORIGINS=http://localhost:4173 uvicorn backend.main:app --port 8000
```

### Original Streamlit dashboard (still works as before)

```bash
pip install -r requirements.txt
streamlit run src/dashboard/app.py
```

## API

| Endpoint | Returns |
|---|---|
| `GET /api/health` | service status, which CSVs/videos are present and readable |
| `GET /api/overview` | tracked IDs, risk distribution, recent events, health |
| `GET /api/risk-events` | events (runs of WARNING/DANGER), per-track summary, distribution. Query: `status`, `limit`, `min_confirm_frames` |
| `GET /api/telemetry` | per-frame observations from `risk_results.csv` (drives the Safety Monitor panel) |
| `GET /api/fog-benchmark` | rows of `fog_evaluation_summary.csv` plus delta vs the clear baseline |
| `GET /api/recovery-comparison` | rows of `recovery_comparison.csv` plus raw-vs-enhanced deltas |
| `GET /api/videos` | allow-listed demo videos with size, resolution, fps, frames |
| `GET /api/videos/{id}/stream` | the MP4 with HTTP Range support (`GET` and `HEAD`); unknown ids return 404 |

Every JSON response has a `status` of `ok`, `partial`, `empty`, `missing` or `error`. Unavailable values are `null` and shown as "Not available" in the UI. Real example responses are in `docs/sample_responses/`.

Environment variables: `SIH_DATA_DIR` (data folder, default `./data`), `CORS_ORIGINS` (comma-separated, default `http://localhost:5173,http://127.0.0.1:5173`).

## How to test

```bash
pip install -r requirements-api.txt pytest httpx
pytest tests -v                               # 16 tests: endpoints, Range requests, bad paths, missing/empty/malformed CSVs
cd frontend && npm run typecheck && npm run build
```

Manual checklist: open every page from the sidebar; on **Safety Monitor** play the video, click the risk timeline and confirm the telemetry frame number follows; stop the backend and reload to see the "Backend unavailable" state.

## Deploying to Render later

`render.yaml` defines two services (not deployed):

1. **sih26007-api** (Python web service): `pip install -r requirements-api.txt`, then `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`.
2. **sih26007-web** (static site): `npm install && npm run build`, publishing `frontend/dist`, with a rewrite of `/*` to `/index.html`.

Steps: push this folder to your GitHub repository, then on Render choose *New → Blueprint* and select the repo. After the first deploy set `VITE_API_BASE_URL` on the static site to the API's URL and `CORS_ORIGINS` on the API to the static site's URL, then redeploy the static site.

Notes: `*.pt` and `data/input/mine_fog*.mp4` are git-ignored, so they are not deployed; the web app does not need them. No `package-lock.json` is included (create it with `npm install`, then commit it, if you want reproducible builds).

## Known limitations

* Synthetic fog on one short clip; results are a demonstration, not field evidence.
* "Detection rate" means "at least one detection in the frame". There are no ground-truth labels, so it is not accuracy.
* Distance and proxy TTC come from an uncalibrated pinhole assumption. Car/truck label flips within a track change the assumed width and make them jump (TTC of 0.1 s is usually such an artefact).
* ByteTrack IDs are not unique vehicles; the source clip has scene cuts.
* Risk status uses bounding-box width growth only.
