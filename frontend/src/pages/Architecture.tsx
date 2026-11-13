import { useState } from "react";
import { ArrowDown, ArrowRight, Crosshair, Film, LayoutDashboard, Radar, Route, ShieldAlert, type LucideIcon } from "lucide-react";
import { Card, CardHeader, PageHeader, Pill } from "../components/ui";
import { cn } from "../lib/utils";

interface Stage { id: string; name: string; short: string; Icon: LucideIcon; tech: string[]; files: string[]; does: string[]; output: string }

const STAGES: Stage[] = [
  { id: "input", name: "Camera / video input", short: "Recorded MP4", Icon: Film, tech: ["OpenCV", "FFmpeg"],
    files: ["src/detection/add_fog.py", "data/input/vehicle.mp4"],
    does: ["Reads frames from a video file. In this prototype the source is a recorded clear clip with synthetic fog blended in; no live camera is connected.", "Fog is a white veil with a vertical gradient (default strength 65%)."],
    output: "Foggy frames at 1280×720, 24 fps" },
  { id: "yolo", name: "YOLO object detection", short: "YOLO11n", Icon: Crosshair, tech: ["Ultralytics YOLO11n", "COCO weights"],
    files: ["src/risk/risk_demo.py"],
    does: ["Detects cars (COCO class 2) and trucks (class 7) with confidence ≥ 0.38, IoU 0.45 and class-agnostic NMS.", "Uses general-purpose COCO weights, not a model trained on mining vehicles."],
    output: "Bounding boxes with class and confidence" },
  { id: "track", name: "ByteTrack multi-object tracking", short: "Persistent IDs", Icon: Route, tech: ["ByteTrack (via Ultralytics)"],
    files: ["src/risk/risk_demo.py", "src/detection/track_data.py"],
    does: ["Associates detections across frames so each vehicle keeps one ID.", "Boxes wider than 85% of the frame are discarded as false detections."],
    output: "Track ID per box, per frame" },
  { id: "motion", name: "Motion and distance estimation", short: "Pinhole range + TTC", Icon: Radar, tech: ["Pinhole camera model", "Python"],
    files: ["src/risk/range_estimator.py"],
    does: ["Distance Z = f × W / w, with f = 900 px and an assumed real width per class (car 1.95 m, truck 4.8 m, other 3.5 m).", "Closing speed comes from distance change over up to 5 samples; proxy TTC is distance ÷ closing speed when closing faster than 0.4 m/s.", "The camera is uncalibrated, so values are approximations."],
    output: "est_distance_m, closing_speed_mps, proxy_ttc_s" },
  { id: "risk", name: "Risk assessment", short: "SAFE · WARNING · DANGER", Icon: ShieldAlert, tech: ["Python (MultiVehicleRiskEngine)"],
    files: ["src/risk/risk_engine.py"],
    does: ["Keeps a 5-frame history of each track’s box width. Growth above 25 px is WARNING; above 50 px is DANGER.", "Distance and TTC are not used for the status. Idle tracks are pruned to keep memory flat on long videos."],
    output: "risk_status per vehicle; worst status per frame" },
  { id: "dash", name: "Safety dashboard", short: "React + FastAPI", Icon: LayoutDashboard, tech: ["React", "TypeScript", "Vite", "Tailwind CSS", "Recharts", "FastAPI", "Streamlit (original)"],
    files: ["backend/main.py", "frontend/", "src/dashboard/app.py"],
    does: ["The pipeline writes an annotated MP4 and CSV files. The FastAPI backend serves them; the React app displays them.", "The original Streamlit dashboard is unchanged and still works."],
    output: "This web application" },
];

