import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "../lib/api";
import type { RiskEventsResponse, RiskStatus, TelemetryResponse } from "../lib/types";
import { STATUS_COLOR, STATUS_ORDER, cn } from "../lib/utils";
import { AsyncView, Card, CardHeader, EmptyState, PageHeader, RecordedBanner, StatusBadge } from "../components/ui";
import { AXIS, ChartLegend, ChartTip, GRID } from "../components/charts";
import { EventsTable, VehicleTable } from "../components/tables";

const TRACK_COLORS = ["#5aa9e6", "#b69cf5", "#f2801f", "#d4d9e0", "#2dd4bf", "#f472b6"];

export default function RiskAnalytics() {
  const ev = useApi<RiskEventsResponse>("/api/risk-events");
  const tel = useApi<TelemetryResponse>("/api/telemetry");
  return (
    <>
      <PageHeader title="Risk analytics" description="How risk was classified across the recorded run: distribution, timeline, individual events and per-vehicle results." />
      <AsyncView state={ev} emptyTitle="No risk results to analyse"
        emptyHint={<>Generate them with <code className="font-mono text-ink-200">python src/risk/risk_demo.py</code>.</>}>
        {(d) => <Body d={d} tel={tel.data} />}
      </AsyncView>
    </>
  );
}

function Body({ d, tel }: { d: RiskEventsResponse; tel: TelemetryResponse | null }) {
  const [filter, setFilter] = useState<"ALL" | RiskStatus>("ALL");
  const dist = d.distribution!;
  const obsData = STATUS_ORDER.map((s) => ({ status: s, count: dist.observations[s] }));
  const frameData: { status: string; count: number }[] = STATUS_ORDER.map((s) => ({ status: s, count: dist.frames[s] }));
  if (dist.frames.no_vehicle !== null) frameData.push({ status: "NO VEHICLE", count: dist.frames.no_vehicle });
  const events = filter === "ALL" ? d.events : d.events.filter((e) => e.status === filter);

  const obs = tel?.observations ?? [];
  const trackIds = useMemo(() => [...new Set(obs.map((o) => o.track_id))].sort((a, b) => a - b), [obs]);
  const series = useMemo(() => {
    const byFrame = new Map<number, Record<string, number | null>>();
    const maxF = tel?.total_frames ?? Math.max(0, ...obs.map((o) => o.frame));
    for (let f = 1; f <= maxF; f++) byFrame.set(f, { frame: f });
    for (const o of obs) {
      const row = byFrame.get(o.frame);
      if (row) { row[`g${o.track_id}`] = o.growth_px; row[`d${o.track_id}`] = o.est_distance_m; }
    }
    return [...byFrame.values()];
  }, [obs, tel?.total_frames]);
  const cls = d.classification;
  const colorOf = (id: number) => TRACK_COLORS[trackIds.indexOf(id) % TRACK_COLORS.length];

  return (
    <div className="space-y-4">
      <RecordedBanner><strong className="font-semibold text-ink-100">Recorded experiment data.</strong> Derived from <code className="font-mono text-xs">risk_results.csv</code>. Frame numbers match the annotated demo video.</RecordedBanner>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Vehicle observations by status" subtitle="Each vehicle in each frame counts once" />
          <StatusBars data={obsData} />
        </Card>
        <Card>
          <CardHeader title="Frames by worst status" subtitle="Each frame takes the highest status among its vehicles" info="Frames without any valid vehicle detection are shown separately." />
          <StatusBars data={frameData} />
        </Card>
      </div>

      <Card>
        <CardHeader title="Risk signal over time" subtitle="Bounding-box width growth over a 5-frame window, per tracked vehicle"
          info="The risk status is decided only by this signal. WARNING above the amber line, DANGER above the red line." />
        <div className="space-y-2 p-4">
          {tel && tel.status !== "missing" && obs.length ? (
            <>
              <ChartLegend items={[
                ...trackIds.map((id) => ({ label: `Track #${id}`, color: colorOf(id) })),
                { label: `WARNING above ${cls?.warning_above_px ?? 25} px`, color: STATUS_COLOR.WARNING, dashed: true },
                { label: `DANGER above ${cls?.danger_above_px ?? 50} px`, color: STATUS_COLOR.DANGER, dashed: true },
              ]} />
              <div className="h-72" role="img" aria-label="Line chart of bounding-box width growth per track against frame number">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 12, left: -4, bottom: 16 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="frame" type="number" domain={[1, "dataMax"]} {...AXIS} label={{ value: "Frame", position: "insideBottom", offset: -10, fill: "#8a929d", fontSize: 12 }} />
                    <YAxis {...AXIS} unit=" px" />
                    <Tooltip content={<ChartTip labelFormatter={(l) => `Frame ${l}`} unit=" px" />} />
                    <ReferenceLine y={cls?.warning_above_px ?? 25} stroke={STATUS_COLOR.WARNING} strokeDasharray="5 4" />
                    <ReferenceLine y={cls?.danger_above_px ?? 50} stroke={STATUS_COLOR.DANGER} strokeDasharray="5 4" />
                    {trackIds.map((id) => <Line key={id} type="monotone" dataKey={`g${id}`} name={`Track #${id}`} stroke={colorOf(id)} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : <EmptyState title="Timeline unavailable" message={tel?.message ?? "Telemetry could not be loaded."} />}
        </div>
      </Card>

      {obs.length > 0 && (
        <Card>
          <CardHeader title="Estimated distance over time" subtitle="Pinhole estimate, per tracked vehicle" info="Estimated from box width and an assumed real vehicle width per class. When the detector flips a track between car and truck the estimate jumps, because the assumed width changes." />
          <div className="space-y-2 p-4">
            <ChartLegend items={trackIds.map((id) => ({ label: `Track #${id}`, color: colorOf(id) }))} />
            <div className="h-60" role="img" aria-label="Line chart of estimated distance per track against frame number">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 12, left: -4, bottom: 16 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="frame" type="number" domain={[1, "dataMax"]} {...AXIS} label={{ value: "Frame", position: "insideBottom", offset: -10, fill: "#8a929d", fontSize: 12 }} />
                  <YAxis {...AXIS} unit=" m" />
                  <Tooltip content={<ChartTip labelFormatter={(l) => `Frame ${l}`} unit=" m" />} />
                  {trackIds.map((id) => <Line key={id} type="monotone" dataKey={`d${id}`} name={`Track #${id}`} stroke={colorOf(id)} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Risk event timeline" subtitle={`${d.event_count ?? 0} runs of consecutive WARNING or DANGER frames`}
          action={
            <div role="group" aria-label="Filter events by status" className="flex rounded-md border border-ink-600 p-0.5 text-xs">
              {(["ALL", "WARNING", "DANGER"] as const).map((k) => (
                <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}
                  className={cn("rounded px-2.5 py-1 transition-colors", filter === k ? "bg-brand-500 font-semibold text-ink-950" : "text-ink-300 hover:text-ink-100")}>{k === "ALL" ? "All" : k[0] + k.slice(1).toLowerCase()}</button>
              ))}
            </div>
          } />
        {events.length ? <EventsTable events={events} /> : <p className="px-4 py-8 text-center text-sm text-ink-300">No {filter === "ALL" ? "" : filter.toLowerCase() + " "}events in this run.</p>}
        <p className="border-t border-ink-700 px-4 py-2.5 text-xs text-ink-400">A proxy TTC near 0.1 s usually reflects a jump in estimated distance (for example a car/truck label switch), not a measured near-collision.</p>
      </Card>

      <Card>
        <CardHeader title="Vehicle-wise summary" subtitle={`Tracks seen ≥ ${d.min_confirm_frames ?? 8} frames count as confirmed`} />
        <VehicleTable vehicles={d.vehicles} />
      </Card>

      <Card>
        <CardHeader title="How risk is classified" />
        <div className="grid gap-4 p-4 text-sm leading-relaxed text-ink-300 md:grid-cols-2">
          <div>
            <p>{cls?.rule ?? "Bounding-box width growth over a short rolling window."}</p>
            <ul className="mt-3 space-y-2">
              <li className="flex items-center gap-2"><StatusBadge status="SAFE" size="sm" /> growth up to {cls?.warning_above_px ?? 25} px</li>
              <li className="flex items-center gap-2"><StatusBadge status="WARNING" size="sm" /> growth above {cls?.warning_above_px ?? 25} px</li>
              <li className="flex items-center gap-2"><StatusBadge status="DANGER" size="sm" /> growth above {cls?.danger_above_px ?? 50} px</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p>A box that keeps widening means the vehicle is getting closer in the image. It is a 2D visual heuristic, not a physical collision model.</p>
            <p>Boxes that are almost as wide as the frame (85% or more) are rejected as false detections such as the cabin hood.</p>
            <p>Estimated distance and proxy TTC are reported alongside but {cls?.ttc_used_for_classification === false ? "do not affect the status" : "may affect the status"}.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function StatusBars({ data }: { data: { status: string; count: number }[] }) {
  return (
    <div className="h-56 p-4" role="img" aria-label={data.map((d) => `${d.status} ${d.count}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="status" {...AXIS} />
          <YAxis allowDecimals={false} {...AXIS} />
          <Tooltip cursor={{ fill: "#ffffff0d" }} content={<ChartTip />} />
          <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]} maxBarSize={64}>
            {data.map((r) => <Cell key={r.status} fill={STATUS_COLOR[r.status as RiskStatus] ?? "#596069"} />)}
            <LabelList dataKey="count" position="top" fill="#cfd4db" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
