export type RiskStatus = "SAFE" | "WARNING" | "DANGER";
export type ApiStatus = "ok" | "partial" | "empty" | "missing" | "error";

export interface Envelope {
  status: ApiStatus;
  message?: string | null;
  warnings?: string[];
  source?: string;
}

export interface VideoItem {
  id: string; title: string; kind: "annotated" | "comparison" | "source";
  description: string; has_telemetry: boolean; available: boolean; file: string;
  stream_url: string | null; size_bytes: number | null;
  width: number | null; height: number | null; duration_s: number | null;
  frames: number | null; fps: number | null;
}
export interface VideosResponse extends Envelope { videos: VideoItem[]; available_count: number }

export interface Observation {
  frame: number; track_id: number; class_name: string | null; confidence: number | null;
  width_px: number | null; height_px: number | null; growth_px: number | null;
  est_distance_m: number | null; closing_speed_mps: number | null; proxy_ttc_s: number | null;
  risk_status: RiskStatus;
}
export interface TelemetryResponse extends Envelope {
  video_id?: string; fps: number | null; total_frames?: number | null;
  count?: number; observations?: Observation[];
}

export interface RiskEvent {
  id: string; track_id: number; class_name: string | null; status: RiskStatus;
  start_frame: number; end_frame: number; frames: number;
  start_time_s: number | null; end_time_s: number | null;
  peak_growth_px: number | null; min_est_distance_m: number | null;
  min_proxy_ttc_s: number | null; max_closing_speed_mps: number | null;
}
export interface VehicleSummary {
  track_id: number; class_name: string | null; frames_seen: number; class_switches: number;
  first_frame: number; last_frame: number; confirmed: boolean; peak_status: RiskStatus;
  status_frames: Record<RiskStatus, number>;
  max_growth_px: number | null; max_width_px: number | null;
  min_est_distance_m: number | null; min_proxy_ttc_s: number | null;
  max_closing_speed_mps: number | null; avg_confidence: number | null;
}
export interface Distribution {
  observations: Record<RiskStatus, number> & { total: number };
  frames: Record<RiskStatus, number> & { with_vehicle: number; total: number | null; no_vehicle: number | null };
}
export interface RiskEventsResponse extends Envelope {
  fps: number | null; total_frames: number | null; min_confirm_frames?: number;
  event_count?: number; events: RiskEvent[]; vehicles: VehicleSummary[];
  distribution: Distribution | null;
  classification?: { rule: string; warning_above_px: number; danger_above_px: number; ttc_used_for_classification: boolean };
}

export interface HealthResponse {
  status: "ok" | "degraded"; service: string; mode: string; inference_enabled: boolean;
  csv_files: { id: string; file: string; state: string; rows: number; message: string | null; modified: number | null }[];
  videos: { id: string; file: string; available: boolean }[];
}
export interface OverviewResponse extends Envelope {
  mode: string; mode_note: string; health: HealthResponse;
  run: { video_id: string; total_frames: number | null; fps: number | null; duration_s: number | null; width: number | null; height: number | null };
  tracks: { total: number; confirmed: number; min_confirm_frames: number; by_class: Record<string, number>; ids: number[] } | null;
  distribution: Distribution | null; peak_status: RiskStatus | null;
  event_count?: number; recent_events: RiskEvent[]; vehicles?: VehicleSummary[];
}

export interface FogRow {
  condition: string | null; fog_intensity: string | null; fog_intensity_pct: number | null;
  total_frames: number | null; active_frames: number | null; blind_spot_frames: number | null;
  detection_rate_pct: number | null; confirmed_tracks: number | null; noise_ids: number | null;
  avg_confidence: number | null; detection_rate_delta_pp: number | null;
}
export interface FogResponse extends Envelope { rows: FogRow[]; baseline_condition?: string | null }

export interface RecoveryRow {
  pipeline: string | null; total_frames: number | null; active_frames: number | null;
  missed_frames: number | null; detection_rate_pct: number | null; avg_confidence: number | null;
  role: "baseline" | "enhanced" | "other";
}
export interface RecoveryResponse extends Envelope {
  rows: RecoveryRow[]; video_id: string | null;
  delta: { detection_rate_pp: number | null; blind_frames_recovered: number | null; avg_confidence: number | null } | null;
}
