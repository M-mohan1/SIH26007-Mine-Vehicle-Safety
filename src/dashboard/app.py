# cat << 'EOF' > src/dashboard/app.py
import os
import pandas as pd
import streamlit as st

st.set_page_config(page_title="SIH26007: Mine Vehicle Safety Monitor", layout="wide")

st.title("SIH26007: Mine Vehicle Safety & Low-Visibility Monitor")
st.caption("Complete Multi-Vehicle Tracking, Heuristic & Pinhole Range Risk Engine, Multi-Level Fog Benchmark, and Contrast Recovery Suite")

# Sidebar Controls
st.sidebar.header("System Controls")
visibility_mode = st.sidebar.selectbox("Primary Feed Mode", ["Fog (Synthetic 65%)", "Normal (Clear RGB)"])
min_frames_filter = st.sidebar.slider(
    "Min Frames to Confirm Vehicle Track",
    min_value=1, max_value=20, value=8,
    help="Filters out 1-2 frame false positives / fog flicker noise."
)
st.sidebar.markdown("---")
st.sidebar.subheader("Implemented Project Phases")
st.sidebar.markdown(
    "- **Phase 1–3:** YOLO11n + ByteTrack + 5-Frame Risk Engine\n"
    "- **Phase 4:** Multi-Level Fog Benchmark (0%–80%)\n"
    "- **Phase 5:** CLAHE Contrast Recovery & Pseudo-IR Map\n"
    "- **Phase 6:** Pinhole Range ($Z$) & Proxy TTC Model\n"
    "- **Phase 7:** Full Telemetry & Architecture Suite"
)

CSV_PATH = "data/output/risk_results.csv"
EVAL_CSV_PATH = "data/output/fog_evaluation_summary.csv"
RECOVERY_CSV_PATH = "data/output/recovery_comparison.csv"
FOG_VIDEO_PATH = "data/output/fog_risk_demo.mp4"
NORMAL_VIDEO_PATH = "data/input/vehicle.mp4"
COMP_VIDEO_PATH = "data/output/visibility_comparison_demo.mp4"

df = None
confirmed_df = None
if os.path.exists(CSV_PATH):
    df = pd.read_csv(CSV_PATH)
    if not df.empty:
        track_counts = df.groupby("track_id")["frame"].transform("count")
        confirmed_df = df[track_counts >= min_frames_filter].copy()

# Top KPI Banner
col1, col2, col3, col4 = st.columns(4)
if confirmed_df is not None and not confirmed_df.empty:
    confirmed_vehicles = confirmed_df["track_id"].nunique()
    raw_ids = df["track_id"].nunique()
    rejected_noise_ids = raw_ids - confirmed_vehicles

    danger_events = int((confirmed_df["risk_status"] == "DANGER").sum())
    warning_events = int((confirmed_df["risk_status"] == "WARNING").sum())
    peak_risk = "DANGER" if danger_events > 0 else ("WARNING" if warning_events > 0 else "SAFE")

    col1.metric("System Status", "ONLINE")
    col2.metric("Confirmed Vehicles", confirmed_vehicles, f"{rejected_noise_ids} transient noise IDs filtered", delta_color="off")
    col3.metric("Tracking Continuity", f"{confirmed_df['frame'].nunique()} Active Frames")
    col4.metric("Peak Heuristic Risk", peak_risk, f"{danger_events} Danger / {warning_events} Warn frames")
else:
    col1.metric("System Status", "WAITING FOR RUN")
    col2.metric("Confirmed Vehicles", 0)
    col3.metric("Tracking Continuity", "No Data")
    col4.metric("Peak Heuristic Risk", "N/A")

st.markdown("---")

# 4-Tab Navigation
tab1, tab2, tab3, tab4 = st.tabs([
    "1. Live Safety Monitor (Phases 1–3 & 6)",
    "2. Multi-Level Fog Benchmark (Phase 4)",
    "3. Low-Visibility Recovery & Thermal (Phase 5)",
    "4. Pinhole Range Model & Architecture (Phase 6–7)"
])

with tab1:
    left_col, right_col = st.columns([3, 2])
    with left_col:
        st.subheader(f"Annotated Feed — {visibility_mode}")
        video_to_show = FOG_VIDEO_PATH if "Fog" in visibility_mode else NORMAL_VIDEO_PATH
        if os.path.exists(video_to_show):
            st.video(video_to_show)
        else:
            st.warning(f"Video not found at `{video_to_show}`. Run `python src/risk/risk_demo.py`.")

    with right_col:
        st.subheader("Confirmed Multi-Vehicle Summary (Per Track ID)")
        if confirmed_df is not None and not confirmed_df.empty:
            agg_dict = {
                "dominant_class": ("class_name", lambda s: s.mode().iloc[0] if not s.mode().empty else s.iloc[-1]),
                "frames_seen": ("frame", "count"),
                "first_frame": ("frame", "min"),
                "last_frame": ("frame", "max"),
                "max_width_px": ("width_px", "max"),
                "max_growth_px": ("growth_px", "max"),
                "peak_status": ("risk_status", lambda s: "DANGER" if "DANGER" in s.values else ("WARNING" if "WARNING" in s.values else "SAFE")),
            }
            if "est_distance_m" in confirmed_df.columns:
                agg_dict["min_est_dist_m"] = ("est_distance_m", "min")
            if "proxy_ttc_s" in confirmed_df.columns:
                agg_dict["min_proxy_ttc_s"] = ("proxy_ttc_s", "min")

            summary_df = confirmed_df.groupby("track_id").agg(**agg_dict).reset_index()
            st.dataframe(summary_df, width='stretch', hide_index=True)

            st.subheader("Recent Confirmed Frame Detections")
            st.dataframe(confirmed_df.tail(12), width='stretch', hide_index=True)
        else:
            st.info("No vehicles met the minimum frame threshold.")

