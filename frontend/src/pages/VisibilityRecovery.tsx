import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Thermometer } from "lucide-react";
import { useApi } from "../lib/api";
import type { RecoveryResponse, VideosResponse } from "../lib/types";
import { fmt, fmtInt, signed } from "../lib/utils";
import { AsyncView, Card, CardHeader, MetricCard, PageHeader, RecordedBanner, Table, Td } from "../components/ui";
import { AXIS, BRAND, ChartLegend, ChartTip, GRID, NEUTRAL } from "../components/charts";
import { VideoPlayer } from "../components/VideoPlayer";

export default function VisibilityRecovery() {
  const rec = useApi<RecoveryResponse>("/api/recovery-comparison");
  const videos = useApi<VideosResponse>("/api/videos");
  return (
    <>
      <PageHeader title="Visibility recovery" description="Can simple image enhancement bring back vehicles that heavy fog hides? Compare raw foggy footage with a CLAHE-enhanced version." />
      <AsyncView state={rec} emptyTitle="No recovery comparison results"
        emptyHint={<>Generate them with <code className="font-mono text-ink-200">python src/detection/visibility_recovery.py</code>.</>}>
        {(d) => <Body d={d} videos={videos.data} />}
      </AsyncView>
    </>
  );
}

function Body({ d, videos }: { d: RecoveryResponse; videos: VideosResponse | null }) {
  const video = videos?.videos.find((v) => v.id === d.video_id && v.available);
  const raw = d.rows.find((r) => r.role === "baseline");
  const enh = d.rows.find((r) => r.role === "enhanced");
  const chart = [
    { metric: "Detection rate (%)", raw: raw?.detection_rate_pct ?? null, enhanced: enh?.detection_rate_pct ?? null },
    { metric: "Blind-spot frames", raw: raw?.missed_frames ?? null, enhanced: enh?.missed_frames ?? null },
  ];

  return (
    <div className="space-y-4">
      <RecordedBanner><strong className="font-semibold text-ink-100">Recorded experiment data.</strong> One run on a 240-frame clip with synthetic fog added. Detection ran on the raw and the enhanced RGB frames separately.</RecordedBanner>

      <div className="flex items-start gap-2.5 rounded-md border border-warn/30 bg-warn/5 px-3.5 py-2.5 text-sm text-ink-200">
        <Thermometer size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
        <div><strong className="font-semibold text-ink-100">The “IR” inset is not thermal-camera footage.</strong> It is a false-colour rendering of the same foggy RGB frame (grayscale + CLAHE + inferno colour map). It illustrates what thermal contrast might look like and is not used for detection.</div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Raw fog detection rate" value={fmt(raw?.detection_rate_pct, 1, "%")} hint={raw?.pipeline ?? undefined} />
        <MetricCard label="CLAHE detection rate" value={fmt(enh?.detection_rate_pct, 1, "%")} hint={d.delta ? `${signed(d.delta.detection_rate_pp, 1, " pp")} vs raw` : undefined} accent="SAFE" />
        <MetricCard label="Blind-spot frames recovered" value={fmtInt(d.delta?.blind_frames_recovered)} hint={raw && enh ? `${fmtInt(raw.missed_frames)} → ${fmtInt(enh.missed_frames)}` : undefined} />
        <MetricCard label="Avg confidence change" value={signed(d.delta?.avg_confidence ?? null, 2)} hint={raw && enh ? `${fmt(raw.avg_confidence, 2)} → ${fmt(enh.avg_confidence, 2)}` : undefined} />
      </div>

      <Card>
        <CardHeader title="Before and after" subtitle="Left: raw foggy RGB with detections. Right: CLAHE-enhanced RGB with pseudo-IR inset (bottom right)." />
        <div className="p-4">
          {video ? (
            <VideoPlayer video={video} />
          ) : <p className="py-10 text-center text-sm text-ink-300">The comparison video is not available on the server.</p>}
          <p className="mt-2 text-xs text-ink-400">Panel labels are drawn into the video: the left panel is the raw foggy frame, the right panel is the enhanced frame.</p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Raw vs enhanced" subtitle="Same clip and same detector; only the input frames differ" />
          <div className="space-y-2 p-4">
            <ChartLegend items={[{ label: "Standard RGB in fog", color: NEUTRAL }, { label: "CLAHE-enhanced RGB", color: BRAND }]} />
            <div className="h-60" role="img" aria-label={`Raw vs enhanced: ${chart.map((c) => `${c.metric} raw ${c.raw}, enhanced ${c.enhanced}`).join("; ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 18, right: 8, left: -8, bottom: 0 }} barGap={4}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="metric" {...AXIS} />
                  <YAxis {...AXIS} />
                  <Tooltip cursor={{ fill: "#ffffff0d" }} content={<ChartTip />} />
                  <Bar dataKey="raw" name="Standard RGB in fog" fill={NEUTRAL} radius={[4, 4, 0, 0]} maxBarSize={48}><LabelList dataKey="raw" position="top" fill="#cfd4db" fontSize={12} /></Bar>
                  <Bar dataKey="enhanced" name="CLAHE-enhanced RGB" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={48}><LabelList dataKey="enhanced" position="top" fill="#cfd4db" fontSize={12} /></Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Enhancement pipeline" subtitle="What src/detection/visibility_recovery.py does to each frame" />
          <ol className="space-y-3 p-4 text-sm leading-relaxed text-ink-300">
            <Step n={1} t="Add synthetic fog">A white layer is blended over the clear frame with a vertical gradient (denser toward the top).</Step>
            <Step n={2} t="CLAHE on luminance">Convert to LAB colour space, apply contrast-limited adaptive histogram equalisation to the L channel only (clip limit 3.2, 8×8 tiles), convert back to BGR.</Step>
            <Step n={3} t="Detect on both frames">The same YOLO11n model runs on the raw foggy frame and on the enhanced frame. Detection rate counts frames with at least one valid vehicle box.</Step>
            <Step n={4} t="Pseudo-IR inset (display only)">The foggy frame is converted to grayscale, CLAHE is applied, and an inferno colour map is drawn as a small inset. No detection uses it.</Step>
          </ol>
        </Card>
      </div>

      <Card>
        <CardHeader title="Results" subtitle="Direct from recovery_comparison.csv" />
        <Table caption="Recovery comparison" head={["Pipeline", "Frames", "Detection frames", "Blind-spot frames", "Detection rate", "Avg confidence"]}>
          {d.rows.map((r) => (
            <tr key={r.pipeline} className="hover:bg-ink-800/60">
              <Td>{r.pipeline ?? "Not available"}</Td><Td>{fmtInt(r.total_frames)}</Td><Td>{fmtInt(r.active_frames)}</Td><Td>{fmtInt(r.missed_frames)}</Td>
              <Td>{fmt(r.detection_rate_pct, 1, "%")}</Td><Td>{fmt(r.avg_confidence, 2)}</Td>
            </tr>
          ))}
        </Table>
        <div className="space-y-2 border-t border-ink-700 p-4 text-sm leading-relaxed text-ink-300">
          <p><strong className="text-ink-100">Read with care.</strong> Detection rate counts any detection, correct or not. There is no ground truth, so extra boxes created by contrast stretching would also raise the number. The CSV labels the second row “+ Pseudo-IR Map”, but the pseudo-IR inset does not feed the detector.</p>
          <p><strong className="text-ink-100">Why real thermal sensors still matter.</strong> In near whiteout, visible light is scattered and software contrast cannot recover what the camera never captured. Long-wave infrared sensors detect heat emitted by engines and tyres. This project does not include real thermal data.</p>
        </div>
      </Card>
    </div>
  );
}

function Step({ n, t, children }: { n: number; t: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-brand-500/50 text-xs font-semibold text-brand-400">{n}</span>
      <div><div className="font-medium text-ink-100">{t}</div>{children}</div>
    </li>
  );
}
