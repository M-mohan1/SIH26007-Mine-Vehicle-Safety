import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CheckCircle2, CircleSlash, FileWarning } from "lucide-react";
import { useApi } from "../lib/api";
import type { OverviewResponse, RiskStatus } from "../lib/types";
import { STATUS_COLOR, STATUS_ORDER, fmtInt, fmt } from "../lib/utils";
import { AsyncView, Card, CardHeader, MetricCard, PageHeader, RecordedBanner, StatusBadge, StatusDot } from "../components/ui";
import { ChartTip } from "../components/charts";
import { EventsTable, VehicleTable } from "../components/tables";
import { Link } from "../lib/router";

export default function Overview() {
  const state = useApi<OverviewResponse>("/api/overview");
  return (
    <>
      <PageHeader title="Command center" description="Summary of the recorded risk-detection run: which vehicles were tracked, how risk was classified, and whether the data pipeline is intact." />
      <AsyncView state={state} emptyTitle="No risk results to summarise"
        emptyHint={<>Generate them with <code className="font-mono text-ink-200">python src/risk/risk_demo.py</code>.</>}>
        {(d) => <Body d={d} />}
      </AsyncView>
    </>
  );
}

function Body({ d }: { d: OverviewResponse }) {
  const dist = d.distribution!;
  const tr = d.tracks!;
  const byClass = Object.entries(tr.by_class).map(([k, v]) => `${v} ${k}${v > 1 ? "s" : ""}`).join(" · ");
  const total = dist.observations.total;
  const pie = STATUS_ORDER.map((s) => ({ name: s, value: dist.observations[s] }));

  return (
    <div className="space-y-4">
      <RecordedBanner>
        <strong className="font-semibold text-ink-100">Recorded experiment data.</strong> {d.mode_note}
      </RecordedBanner>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Tracked vehicle IDs" value={tr.total} hint={`${byClass} · ${tr.confirmed} confirmed (≥${tr.min_confirm_frames} frames)`}
          info="Counts ByteTrack IDs, not physical vehicles. The source clip is a compilation with scene cuts, so the same vehicle may receive a new ID after a cut." />
        <MetricCard label="Peak risk in run" value={d.peak_status ? <StatusBadge status={d.peak_status} /> : "Not available"} accent={d.peak_status ?? undefined}
          hint="Highest status any tracked vehicle reached" />
        <MetricCard label="Risk events" value={fmtInt(d.event_count)} hint="Consecutive WARNING / DANGER runs per track"
          info="An event is an unbroken run of frames in which one track stayed at the same non-SAFE status." />
        <MetricCard label="Frames with a vehicle" value={<>{dist.frames.with_vehicle}<span className="text-base text-ink-400"> / {dist.frames.total ?? "?"}</span></>}
          hint={dist.frames.no_vehicle !== null ? `${dist.frames.no_vehicle} frames had no valid vehicle detection` : undefined}
          info="Frames in which at least one valid (non-full-width) vehicle box was tracked. The rest are blind-spot frames." />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Risk distribution" subtitle="Per-vehicle observations across the recorded run" info="Each vehicle in each frame is one observation, classified SAFE, WARNING or DANGER by the bounding-box growth rule." />
          <div className="grid items-center gap-2 p-4 sm:grid-cols-2">
            <div className="relative h-52" role="img" aria-label={`Observations: ${pie.map((p) => `${p.name} ${p.value}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={2} stroke="#1a1d22" strokeWidth={2}>
                    {pie.map((p) => <Cell key={p.name} fill={STATUS_COLOR[p.name as RiskStatus]} />)}
                  </Pie>
                  <Tooltip content={<ChartTip unit=" observations" />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div><div className="tabular text-2xl font-semibold">{total}</div><div className="text-xs text-ink-400">observations</div></div>
              </div>
            </div>
            <ul className="space-y-2">
              {STATUS_ORDER.map((s) => (
                <li key={s} className="flex items-center justify-between rounded-md border border-ink-700 bg-ink-900/50 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm"><StatusDot status={s} />{s}</span>
                  <span className="tabular text-sm text-ink-200">{dist.observations[s]} <span className="text-ink-400">({total ? ((dist.observations[s] / total) * 100).toFixed(1) : "0"}%)</span></span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="System health" subtitle="Data pipeline artifacts this dashboard reads" />
          <ul className="divide-y divide-ink-700/60 text-sm">
            {d.health.csv_files.map((c) => <HealthRow key={c.id} ok={c.state === "ok"} name={c.file} detail={c.state === "ok" ? `${c.rows} rows` : c.message ?? c.state} />)}
            {d.health.videos.map((v) => <HealthRow key={v.id} ok={v.available} name={v.file} detail={v.available ? "available" : "missing"} />)}
          </ul>
          <p className="border-t border-ink-700 px-4 py-2.5 text-xs text-ink-400">No inference runs in the browser or the API. Results are read from files produced by the original Python pipeline.</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Monitoring status" />
        <div className="grid gap-4 p-4 text-sm leading-relaxed text-ink-300 md:grid-cols-3">
          <p><strong className="text-ink-100">What is monitored.</strong> Cars and trucks found by YOLO11n, followed frame to frame by ByteTrack.</p>
          <p><strong className="text-ink-100">How risk is set.</strong> A vehicle turns WARNING when its box widens by more than 25 px over a 5-frame window, and DANGER above 50 px. Distance and proxy TTC are shown for context and do not change the status.</p>
          <p><strong className="text-ink-100">What this is not.</strong> A calibrated safety system. Distances come from an uncalibrated pinhole assumption and the footage is synthetic fog over a clear clip.</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Recent risk events" subtitle="Latest WARNING / DANGER runs by start frame"
          action={<Link to="/risk-analytics" className="text-xs font-medium text-brand-400 hover:text-brand-500">All events</Link>} />
        {d.recent_events.length ? <EventsTable events={d.recent_events} />
          : <p className="flex items-center gap-2 px-4 py-6 text-sm text-ink-300"><CircleSlash size={16} aria-hidden />No WARNING or DANGER events in this run.</p>}
      </Card>

      <Card>
        <CardHeader title="Vehicle tracking summary" subtitle="One row per ByteTrack ID" action={<span className="text-xs text-ink-400">Avg. confidence mean {fmt(avg(d.vehicles?.map((v) => v.avg_confidence)), 2)}</span>} />
        {d.vehicles && <VehicleTable vehicles={d.vehicles} />}
      </Card>
    </div>
  );
}

function avg(xs?: (number | null)[]) {
  const v = (xs ?? []).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function HealthRow({ ok, name, detail }: { ok: boolean; name: string; detail: string }) {
  return (
    <li className="flex items-center gap-2.5 px-4 py-2">
      {ok ? <CheckCircle2 size={15} className="shrink-0 text-safe" aria-label="OK" /> : <FileWarning size={15} className="shrink-0 text-warn" aria-label="Problem" />}
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-200" title={name}>{name}</span>
      <span className="shrink-0 text-xs text-ink-400">{detail}</span>
    </li>
  );
}
