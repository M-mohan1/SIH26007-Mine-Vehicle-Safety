# SIH26007 – Existing project analysis

Written before any web-app code. Everything below was read from the uploaded project; nothing was run except reading files and inspecting video headers. Items I could not verify are marked **untested**.

## 1. Existing architecture

```
data/input/vehicle.mp4 (clear, 1280×720, 24 fps, 240 frames)
   │ src/detection/add_fog.py  (65% white veil + vertical gradient)
   ▼
data/input/mine_fog.mp4 ──► src/risk/risk_demo.py
                              YOLO11n (cars+trucks, conf 0.38) → ByteTrack ("bytetrack.yaml")
                              → MultiVehicleRiskEngine (box-width growth)
                              → PinholeRangeEstimator (distance, closing speed, proxy TTC)
                              ├─► data/output/fog_risk_demo.mp4   (annotated, H.264 via ffmpeg)
                              └─► data/output/risk_results.csv

data/input/vehicle.mp4 ──► src/detection/evaluate_fog.py   → data/output/fog_evaluation_summary.csv
data/input/vehicle.mp4 ──► src/detection/visibility_recovery.py
                              → data/output/visibility_comparison_demo.mp4 + recovery_comparison.csv

src/dashboard/app.py (Streamlit, 4 tabs) reads the CSVs and MP4s above.
```

## 2. Python modules

| File | Responsibility |
|---|---|
| `src/detection/add_fog.py` | `add_synthetic_fog(frame, intensity)`; CLI turns `vehicle.mp4` into `mine_fog.mp4` at 0.65. |
| `src/detection/track_data.py` | Prints per-frame tracks to the console (debug helper). |
| `src/detection/evaluate_fog.py` | Runs detect+track on the first 240 frames at 0/40/65/80% fog; writes the benchmark CSV. |
| `src/detection/visibility_recovery.py` | Raw 72% fog vs CLAHE (LAB L-channel, clip 3.2, 8×8). Detection via `predict` (no tracking, conf 0.35). Draws a pseudo-IR inset. Writes video + CSV. |
| `src/risk/risk_engine.py` | `MultiVehicleRiskEngine`: 5-frame width history per track; growth > 25 px WARNING, > 50 px DANGER; rejects boxes ≥ 85% of frame width; prunes idle tracks. (An older commented-out version sits above the live class.) |
| `src/risk/range_estimator.py` | `PinholeRangeEstimator`: Z = f·W/w with f = 900 px and class width priors (car 1.95 m, truck 4.8 m, bus 3.0 m, other 3.5 m). Closing speed from up to 5 distance samples; proxy TTC only if closing > 0.4 m/s. |
| `src/risk/risk_demo.py` | Main pipeline: ties detection, tracking, risk, range together; writes annotated video and `risk_results.csv`. |
| `src/dashboard/app.py` | Streamlit dashboard, 4 tabs, reads CSVs/MP4s. |

**How the risk engine works.** Status depends only on `growth_px` = latest box width − oldest width in a 5-frame window. I checked all 196 rows of `risk_results.csv`: every `risk_status` matches the 25/50 px thresholds exactly. Distance and TTC are logged but never feed the status.

## 3. Datasets and videos (actual files)

| File | Columns / format | Content |
|---|---|---|
| `output/risk_results.csv` | `frame, track_id, class_name, confidence, width_px, height_px, growth_px, est_distance_m, closing_speed_mps, proxy_ttc_s, risk_status` | 196 rows, 4 track IDs (1, 2, 6, 7), frames 1–220. `proxy_ttc_s` is blank in 21 rows. |
| `output/fog_evaluation_summary.csv` | `Visibility Condition, Fog Intensity, Total Frames, Active Frames, Blind-Spot Frames, Detection Rate (%), Confirmed Tracks (>=8f), Noise/Flicker IDs (<8f), Avg Confidence` | 4 rows |
| `output/recovery_comparison.csv` | `Pipeline Mode, Total Frames, Active Detection Frames, Missed Blind-Spot Frames, Detection Rate (%), Avg Confidence` | 2 rows |
| `output/fog_risk_demo.mp4` | H.264, 1280×720, 24 fps, 240 frames, 1.2 MB | Annotated risk video (browser-playable) |
| `output/visibility_comparison_demo.mp4` | H.264, 1280×360, 24 fps, 240 frames, 1.0 MB | Raw fog (left) vs CLAHE + inset (right) |
| `input/vehicle.mp4` | H.264, 1280×720, 2.7 MB | Clear source |
| `input/mine_fog.mp4` | **MPEG-4 Part 2** (`mp4v`), 1.2 MB | Synthetic 65% fog. **Not browser-playable.** Git-ignored. |
| `input/mine_fog_10s_backup.mp4` | byte-identical to `mine_fog.mp4` (same MD5) | Duplicate; ignored by the web app |

