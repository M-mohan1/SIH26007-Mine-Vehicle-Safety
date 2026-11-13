# cat << 'EOF' > src/detection/evaluate_fog.py

import os
import csv
import sys
from collections import Counter
import cv2
from ultralytics import YOLO

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from src.detection.add_fog import add_synthetic_fog

INPUT_VIDEO = "data/input/vehicle.mp4"
OUTPUT_SUMMARY_CSV = "data/output/fog_evaluation_summary.csv"
VEHICLE_CLASSES = [2, 7]  # car, truck
MAX_EVAL_FRAMES = 240
MIN_CONFIRMED_FRAMES = 8

FOG_LEVELS = [
    ("0% Clear (Baseline)", 0.00),
    ("40% Light Fog", 0.40),
    ("65% Medium Fog", 0.65),
    ("80% Dense Fog", 0.80),
]

def evaluate_condition(label, intensity):
    # Fresh YOLO instance per condition so ByteTrack IDs start cleanly at 1
    model = YOLO("yolo11n.pt")
    cap = cv2.VideoCapture(INPUT_VIDEO)
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280

    total_frames = 0
    frames_with_detections = 0
    total_valid_boxes = 0
    conf_sum = 0.0
    track_frame_counts = Counter()

    print(f"[INFO] Benchmarking: {label} ...")
    while total_frames < MAX_EVAL_FRAMES:
        ret, frame = cap.read()
        if not ret:
            break
        total_frames += 1

        if intensity > 0.0:
            frame = add_synthetic_fog(frame, intensity)

        results = model.track(
            source=frame,
            tracker="bytetrack.yaml",
            classes=VEHICLE_CLASSES,
            conf=0.38,
            iou=0.45,
            agnostic_nms=True,
            persist=True,
            verbose=False
        )

        r = results[0]
        valid_in_frame = 0
        if r.boxes is not None and len(r.boxes) > 0:
            xywh_list = r.boxes.xywh.cpu().tolist()
            confs = r.boxes.conf.cpu().tolist()
            tids = r.boxes.id.int().cpu().tolist() if r.boxes.id is not None else [None] * len(xywh_list)

            for (cx, cy, w, h), conf, tid in zip(xywh_list, confs, tids):
                if w <= 5.0 or w >= (frame_w * 0.85):
                    continue
                valid_in_frame += 1
                total_valid_boxes += 1
                conf_sum += conf
                if tid is not None:
                    track_frame_counts[tid] += 1

        if valid_in_frame > 0:
            frames_with_detections += 1

    cap.release()
    missed_frames = total_frames - frames_with_detections
    detection_rate = (frames_with_detections / total_frames * 100.0) if total_frames > 0 else 0.0
    avg_conf = (conf_sum / total_valid_boxes) if total_valid_boxes > 0 else 0.0
    confirmed_tracks = sum(1 for _, cnt in track_frame_counts.items() if cnt >= MIN_CONFIRMED_FRAMES)
    noise_tracks = sum(1 for _, cnt in track_frame_counts.items() if cnt < MIN_CONFIRMED_FRAMES)

    return {
        "Visibility Condition": label,
        "Fog Intensity": f"{int(intensity * 100)}%",
        "Total Frames": total_frames,
        "Active Frames": frames_with_detections,
        "Blind-Spot Frames": missed_frames,
        "Detection Rate (%)": round(detection_rate, 1),
        "Confirmed Tracks (>=8f)": confirmed_tracks,
        "Noise/Flicker IDs (<8f)": noise_tracks,
        "Avg Confidence": round(avg_conf, 2),
    }

def main():
    if not os.path.exists(INPUT_VIDEO):
        print(f"[ERROR] {INPUT_VIDEO} not found.")
        return

    os.makedirs(os.path.dirname(OUTPUT_SUMMARY_CSV), exist_ok=True)
    rows = []
    for label, intensity in FOG_LEVELS:
        metrics = evaluate_condition(label, intensity)
        rows.append(metrics)
        print(
            f"  -> {label}: Rate={metrics['Detection Rate (%)']}% "
            f"({metrics['Active Frames']}/{metrics['Total Frames']}) | "
            f"Confirmed={metrics['Confirmed Tracks (>=8f)']} | "
            f"AvgConf={metrics['Avg Confidence']}"
        )

    with open(OUTPUT_SUMMARY_CSV, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"[SUCCESS] Saved Phase 4 benchmark table to {OUTPUT_SUMMARY_CSV}")

if __name__ == "__main__":
    main()