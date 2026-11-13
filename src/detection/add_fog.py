import cv2
import numpy as np
import os

INPUT_VIDEO = "data/input/vehicle.mp4"
OUTPUT_VIDEO = "data/input/mine_fog.mp4"
FOG_INTENSITY = 0.65  # 0.0 (clear) to 1.0 (whiteout)

def add_synthetic_fog(frame, intensity=0.65):
    """Blends a white atmospheric veil with vertical gradient to simulate mine fog."""
    h, w, _ = frame.shape
    fog_layer = np.full_like(frame, 240, dtype=np.uint8)
    
    # Create slight vertical gradient (denser near horizon/top, slightly clearer at bottom)
    gradient = np.linspace(intensity + 0.1, intensity - 0.1, h).clip(0, 0.9)
    alpha = gradient[:, np.newaxis, np.newaxis]
    
    foggy = (frame.astype(np.float32) * (1 - alpha) + fog_layer.astype(np.float32) * alpha)
    return foggy.astype(np.uint8)

def main():
    if not os.path.exists(INPUT_VIDEO):
        print(f"[ERROR] Input video not found at {INPUT_VIDEO}. Place vehicle.mp4 in data/input/")
        return

    cap = cv2.VideoCapture(INPUT_VIDEO)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    os.makedirs(os.path.dirname(OUTPUT_VIDEO), exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(OUTPUT_VIDEO, fourcc, fps, (width, height))

    frame_count = 0
    print(f"[INFO] Generating synthetic fog video -> {OUTPUT_VIDEO} ...")
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        foggy_frame = add_synthetic_fog(frame, FOG_INTENSITY)
        out.write(foggy_frame)
        frame_count += 1

    cap.release()
    out.release()
    print(f"[SUCCESS] Processed {frame_count} frames. Saved to {OUTPUT_VIDEO}")

if __name__ == "__main__":
    main()