export default function Architecture() {
  const [sel, setSel] = useState("yolo");
  const stage = STAGES.find((s) => s.id === sel)!;
  return (
    <>
      <PageHeader title="System architecture" description="The processing pipeline implemented in this project, from video frames to the safety dashboard. Select a stage for details." />
      <div className="space-y-4">
        <Card>
          <CardHeader title="Pipeline" subtitle="Runs offline in Python; the web app displays the saved results" />
          <div className="flex flex-col items-stretch gap-2 p-4 lg:flex-row">
            {STAGES.map((s, i) => (
              <div key={s.id} className="flex flex-1 flex-col items-stretch gap-2 lg:flex-row">
                <button onClick={() => setSel(s.id)} aria-pressed={sel === s.id}
                  className={cn("flex flex-1 flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
                    sel === s.id ? "border-brand-500 bg-brand-500/10" : "border-ink-700 bg-ink-900/60 hover:border-ink-500")}>
                  <s.Icon size={20} className={sel === s.id ? "text-brand-400" : "text-ink-300"} aria-hidden />
                  <span className="text-sm font-semibold leading-snug text-ink-100">{s.name}</span>
                  <span className="text-xs text-ink-400">{s.short}</span>
                </button>
                {i < STAGES.length - 1 && (
                  <>
                    <ArrowRight size={18} className="hidden shrink-0 self-center text-ink-500 lg:block" aria-hidden />
                    <ArrowDown size={18} className="mx-auto shrink-0 text-ink-500 lg:hidden" aria-hidden />
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="fade-in" key={stage.id}>
          <CardHeader title={stage.name} subtitle={`Produces: ${stage.output}`} />
          <div className="grid gap-5 p-4 md:grid-cols-3">
            <div className="space-y-2 text-sm leading-relaxed text-ink-300 md:col-span-2">
              {stage.does.map((t) => <p key={t}>{t}</p>)}
            </div>
            <div className="space-y-3 text-sm">
              <div><div className="mb-1.5 text-xs font-medium text-ink-400">Technologies</div><div className="flex flex-wrap gap-1.5">{stage.tech.map((t) => <Pill key={t} tone="brand">{t}</Pill>)}</div></div>
              <div><div className="mb-1.5 text-xs font-medium text-ink-400">Source files</div><ul className="space-y-1">{stage.files.map((f) => <li key={f} className="font-mono text-xs text-ink-200">{f}</li>)}</ul></div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Offline experiment scripts" subtitle="Separate runs that produce the benchmark CSVs" />
          <div className="grid gap-4 p-4 text-sm leading-relaxed text-ink-300 md:grid-cols-2">
            <div className="rounded-md border border-ink-700 bg-ink-900/50 p-3"><div className="font-semibold text-ink-100">Fog benchmark</div><div className="font-mono text-xs text-ink-400">src/detection/evaluate_fog.py</div><p className="mt-1.5">Runs detection and tracking on the first 240 frames at 0%, 40%, 65% and 80% fog and writes fog_evaluation_summary.csv.</p></div>
            <div className="rounded-md border border-ink-700 bg-ink-900/50 p-3"><div className="font-semibold text-ink-100">Visibility recovery</div><div className="font-mono text-xs text-ink-400">src/detection/visibility_recovery.py</div><p className="mt-1.5">Compares detection on raw fog against CLAHE-enhanced frames and writes recovery_comparison.csv and the side-by-side video.</p></div>
          </div>
        </Card>

        <Card>
          <CardHeader title="How the web app is wired" />
          <div className="flex flex-col items-stretch gap-2 p-4 text-sm md:flex-row md:items-center">
            {[["CSV + MP4 files", "data/output, data/input"], ["FastAPI backend", "reads files, streams video with Range support, never runs inference"], ["React frontend", "fetches JSON from /api, plays video"]].map(([a, b], i, arr) => (
              <div key={a} className="flex flex-1 items-stretch gap-2">
                <div className="flex-1 rounded-md border border-ink-700 bg-ink-900/50 p-3"><div className="font-semibold text-ink-100">{a}</div><div className="text-xs text-ink-400">{b}</div></div>
                {i < arr.length - 1 && <ArrowRight size={18} className="hidden shrink-0 self-center text-ink-500 md:block" aria-hidden />}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
