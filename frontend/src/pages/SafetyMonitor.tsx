import { useCallback, useMemo, useRef, useState } from "react";
import { useApi } from "../lib/api";
import type { Observation, RiskStatus, TelemetryResponse, VideosResponse } from "../lib/types";
import { STATUS_COLOR, fmt, fmtBytes, titleCase } from "../lib/utils";
import { AsyncView, Card, CardHeader, EmptyState, PageHeader, Pill, RecordedBanner, StatusBadge } from "../components/ui";
import { PlayerHandle, VideoPlayer } from "../components/VideoPlayer";
import { cn } from "../lib/utils";

const WORST: Record<RiskStatus, number> = { SAFE: 0, WARNING: 1, DANGER: 2 };

export default function SafetyMonitor() {
  const videos = useApi<VideosResponse>("/api/videos");
  const telemetry = useApi<TelemetryResponse>("/api/telemetry");
  return (
    <>
      <PageHeader title="Safety monitor" description="Play the annotated demo footage and watch the per-vehicle telemetry change frame by frame." />
      <AsyncView state={videos} emptyTitle="No demo videos found" emptyHint="Place the MP4 files under data/output/ and data/input/ and restart the API.">
        {(v) => <Monitor videos={v} telemetry={telemetry.data} telemetryError={telemetry.error?.message ?? null} />}
      </AsyncView>
    </>
  );
}

