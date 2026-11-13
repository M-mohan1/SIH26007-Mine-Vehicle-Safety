# cat << 'EOF' > src/risk/risk_demo.py

import os
import csv
import sys
import subprocess
import cv2
from ultralytics import YOLO

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from src.risk.risk_engine import MultiVehicleRiskEngine
from src.risk.range_estimator import PinholeRangeEstimator

INPUT_VIDEO = "data/input/mine_fog.mp4"
OUTPUT_VIDEO = "data/output/fog_risk_demo.mp4"
OUTPUT_CSV = "data/output/risk_results.csv"
VEHICLE_CLASSES = [2, 7]  # 2: car, 7: truck

COLOR_MAP = {
    "SAFE": (0, 200, 0),       # Green
    "WARNING": (0, 165, 255),  # Orange
    "DANGER": (0, 0, 255),     # Red
}

def reencode_for_browser(video_path):
    """Re-encodes OpenCV mp4v output to H.264 so Streamlit browsers can play it."""
    temp_path = video_path.replace(".mp4", "_h264.mp4")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-vcodec", "libx264", "-pix_fmt", "yuv420p", "-loglevel", "error", temp_path],
            check=True
        )
        os.replace(temp_path, video_path)
        print(f"[SUCCESS] Converted {video_path} to H.264 for Streamlit video player.")
    except Exception as e:
        print(f"[WARNING] ffmpeg conversion skipped ({e}).")

def main():
    if not os.path.exists(INPUT_VIDEO):
        print(f"[ERROR] {INPUT_VIDEO} not found. Run 'python src/detection/add_fog.py' first.")
        return

    os.makedirs(os.path.dirname(OUTPUT_VIDEO), exist_ok=True)

    cap = cv2.VideoCapture(INPUT_VIDEO)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    model = YOLO("yolo11n.pt")
    risk_engine = MultiVehicleRiskEngine(history_len=5, warn_thresh=25.0, danger_thresh=50.0, max_valid_ratio=0.85)
    range_estimator = PinholeRangeEstimator(focal_length_px=900.0, fps=fps, history_len=5)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(OUTPUT_VIDEO, fourcc, fps, (frame_w, frame_h))

    csv_file = open(OUTPUT_CSV, mode="w", newline="", encoding="utf-8")
    csv_writer = csv.writer(csv_file)
    csv_writer.writerow([
        "frame", "track_id", "class_name", "confidence",
        "width_px", "height_px", "growth_px",
        "est_distance_m", "closing_speed_mps", "proxy_ttc_s", "risk_status"
    ])

    print(f"[INFO] Running multi-vehicle risk & range analysis on {INPUT_VIDEO} ...")

    results = model.track(
        source=INPUT_VIDEO,
        tracker="bytetrack.yaml",
        classes=VEHICLE_CLASSES,
        conf=0.38,
        iou=0.45,
        agnostic_nms=True,
        persist=True,
        stream=True,
        verbose=False
    )

    frame_idx = 0
    for r in results:
        frame_idx += 1
        frame = r.orig_img.copy()
        frame_statuses = []
        valid_vehicle_count = 0

        if r.boxes is not None and r.boxes.id is not None:
            xyxy_list = r.boxes.xyxy.cpu().tolist()
            xywh_list = r.boxes.xywh.cpu().tolist()
            track_ids = r.boxes.id.int().cpu().tolist()
            cls_ids = r.boxes.cls.int().cpu().tolist()
            confs = r.boxes.conf.cpu().tolist()

            for (x1, y1, x2, y2), (cx, cy, w, h), tid, cid, conf in zip(
                xyxy_list, xywh_list, track_ids, cls_ids, confs
            ):
                cls_name = model.names[cid]
                status, growth, is_valid = risk_engine.evaluate_vehicle(tid, w, frame_w, frame_idx)
                if not is_valid:
                    continue

                dist_m, speed_mps, ttc_s = range_estimator.estimate(tid, cls_name, w, frame_idx)

                valid_vehicle_count += 1
                frame_statuses.append(status)
                color = COLOR_MAP.get(status, (255, 255, 255))

                p1, p2 = (int(x1), int(y1)), (int(x2), int(y2))
                cv2.rectangle(frame, p1, p2, color, 2)

                ttc_str = f"TTC~{ttc_s:.1f}s" if ttc_s is not None else "TTC:N/A"
                label = f"ID #{tid} {cls_name.upper()} | {status} (dW:{growth:+.1f}px | ~{dist_m:.1f}m | {ttc_str})"
                cv2.putText(
                    frame, label, (p1[0], max(25, p1[1] - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.50, color, 2
                )

                csv_writer.writerow([
                    frame_idx, tid, cls_name, f"{conf:.2f}",
                    f"{w:.1f}", f"{h:.1f}", f"{growth:.1f}",
                    f"{dist_m:.2f}" if dist_m else "",
                    f"{speed_mps:.2f}",
                    f"{ttc_s:.1f}" if ttc_s else "",
                    status
                ])

        overall_status = risk_engine.aggregate_frame_status(frame_statuses)
        cv2.rectangle(frame, (10, 10), (520, 80), (0, 0, 0), -1)
        if overall_status == "NO VEHICLE DETECTED":
            hud_color = (0, 255, 255)
            hud_text = "NO VEHICLE DETECTED (LOW VISIBILITY)"
        else:
            hud_color = COLOR_MAP.get(overall_status, (0, 200, 0))
            hud_text = f"SYSTEM STATUS: {overall_status} | VEHICLES: {valid_vehicle_count}"

        cv2.putText(frame, hud_text, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.65, hud_color, 2)
        cv2.putText(
            frame, f"Frame: {frame_idx} | Mode: Synthetic Fog (RGB + Pinhole Proxy)",
            (20, 68), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1
        )

        writer.write(frame)
        if frame_idx % 100 == 0:
            print(f"  [Progress] Processed {frame_idx} frames...")

    writer.release()
    csv_file.close()
    print(f"[SUCCESS] Saved raw video to {OUTPUT_VIDEO} and CSV to {OUTPUT_CSV}")
    reencode_for_browser(OUTPUT_VIDEO)

if __name__ == "__main__":
    main()