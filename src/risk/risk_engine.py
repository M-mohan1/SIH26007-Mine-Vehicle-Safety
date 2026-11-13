# from collections import defaultdict, deque

# class MultiVehicleRiskEngine:
#     """
#     Heuristic approach-risk estimator based on bounding-box width history.
#     Tracks each vehicle ID independently across frames.
#     Note: Pixel width growth is a 2D visual heuristic, not physical TTC or metric distance.
#     """
#     def __init__(self, history_len=5, warn_thresh=25.0, danger_thresh=50.0, max_valid_ratio=0.92):
#         self.history = defaultdict(lambda: deque(maxlen=history_len))
#         self.warn_thresh = warn_thresh
#         self.danger_thresh = danger_thresh
#         self.max_valid_ratio = max_valid_ratio

#     def evaluate_vehicle(self, track_id, bbox_width, frame_width):
#         """
#         Evaluates a single vehicle's bounding box growth.
#         Returns: (status_str, growth_px, is_valid_box)
#         """
#         # Filter invalid boxes that span almost the entire frame width (false detections)
#         if bbox_width <= 5.0 or bbox_width >= (frame_width * self.max_valid_ratio):
#             return "INVALID", 0.0, False

#         widths = self.history[track_id]
#         widths.append(bbox_width)

#         if len(widths) < 2:
#             return "SAFE", 0.0, True

#         # Smooth slightly by comparing current width to earliest width in the 5-frame window
#         growth = widths[-1] - widths[0]

#         if growth > self.danger_thresh:
#             status = "DANGER"
#         elif growth > self.warn_thresh:
#             status = "WARNING"
#         else:
#             status = "SAFE"

#         return status, growth, True

#     @staticmethod
#     def aggregate_frame_status(vehicle_statuses):
#         """Returns the highest risk level among all vehicles currently in the frame."""
#         if not vehicle_statuses:
#             return "NO VEHICLE DETECTED"
#         if "DANGER" in vehicle_statuses:
#             return "DANGER"
#         if "WARNING" in vehicle_statuses:
#             return "WARNING"
#         return "SAFE"


from collections import defaultdict, deque

class MultiVehicleRiskEngine:
    """
    Heuristic approach-risk estimator based on bounding-box width history.
    Includes automatic stale-track pruning for long (30+ minute) videos.
    """
    def __init__(self, history_len=5, warn_thresh=25.0, danger_thresh=50.0, max_valid_ratio=0.85, max_idle_frames=300):
        self.history = defaultdict(lambda: deque(maxlen=history_len))
        self.last_seen_frame = {}
        self.warn_thresh = warn_thresh
        self.danger_thresh = danger_thresh
        self.max_valid_ratio = max_valid_ratio
        self.max_idle_frames = max_idle_frames

    def evaluate_vehicle(self, track_id, bbox_width, frame_width, current_frame=0):
        if bbox_width <= 5.0 or bbox_width >= (frame_width * self.max_valid_ratio):
            return "INVALID", 0.0, False

        self.last_seen_frame[track_id] = current_frame
        widths = self.history[track_id]
        widths.append(bbox_width)

        # Periodically prune stale tracks every 500 frames to keep RAM constant on 30-min videos
        if current_frame > 0 and current_frame % 500 == 0:
            stale_ids = [tid for tid, f in self.last_seen_frame.items() if (current_frame - f) > self.max_idle_frames]
            for tid in stale_ids:
                self.history.pop(tid, None)
                self.last_seen_frame.pop(tid, None)

        if len(widths) < 2:
            return "SAFE", 0.0, True

        growth = widths[-1] - widths[0]

        if growth > self.danger_thresh:
            status = "DANGER"
        elif growth > self.warn_thresh:
            status = "WARNING"
        else:
            status = "SAFE"

        return status, growth, True

    @staticmethod
    def aggregate_frame_status(vehicle_statuses):
        if not vehicle_statuses:
            return "NO VEHICLE DETECTED"
        if "DANGER" in vehicle_statuses:
            return "DANGER"
        if "WARNING" in vehicle_statuses:
            return "WARNING"
        return "SAFE"

if __name__ == "__main__":
    engine = MultiVehicleRiskEngine()
    for i, w in enumerate([100.0, 115.0, 130.0, 155.0, 175.0], 1):
        s, g, _ = engine.evaluate_vehicle(10, w, 1280, i)
        print(f"Frame {i:02d} | Track #10 | Width: {w:.1f}px | Growth: {g:+.1f}px | Status: {s}")