function Monitor({ videos, telemetry, telemetryError }: { videos: VideosResponse; telemetry: TelemetryResponse | null; telemetryError: string | null }) {
  const list = videos.videos;
  const firstAvail = list.find((v) => v.available && v.has_telemetry) ?? list.find((v) => v.available) ?? list[0];
  const [id, setId] = useState(firstAvail.id);
  const video = list.find((v) => v.id === id) ?? firstAvail;
  const [time, setTime] = useState(0);
  const player = useRef<PlayerHandle>(null);

  const fps = video.fps ?? telemetry?.fps ?? null;
  const totalFrames = video.frames ?? telemetry?.total_frames ?? null;
  const frame = fps ? Math.min(totalFrames ?? Infinity, Math.max(1, Math.floor(time * fps + 1e-6) + 1)) : null;

  const byFrame = useMemo(() => {
    const m = new Map<number, Observation[]>();
    for (const o of telemetry?.observations ?? []) {
      const a = m.get(o.frame); if (a) a.push(o); else m.set(o.frame, [o]);
    }
    return m;
  }, [telemetry]);

  const hasTelemetry = video.has_telemetry && telemetry && (telemetry.status === "ok" || telemetry.status === "partial");
  const onTime = useCallback((t: number) => setTime(t), []);
  const here = hasTelemetry && frame ? byFrame.get(frame) ?? [] : [];
  const frameStatus = here.length ? here.map((o) => o.risk_status).reduce((a, b) => (WORST[b] > WORST[a] ? b : a)) : null;

  return (
    <div className="space-y-4">
      <RecordedBanner><strong className="font-semibold text-ink-100">Recorded demo footage, not a live stream.</strong> These are pre-rendered MP4 files; no camera is connected and no detection runs while you watch.</RecordedBanner>

      <div role="tablist" aria-label="Demo videos" className="flex flex-wrap gap-2">
        {list.map((v) => (
          <button key={v.id} role="tab" aria-selected={v.id === id} disabled={!v.available} onClick={() => setId(v.id)}
            className={cn("rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              v.id === id ? "border-brand-500 bg-brand-500/10 text-ink-100" : "border-ink-600 text-ink-300 hover:border-ink-500 hover:text-ink-100")}>
            {v.title}{!v.available && " (missing)"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={video.title} subtitle={video.description} />
          <div className="space-y-3 p-4">
            <VideoPlayer ref={player} video={video} onTime={onTime} />
            {hasTelemetry && totalFrames && fps && (
              <Timeline total={totalFrames} byFrame={byFrame} frame={frame ?? 1}
                onSeek={(f) => player.current?.seek((f - 1) / fps + 0.001)} />
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              <Pill>{video.width && video.height ? `${video.width}×${video.height}` : "Resolution not available"}</Pill>
              <Pill>{fmt(video.fps, 0, " fps")}</Pill>
              <Pill>{fmt(video.duration_s, 1, " s")}</Pill>
              <Pill>{fmt(video.frames, 0, " frames")}</Pill>
              <Pill>{fmtBytes(video.size_bytes)}</Pill>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader title="Telemetry" subtitle={frame ? `Frame ${frame}${totalFrames ? ` of ${totalFrames}` : ""} · ${time.toFixed(2)} s` : "Waiting for video metadata"} />
          <div className="space-y-3 p-4">
            {!video.has_telemetry && <EmptyState title="No telemetry for this video" message="Telemetry (track IDs, risk, distance) exists only for the annotated risk video." />}
            {video.has_telemetry && telemetryError && <EmptyState title="Telemetry unavailable" message={telemetryError} />}
            {video.has_telemetry && telemetry && !hasTelemetry && !telemetryError && <EmptyState title="Telemetry unavailable" message={telemetry.message} />}
            {hasTelemetry && (
              <>
                <div className="flex items-center justify-between rounded-md border border-ink-700 bg-ink-900/60 px-3 py-2">
                  <span className="text-xs text-ink-400">Frame status</span>
                  {frameStatus ? <StatusBadge status={frameStatus} /> : <span className="text-sm text-ink-300">No valid vehicle detected</span>}
                </div>
                {here.length === 0 && <p className="text-xs leading-relaxed text-ink-400">No tracked vehicle in this frame. In the video this is shown as a blind-spot frame (for example, heavy fog or an occluded view).</p>}
                <ul className="space-y-2">
                  {here.map((o) => (
                    <li key={o.track_id} className="rounded-md border border-ink-700 bg-ink-900/60 p-3" style={{ borderLeft: `3px solid ${STATUS_COLOR[o.risk_status]}` }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">ID #{o.track_id} <span className="font-normal text-ink-300">{titleCase(o.class_name)}</span></span>
                        <StatusBadge status={o.risk_status} size="sm" />
                      </div>
                      <dl className="tabular mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <Stat k="Confidence" v={fmt(o.confidence, 2)} />
                        <Stat k="Est. distance" v={fmt(o.est_distance_m, 1, " m")} tip="Pinhole estimate from box width and an assumed real vehicle width." />
                        <Stat k="Proxy TTC" v={fmt(o.proxy_ttc_s, 1, " s")} tip="Estimated distance divided by estimated closing speed. Blank when the vehicle is not approaching." />
                        <Stat k="Closing speed" v={fmt(o.closing_speed_mps, 1, " m/s")} />
                        <Stat k="Box width" v={fmt(o.width_px, 0, " px")} />
                        <Stat k="Width growth" v={fmt(o.growth_px, 1, " px")} tip="Growth over a 5-frame window. Above 25 px is WARNING; above 50 px is DANGER." />
                      </dl>
                    </li>
                  ))}
                </ul>
                <p className="text-xs leading-relaxed text-ink-400">Distance and TTC are approximations from an uncalibrated camera. Only the width growth drives the risk status.</p>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ k, v, tip }: { k: string; v: string; tip?: string }) {
  return <div title={tip}><dt className="text-ink-400">{k}</dt><dd className="font-medium text-ink-100">{v}</dd></div>;
}

function Timeline({ total, byFrame, frame, onSeek }: { total: number; byFrame: Map<number, Observation[]>; frame: number; onSeek: (f: number) => void }) {
  const cells = useMemo(() => Array.from({ length: total }, (_, i) => {
    const obs = byFrame.get(i + 1);
    if (!obs) return "#2a2f36";
    return STATUS_COLOR[obs.map((o) => o.risk_status).reduce((a, b) => (WORST[b] > WORST[a] ? b : a))];
  }), [total, byFrame]);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-ink-400">
        <span>Risk timeline — click to jump</span>
        <span className="flex gap-3">
          {(["SAFE", "WARNING", "DANGER"] as RiskStatus[]).map((s) => <span key={s} className="flex items-center gap-1"><i className="inline-block size-2 rounded-sm" style={{ background: STATUS_COLOR[s] }} />{s}</span>)}
          <span className="flex items-center gap-1"><i className="inline-block size-2 rounded-sm bg-ink-700" />no vehicle</span>
        </span>
      </div>
      <div role="slider" tabIndex={0} aria-label="Video timeline" aria-valuemin={1} aria-valuemax={total} aria-valuenow={frame}
        className="relative flex h-6 cursor-pointer overflow-hidden rounded"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.min(total, Math.max(1, Math.floor(((e.clientX - r.left) / r.width) * total) + 1))); }}
        onKeyDown={(e) => { if (e.key === "ArrowRight") onSeek(Math.min(total, frame + 1)); if (e.key === "ArrowLeft") onSeek(Math.max(1, frame - 1)); }}>
        {cells.map((c, i) => <span key={i} className="h-full flex-1" style={{ background: c }} />)}
        <span className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${((frame - 0.5) / total) * 100}%` }} aria-hidden />
      </div>
    </div>
  );
}
