# cat << 'EOF' > src/risk/range_estimator.py

from collections import defaultdict, deque

class PinholeRangeEstimator:
    """
    Approximate monocular distance and closing-speed estimator using the Pinhole Camera Model:
        Z_m = (focal_length_px * real_vehicle_width_m) / bbox_width_px
    Note: Because the camera is uncalibrated and vehicle orientation varies, these values
    are approximate geometric proxies, not LiDAR/Radar metric measurements.
    """
    # Assumed real-world widths (meters) for open-cast mine vehicle classes
    CLASS_WIDTH_PRIORS_M = {
        "car": 1.95,    # 4x4 Mine Utility SUV (e.g., Land Cruiser)
        "truck": 4.80,  # Haul Road Dump Truck / Heavy Machinery
        "bus": 3.00,
    }

    def __init__(self, focal_length_px=900.0, fps=24.0, history_len=5):
        self.focal_length_px = focal_length_px
        self.fps = max(1.0, float(fps))
        self.history_len = history_len
        # Stores tuples of (frame_idx, smoothed_distance_m) per track_id
        self.dist_history = defaultdict(lambda: deque(maxlen=history_len))
        self.raw_widths = defaultdict(lambda: deque(maxlen=3))

    def estimate(self, track_id, class_name, bbox_width_px, frame_idx):
        """
        Returns: (est_distance_m, closing_speed_mps, proxy_ttc_sec)
        """
        if bbox_width_px <= 5.0:
            return None, 0.0, None

        # Smooth bounding-box width over last 3 observations to reduce jitter
        self.raw_widths[track_id].append(bbox_width_px)
        smoothed_w = sum(self.raw_widths[track_id]) / len(self.raw_widths[track_id])

        real_w_m = self.CLASS_WIDTH_PRIORS_M.get(class_name, 3.50)
        dist_m = (self.focal_length_px * real_w_m) / smoothed_w

        hist = self.dist_history[track_id]
        hist.append((frame_idx, dist_m))

        closing_speed_mps = 0.0
        proxy_ttc_s = None

        if len(hist) >= 2:
            f_old, d_old = hist[0]
            f_new, d_new = hist[-1]
            dt = (f_new - f_old) / self.fps
            if dt > 0:
                # Positive closing_speed means vehicle is getting closer (d_new < d_old)
                closing_speed_mps = (d_old - d_new) / dt
                if closing_speed_mps > 0.4:
                    proxy_ttc_s = max(0.1, d_new / closing_speed_mps)

        return round(dist_m, 2), round(closing_speed_mps, 2), (round(proxy_ttc_s, 1) if proxy_ttc_s is not None else None)