## 4. Actual benchmark results (copied from the CSVs)

| Condition | Active / total frames | Detection rate | Confirmed tracks | Noise IDs | Avg conf. |
|---|---|---|---|---|---|
| 0% clear | 216 / 240 | 90.0% | 4 | 1 | 0.77 |
| 40% light | 217 / 240 | 90.4% | 4 | 0 | 0.72 |
| 65% medium | 206 / 240 | 85.8% | 4 | 0 | 0.60 |
| 80% dense | 104 / 240 | 43.3% | 3 | 0 | 0.52 |

Recovery (72% fog): raw 187/240 = 77.9%, conf 0.54 → CLAHE 223/240 = 92.9%, conf 0.67.

Risk run (`risk_results.csv`): 132 SAFE / 57 WARNING / 7 DANGER vehicle-observations; 196 of 240 frames have a tracked vehicle (frames 221–240 and scattered gaps have none).

## 5. Real vs simulated imagery

* **Fog is synthetic** everywhere (white veil blended over a clear clip).
* **The "IR" panel is pseudo-IR**: grayscale → CLAHE → `COLORMAP_INFERNO` of the same RGB frame. It is not thermal data and is **not used for detection** (`create_thermal_inset` is only drawn; detection runs on `enhanced_frame`). The recovery CSV row label "CLAHE … + Pseudo-IR Map" is therefore misleading; the web app says so.
* No genuine thermal imagery exists in the project.

## 6. Integration problems found

1. **Detection rate is not accuracy.** It is "≥1 valid box in the frame"; no ground truth. Extra boxes from contrast stretching would also raise the recovery number.
2. **Different experiments, different settings.** Benchmark: tracking, conf 0.38, fog up to 80%. Recovery: plain `predict`, conf 0.35, fog 72%. Risk run: 65% fog on the whole clip. Numbers must not be compared across them (the UI keeps them separate).
3. **Class-label flips corrupt distance/TTC.** Track 2 flips car↔truck 3 times and track 7 four times. The width prior changes (1.95 ↔ 4.8 m), so estimated distance jumps (e.g. 3.2 m → 7.7 m), closing speed hits −25 and +27 m/s, and TTC reads 0.1 s. Those 0.1 s values are artefacts. Shown in the UI as "label switches".
4. **Track IDs ≠ vehicles.** The clip has scene cuts (the dashboard text says so). IDs 3–5 never appear in the CSV.
5. **`mine_fog.mp4` is not browser-playable** (mp4v) and is git-ignored, so it is not served. The H.264 annotated output is used instead.
6. **`custom_bytetrack.yaml` is unused.** All scripts call `tracker="bytetrack.yaml"` (Ultralytics default). `commands.md` writes the custom file to `src/detection/` but nothing loads it.
7. **Pinned versions look inconsistent (untested).** `requirements.txt` pins `ultralytics==8.1.24`, which predates YOLO11 (added in 8.3). `app.py` uses `st.dataframe(width='stretch')`, which Streamlit 1.32 does not accept. The pins may be a deployment-only subset; I did not install them.
8. **`yolo11n.pt` is git-ignored** and Ultralytics downloads it on first run (needs internet). The web backend does not need it.
9. **`commands.md`** has hard-coded Windows/WSL paths and a stray unfinished section. Left untouched.
10. **`risk_demo.py` needs `ffmpeg`** on PATH for the H.264 re-encode.
11. The 30-minute stress-test workflow in `commands.md` would replace `mine_fog.mp4` with a ~100 MB file; the app does not depend on that file.

## 7. What a web app can use

Usable: the three CSVs and the three H.264 MP4s. Not used: `mine_fog*.mp4`, `yolo11n.pt`, any inference. Deployment limits: no GPU or YOLO on a free host, so everything is read from precomputed files; `*.pt` and `mine_fog*.mp4` are excluded by `.gitignore`.

## 8. Recommended architecture (implemented)

`CSV/MP4 files → FastAPI (stdlib csv, no pandas/YOLO/OpenCV; own MP4 header reader; Range streaming with an explicit allowlist) → React + TypeScript + Vite + Tailwind + Recharts`. Original Streamlit app and all `src/` files untouched.
