# cat << 'EOF' > src/detection/visibility_recovery.py
import os
import csv
import sys
import subprocess
import cv2
import numpy as np
from ultralytics import YOLO

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from src.detection.add_fog import add_synthetic_fog

INPUT_VIDEO = "data/input/vehicle.mp4"
OUTPUT_VIDEO = "data/output/visibility_comparison_demo.mp4"
OUTPUT_CSV = "data/output/recovery_comparison.csv"
VEHICLE_CLASSES = [2, 7]
HEAVY_FOG_INTENSITY = 0.72
MAX_FRAMES = 240

def apply_clahe_dehaze(bgr_frame):
    """
    Enhances local contrast in fog using CLAHE on the L (luminance) channel in LAB space.
    Recovers faint vehicle boundaries washed out by atmospheric scattering.
    """
    lab = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.2, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l_chan)
    merged = cv2.merge((l_enhanced, a_chan, b_chan))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)

def create_thermal_inset(bgr_frame, width=220, height=124):
    """
    Creates a pseudo-thermal false-color luminance/gradient inset to illustrate
    how thermal/IR contrast highlights high-intensity vehicle signatures (headlights/exhaust).
    """
    gray = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
    norm = clahe.apply(gray)
    thermal_map = cv2.applyColorMap(norm, cv2.COLORMAP_INFERNO)
    resized = cv2.resize(thermal_map, (width, height))
    cv2.rectangle(resized, (0, 0), (width - 1, height - 1), (255, 255, 255), 1)
    cv2.putText(resized, "Pseudo-IR Contrast Map", (8, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1)
    return resized

def reencode_for_browser(video_path):
    temp_path = video_path.replace(".mp4", "_h264.mp4")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-vcodec", "libx264", "-pix_fmt", "yuv420p", "-loglevel", "error", temp_path],
            check=True
        )
        os.replace(temp_path, video_path)
        print(f"[SUCCESS] Converted {video_path} to H.264 for Streamlit.")
    except Exception as e:
        print(f"[WARNING] ffmpeg conversion skipped ({e}).")

