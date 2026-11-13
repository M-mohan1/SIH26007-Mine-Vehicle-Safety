import { ReactNode } from "react";
import { Card, CardHeader, PageHeader, Pill } from "../components/ui";

const TECH: Record<string, string[]> = {
  "Computer vision": ["Ultralytics YOLO11n", "ByteTrack", "OpenCV (CLAHE, colour maps)", "FFmpeg (H.264 re-encode)"],
  "Analysis": ["Python", "Pinhole range model", "Rule-based risk engine"],
  "Original dashboard": ["Streamlit", "pandas"],
  "Web application": ["React", "TypeScript", "Vite", "Tailwind CSS", "Recharts", "Lucide icons", "FastAPI", "Uvicorn"],
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Card><CardHeader title={title} /><div className="space-y-2 p-4 text-sm leading-relaxed text-ink-300">{children}</div></Card>;
}
const List = ({ items }: { items: string[] }) => <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-500">{items.map((i) => <li key={i}>{i}</li>)}</ul>;

export default function About() {
  return (
    <>
      <PageHeader title="About the project" description="SIH26007 — Safe and efficient operation of mine vehicles in fog and low-visibility conditions in open-cast iron ore mines." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Problem">
          <p>Open-cast mines run heavy haul trucks and light vehicles on shared roads. Fog and dust cut visibility, so drivers see other vehicles late, and the gap between spotting a vehicle and reacting to it shrinks.</p>
          <p>The challenge is to help operators notice approaching vehicles and judge risk when cameras and eyes are unreliable.</p>
        </Section>
        <Section title="Objectives">
          <List items={[
            "Detect and track vehicles in video, including under fog.",
            "Flag vehicles that are closing in, with a simple, explainable risk status.",
            "Measure how detection degrades as fog gets denser.",
            "Test whether basic image enhancement recovers detections.",
            "Present results in a dashboard that operators and reviewers can read quickly.",
          ]} />
        </Section>
        <Section title="Proposed solution">
          <p>A pipeline that detects cars and trucks with YOLO11n, tracks them with ByteTrack, estimates distance and closing speed with a pinhole model, and classifies each vehicle as SAFE, WARNING or DANGER from how quickly its bounding box grows.</p>
          <p>Fog is simulated on a clear clip so the effect can be measured at known levels. CLAHE contrast enhancement is tested as a software remedy.</p>
        </Section>
        <Card>
          <CardHeader title="Technologies" />
          <div className="space-y-3 p-4">
            {Object.entries(TECH).map(([k, v]) => (
              <div key={k}><div className="mb-1.5 text-xs font-medium text-ink-400">{k}</div><div className="flex flex-wrap gap-1.5">{v.map((t) => <Pill key={t}>{t}</Pill>)}</div></div>
            ))}
          </div>
        </Card>
        <Section title="Current implementation">
          <List items={[
            "Runs offline on recorded video and writes an annotated MP4 plus CSV results.",
            "Fog is synthetic: a white veil blended over a clear 10-second, 240-frame clip.",
            "Risk status comes from bounding-box width growth; distance and TTC are informational.",
            "This web app displays saved results. It does not stream or analyse live video.",
          ]} />
        </Section>
        <Section title="Limitations">
          <List items={[
            "Synthetic fog is not real mine fog or dust; real conditions will be harder.",
            "Pretrained COCO weights, not fine-tuned on mining vehicles or equipment.",
            "Uncalibrated monocular camera: distance and TTC are approximations, and a car/truck label flip changes the assumed width and makes them jump.",
            "Track IDs are not unique vehicles. The source clip has scene cuts, so IDs restart.",
            "No ground-truth labels: detection rate means “at least one detection in the frame”, not accuracy.",
            "Pseudo-IR is a false-colour visualisation of RGB, not thermal imagery.",
            "Single short clip; results do not generalise.",
          ]} />
        </Section>
        <Section title="Future scope">
          <p>Ideas for further work, none of which are implemented here:</p>
          <List items={[
            "Evaluate with real thermal (LWIR) camera footage.",
            "Fine-tune the detector on mining-vehicle data and label ground truth for proper precision and recall.",
            "Calibrate the camera, or fuse radar or LiDAR, for metric distance.",
            "Run on a live camera stream with an on-vehicle alert.",
            "Test on real fog and dust recordings from an open-cast site.",
          ]} />
        </Section>
      </div>
    </>
  );
}
