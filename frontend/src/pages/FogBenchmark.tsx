import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "../lib/api";
import type { FogResponse, FogRow } from "../lib/types";
import { fmt, fmtInt, signed } from "../lib/utils";
import { AsyncView, Card, CardHeader, MetricCard, PageHeader, RecordedBanner, Table, Td } from "../components/ui";
import { AXIS, ChartTip, FOG_RAMP, GRID } from "../components/charts";

export default function FogBenchmark() {
  const state = useApi<FogResponse>("/api/fog-benchmark");
  return (
    <>
      <PageHeader title="Fog benchmark" description="How much does detection degrade as synthetic fog gets denser? The same 240-frame clip was run through YOLO11n + ByteTrack at four fog levels." />
      <AsyncView state={state} emptyTitle="No fog benchmark results"
        emptyHint={<>Generate them with <code className="font-mono text-ink-200">python src/detection/evaluate_fog.py</code>.</>}>
        {(d) => <Body rows={d.rows} />}
      </AsyncView>
    </>
  );
}

const short = (r: FogRow) => (r.fog_intensity_pct === 0 ? "Clear" : `${r.fog_intensity_pct ?? "?"}% fog`);

function Body({ rows }: { rows: FogRow[] }) {
  const data = rows.map((r, i) => ({ ...r, label: short(r), fill: FOG_RAMP[Math.min(i, FOG_RAMP.length - 1)] }));
  const clear = rows.find((r) => r.fog_intensity_pct === 0);
  const dense = rows.length > 1 ? rows[rows.length - 1] : null;

  return (
    <div className="space-y-4">
      <RecordedBanner><strong className="font-semibold text-ink-100">Recorded experiment data.</strong> Values are read from <code className="font-mono text-xs">fog_evaluation_summary.csv</code>, produced by an offline run. Fog is simulated by blending a white layer over a clear clip.</RecordedBanner>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Clear baseline" value={fmt(clear?.detection_rate_pct, 1, "%")} hint="Frames with ≥1 vehicle detected" />
        <MetricCard label={dense ? `${dense.condition ?? "Densest fog"}` : "Densest fog"} value={fmt(dense?.detection_rate_pct, 1, "%")}
          hint={dense?.detection_rate_delta_pp != null ? `${signed(dense.detection_rate_delta_pp, 1, " pp")} vs clear` : undefined} accent="DANGER" />
        <MetricCard label="Blind-spot frames, densest" value={fmtInt(dense?.blind_spot_frames)} hint={dense ? `of ${fmtInt(dense.total_frames)} frames with no detection` : undefined}
          info="A blind-spot frame is one where no valid vehicle was detected. A vehicle may still have been in view." />
        <MetricCard label="Confirmed tracks, densest" value={fmtInt(dense?.confirmed_tracks)} hint={clear ? `${fmtInt(clear.confirmed_tracks)} in clear footage` : undefined}
          info="Track IDs that persisted for at least 8 frames." />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Detection rate by fog level" subtitle="% of frames with at least one valid vehicle detection" info="Not an accuracy score: there is no ground-truth labelling, so false positives and missed individual vehicles are not counted." />
          <div className="h-64 p-4" role="img" aria-label={`Detection rate: ${data.map((r) => `${r.label} ${r.detection_rate_pct}%`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 18, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis domain={[0, 100]} unit="%" {...AXIS} />
                <Tooltip cursor={{ fill: "#ffffff0d" }} content={<ChartTip unit="%" />} />
                <Bar dataKey="detection_rate_pct" name="Detection rate" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {data.map((r) => <Cell key={r.label} fill={r.fill} />)}
                  <LabelList dataKey="detection_rate_pct" position="top" fill="#cfd4db" fontSize={12} formatter={(v: number) => `${v}%`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Blind-spot frames by fog level" subtitle="Frames in which nothing was detected" />
          <div className="h-64 p-4" role="img" aria-label={`Blind-spot frames: ${data.map((r) => `${r.label} ${r.blind_spot_frames}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 18, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} />
                <Tooltip cursor={{ fill: "#ffffff0d" }} content={<ChartTip unit=" frames" />} />
                <Bar dataKey="blind_spot_frames" name="Blind-spot frames" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {data.map((r) => <Cell key={r.label} fill={r.fill} />)}
                  <LabelList dataKey="blind_spot_frames" position="top" fill="#cfd4db" fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Average detection confidence" subtitle="Mean YOLO confidence over all valid boxes" />
          <div className="h-56 p-4" role="img" aria-label={`Average confidence: ${data.map((r) => `${r.label} ${r.avg_confidence}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 18, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis domain={[0, 1]} {...AXIS} />
                <Tooltip cursor={{ fill: "#ffffff0d" }} content={<ChartTip />} />
                <Bar dataKey="avg_confidence" name="Avg confidence" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {data.map((r) => <Cell key={r.label} fill={r.fill} />)}
                  <LabelList dataKey="avg_confidence" position="top" fill="#cfd4db" fontSize={12} formatter={(v: number) => v.toFixed(2)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Tracking performance" subtitle="ByteTrack IDs per fog level" info="Confirmed = ID lasted ≥ 8 frames. Noise/flicker = ID lasted fewer than 8 frames. Fewer noise IDs means steadier tracking, but a low count in dense fog can simply mean nothing was detected." />
          <Table caption="Tracking per fog level" head={["Condition", "Confirmed tracks", "Noise / flicker IDs"]}>
            {rows.map((r) => (
              <tr key={r.condition} className="hover:bg-ink-800/60"><Td>{r.condition ?? "Not available"}</Td><Td>{fmtInt(r.confirmed_tracks)}</Td><Td>{fmtInt(r.noise_ids)}</Td></tr>
            ))}
          </Table>
        </Card>
      </div>

      <Card>
        <CardHeader title="Full results" subtitle="Direct from fog_evaluation_summary.csv" />
        <Table caption="Fog evaluation" head={["Condition", "Fog", "Frames", "Active", "Blind-spot", "Detection rate", "Δ vs clear", "Avg confidence"]}>
          {rows.map((r) => (
            <tr key={r.condition} className="hover:bg-ink-800/60">
              <Td>{r.condition ?? "Not available"}</Td><Td>{r.fog_intensity ?? "Not available"}</Td><Td>{fmtInt(r.total_frames)}</Td><Td>{fmtInt(r.active_frames)}</Td>
              <Td>{fmtInt(r.blind_spot_frames)}</Td><Td>{fmt(r.detection_rate_pct, 1, "%")}</Td><Td>{r.detection_rate_delta_pp === null ? "baseline" : signed(r.detection_rate_delta_pp, 1, " pp")}</Td><Td>{fmt(r.avg_confidence, 2)}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <CardHeader title="What reduced visibility does to detection" />
        <div className="grid gap-4 p-4 text-sm leading-relaxed text-ink-300 md:grid-cols-3">
          <p><strong className="text-ink-100">Contrast loss.</strong> Fog washes out edges and colour. YOLO relies on both, so confidence drops first, then boxes disappear.</p>
          <p><strong className="text-ink-100">How it fell in this run.</strong> {clear && dense ? `Detection rate went from ${fmt(clear.detection_rate_pct, 1, "%")} on clear footage to ${fmt(dense.detection_rate_pct, 1, "%")} at ${dense.fog_intensity ?? "the densest level"}. See the table for the steps in between.` : "Compare the rows in the table above."}</p>
          <p><strong className="text-ink-100">Limits of this test.</strong> One 240-frame clip, synthetic fog, no ground-truth labels. Treat it as a controlled demonstration, not a field result.</p>
        </div>
      </Card>
    </div>
  );
}