with tab2:
    st.subheader("Phase 4: Quantitative RGB Degradation Across Controlled Synthetic Fog Levels")
    st.caption("Evaluated on the same 240-frame source video across 0%, 40%, 65%, and 80% atmospheric fog intensities.")
    if os.path.exists(EVAL_CSV_PATH):
        eval_df = pd.read_csv(EVAL_CSV_PATH)
        st.dataframe(eval_df, width='stretch', hide_index=True)

        c1, c2 = st.columns(2)
        with c1:
            st.markdown("**Frame Detection Rate (%) vs. Fog Intensity**")
            st.bar_chart(eval_df.set_index("Visibility Condition")[["Detection Rate (%)"]])
        with c2:
            st.markdown("**Blind-Spot (Missed) Frames vs. Fog Intensity**")
            st.bar_chart(eval_df.set_index("Visibility Condition")[["Blind-Spot Frames"]])
    else:
        st.info("Run `python src/detection/evaluate_fog.py` to generate the multi-level fog benchmark.")

with tab3:
    st.subheader("Phase 5: Contrast Recovery (LAB-CLAHE) & Pseudo-Thermal Analysis")
    st.caption("Side-by-side comparison under 72% heavy fog: Standard RGB (left) vs. CLAHE Local Contrast Recovery + Pseudo-IR Map (right).")
    if os.path.exists(COMP_VIDEO_PATH):
        st.video(COMP_VIDEO_PATH)
    else:
        st.info("Run `python src/detection/visibility_recovery.py` to generate the side-by-side recovery video.")

    if os.path.exists(RECOVERY_CSV_PATH):
        rec_df = pd.read_csv(RECOVERY_CSV_PATH)
        st.dataframe(rec_df, width='stretch', hide_index=True)

    st.info(
        "**Key Technical Takeaway for Evaluation:**\n"
        "- **What Software CLAHE Solves:** Adaptive histogram equalization restores washed-out edge contrast in moderate-to-heavy fog, recovering lost vehicle detections and boosting YOLO confidence.\n"
        "- **Why Physical Thermal (LWIR) Sensors Are Still Needed:** In complete whiteout fog or behind windshield wipers (Frames 221–240), visible-spectrum photons are completely scattered. Only true Long-Wave Infrared (8–14 μm) sensors detect thermal emission from hot dump-truck engines and tires."
    )

with tab4:
    c_left, c_right = st.columns(2)
    with c_left:
        st.subheader("Phase 6: Pinhole Camera Range & Proxy TTC Model")
        st.markdown(
            "In addition to the 5-frame pixel width expansion heuristic ($\\Delta W > 25\\text{ px}$ `WARNING`, $\\Delta W > 50\\text{ px}$ `DANGER`), "
            "the pipeline computes an approximate geometric range proxy using the **Pinhole Camera Model**:\n\n"
            "$$Z_{\\text{est}} = \\frac{f_{\\text{px}} \\cdot W_{\\text{real}}}{w_{\\text{px}}}, \\quad "
            "v_{\\text{rel}} = \\frac{Z_{t-\\Delta t} - Z_t}{\\Delta t}, \\quad "
            "\\text{TTC}_{\\text{proxy}} = \\frac{Z_t}{v_{\\text{rel}}}$$\n\n"
            "- **Class Width Priors ($W_{\\text{real}}$):** `truck` = $4.80\\text{ m}$, `car` (4x4 SUV) = $1.95\\text{ m}$\n"
            "- **Assumed Focal Length ($f_{\\text{px}}$):** $900\\text{ px}$ (standard 720p dashcam perspective)"
        )
        st.warning(
            "**Explicit Engineering Disclaimers:**\n"
            "1. **Uncalibrated Monocular Camera:** $Z_{\\text{est}}$ and $\\text{TTC}_{\\text{proxy}}$ are geometric approximations; true safety-critical collision avoidance requires calibrated stereo, radar, or LiDAR.\n"
            "2. **Scene Cuts:** Compilation videos with hard cuts naturally assign new Track IDs per scene.\n"
            "3. **COCO Domain Gap:** Pretrained `yolo11n.pt` detects `car` and `truck` reliably, whereas specialized excavators require fine-tuned mining weights."
        )

    with c_right:
        st.subheader("Phase 7: Complete System Architecture")
        st.code(
            "Input Video (vehicle.mp4)\n"
            "  ├──► Phase 1: Synthetic Fog Generator (add_fog.py -> mine_fog.mp4)\n"
            "  ├──► Phase 2: YOLO11n + ByteTrack (agnostic_nms=True, car/truck)\n"
            "  ├──► Phase 3: MultiVehicleRiskEngine (5-frame rolling width deque)\n"
            "  ├──► Phase 4: Multi-Level Fog Evaluator (0%, 40%, 65%, 80% benchmark)\n"
            "  ├──► Phase 5: CLAHE Dehazing + Pseudo-IR Recovery Pipeline\n"
            "  ├──► Phase 6: Pinhole Range (m) & Proxy TTC (s) Estimator\n"
            "  └──► Phase 7: H.264 Video + CSV Telemetry + 4-Tab Streamlit UI",
            language="text"
        )