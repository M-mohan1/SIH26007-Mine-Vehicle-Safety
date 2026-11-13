
import os
import cv2
from ultralytics import YOLO

INPUT_VIDEO = "data/input/mine_fog.mp4"
VEHICLE_CLASSES = [2, 7]  # 2: car, 7: truck (no bus or motorcycle)
MAX_VALID_WIDTH_RATIO = 0.85

def main():
    if not os.path.exists(INPUT_VIDEO):
        print(f"[ERROR] {INPUT_VIDEO} not found.")
        return

    cap = cv2.VideoCapture(INPUT_VIDEO)
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    cap.release()

    model = YOLO("yolo11n.pt")
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
        valid_printed = False

        if r.boxes is not None and r.boxes.id is not None:
            xywh_list = r.boxes.xywh.cpu().tolist()
            track_ids = r.boxes.id.int().cpu().tolist()
            cls_ids = r.boxes.cls.int().cpu().tolist()

            for (x, y, w, h), tid, cid in zip(xywh_list, track_ids, cls_ids):
                # Reject full-width cabin hood/wiper false detections (e.g., 1280px wide)
                if w <= 5.0 or w >= (frame_w * MAX_VALID_WIDTH_RATIO):
                    continue

                cls_name = model.names[cid]
                print(f"Frame {frame_idx} | ID {tid} | {cls_name} | center=({x:.1f},{y:.1f}) | size=({w:.1f},{h:.1f})")
                valid_printed = True

        if not valid_printed:
            print(f"Frame {frame_idx} | NO VEHICLES DETECTED")

if __name__ == "__main__":
    main()