def main():
    if not os.path.exists(INPUT_VIDEO):
        print(f"[ERROR] {INPUT_VIDEO} not found.")
        return

    os.makedirs(os.path.dirname(OUTPUT_VIDEO), exist_ok=True)
    model = YOLO("yolo11n.pt")

    cap = cv2.VideoCapture(INPUT_VIDEO)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Side-by-side output resolution (1280x360 so it fits cleanly in browser)
    half_w, half_h = 640, 360
    out_w, out_h = half_w * 2, half_h

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(OUTPUT_VIDEO, fourcc, fps, (out_w, out_h))

    raw_fog_active_frames = 0
    clahe_active_frames = 0
    raw_fog_conf_sum, raw_fog_boxes = 0.0, 0
    clahe_conf_sum, clahe_boxes = 0.0, 0
    total_frames = 0

    print(f"[INFO] Running Phase 5 Low-Visibility Recovery Comparison (Fog={int(HEAVY_FOG_INTENSITY*100)}%) ...")

    while total_frames < MAX_FRAMES:
        ret, clear_frame = cap.read()
        if not ret:
            break
        total_frames += 1

        fog_frame = add_synthetic_fog(clear_frame, HEAVY_FOG_INTENSITY)
        enhanced_frame = apply_clahe_dehaze(fog_frame)

        # 1. Detect on Raw Heavy Fog RGB
        res_raw = model.predict(source=fog_frame, classes=VEHICLE_CLASSES, conf=0.35, agnostic_nms=True, verbose=False)[0]
        # 2. Detect on CLAHE Contrast-Recovered Frame
        res_enh = model.predict(source=enhanced_frame, classes=VEHICLE_CLASSES, conf=0.35, agnostic_nms=True, verbose=False)[0]

        vis_raw = fog_frame.copy()
        vis_enh = enhanced_frame.copy()

        raw_valid = 0
        if res_raw.boxes is not None:
            for (x1, y1, x2, y2), conf, cid in zip(
                res_raw.boxes.xyxy.cpu().tolist(),
                res_raw.boxes.conf.cpu().tolist(),
                res_raw.boxes.cls.int().cpu().tolist()
            ):
                if (x2 - x1) >= orig_w * 0.85:
                    continue
                raw_valid += 1
                raw_fog_boxes += 1
                raw_fog_conf_sum += conf
                cv2.rectangle(vis_raw, (int(x1), int(y1)), (int(x2), int(y2)), (0, 140, 255), 2)
                cv2.putText(vis_raw, f"{model.names[cid]} {conf:.2f}", (int(x1), max(25, int(y1)-8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 140, 255), 2)

        enh_valid = 0
        if res_enh.boxes is not None:
            for (x1, y1, x2, y2), conf, cid in zip(
                res_enh.boxes.xyxy.cpu().tolist(),
                res_enh.boxes.conf.cpu().tolist(),
                res_enh.boxes.cls.int().cpu().tolist()
            ):
                if (x2 - x1) >= orig_w * 0.85:
                    continue
                enh_valid += 1
                clahe_boxes += 1
                clahe_conf_sum += conf
                cv2.rectangle(vis_enh, (int(x1), int(y1)), (int(x2), int(y2)), (0, 230, 0), 2)
                cv2.putText(vis_enh, f"{model.names[cid]} {conf:.2f}", (int(x1), max(25, int(y1)-8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 230, 0), 2)

        if raw_valid > 0:
            raw_fog_active_frames += 1
        if enh_valid > 0:
            clahe_active_frames += 1

        # Resize both panels and attach pseudo-thermal inset on right panel
        left_panel = cv2.resize(vis_raw, (half_w, half_h))
        right_panel = cv2.resize(vis_enh, (half_w, half_h))

        ir_inset = create_thermal_inset(fog_frame, width=180, height=100)
        right_panel[half_h - 110:half_h - 10, half_w - 190:half_w - 10] = ir_inset

        cv2.rectangle(left_panel, (8, 8), (350, 58), (0, 0, 0), -1)
        cv2.putText(left_panel, f"RAW RGB IN HEAVY FOG ({int(HEAVY_FOG_INTENSITY*100)}%)", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 165, 255), 2)
        cv2.putText(left_panel, f"Frame {total_frames} | Detections: {raw_valid}", (15, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1)

        cv2.rectangle(right_panel, (8, 8), (410, 58), (0, 0, 0), -1)
        cv2.putText(right_panel, "CLAHE DEHAZED + IR CONTRAST MAP", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 230, 0), 2)
        cv2.putText(right_panel, f"Frame {total_frames} | Detections: {enh_valid}", (15, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1)

        combined = np.hstack((left_panel, right_panel))
        writer.write(combined)

    cap.release()
    writer.release()

    rows = [
        {
            "Pipeline Mode": f"Standard RGB in Heavy Fog ({int(HEAVY_FOG_INTENSITY*100)}%)",
            "Total Frames": total_frames,
            "Active Detection Frames": raw_fog_active_frames,
            "Missed Blind-Spot Frames": total_frames - raw_fog_active_frames,
            "Detection Rate (%)": round(raw_fog_active_frames / total_frames * 100.0, 1),
            "Avg Confidence": round(raw_fog_conf_sum / raw_fog_boxes, 2) if raw_fog_boxes else 0.0,
        },
        {
            "Pipeline Mode": "CLAHE Contrast-Enhanced RGB + Pseudo-IR Map",
            "Total Frames": total_frames,
            "Active Detection Frames": clahe_active_frames,
            "Missed Blind-Spot Frames": total_frames - clahe_active_frames,
            "Detection Rate (%)": round(clahe_active_frames / total_frames * 100.0, 1),
            "Avg Confidence": round(clahe_conf_sum / clahe_boxes, 2) if clahe_boxes else 0.0,
        }
    ]

    with open(OUTPUT_CSV, mode="w", newline="", encoding="utf-8") as f:
        csv_w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        csv_w.writeheader()
        csv_w.writerows(rows)

    print(f"[SUCCESS] Saved Phase 5 comparison CSV to {OUTPUT_CSV}")
    reencode_for_browser(OUTPUT_VIDEO)

if __name__ == "__main__":
    main()