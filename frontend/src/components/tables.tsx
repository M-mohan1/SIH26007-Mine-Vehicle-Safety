import type { RiskEvent, VehicleSummary } from "../lib/types";
import { fmt, fmtInt, titleCase } from "../lib/utils";
import { StatusBadge, Table, Td } from "./ui";

export function EventsTable({ events }: { events: RiskEvent[] }) {
  return (
    <Table caption="Risk events" head={["Event", "Track", "Class", "Status", "Frames", "Time", "Peak growth", "Min distance", "Min proxy TTC"]}>
      {events.map((e) => (
        <tr key={e.id} className="transition-colors hover:bg-ink-800/60">
          <Td className="font-mono text-xs text-ink-400">{e.id}</Td>
          <Td>#{e.track_id}</Td>
          <Td>{titleCase(e.class_name)}</Td>
          <Td><StatusBadge status={e.status} size="sm" /></Td>
          <Td>{e.start_frame}–{e.end_frame} <span className="text-ink-400">({e.frames})</span></Td>
          <Td>{e.start_time_s === null ? "Not available" : `${e.start_time_s.toFixed(2)}–${e.end_time_s?.toFixed(2)} s`}</Td>
          <Td>{fmt(e.peak_growth_px, 1, " px")}</Td>
          <Td>{fmt(e.min_est_distance_m, 1, " m")}</Td>
          <Td>{fmt(e.min_proxy_ttc_s, 1, " s")}</Td>
        </tr>
      ))}
    </Table>
  );
}

export function VehicleTable({ vehicles }: { vehicles: VehicleSummary[] }) {
  return (
    <Table caption="Per-track summary" head={["Track", "Class", "Frames seen", "Range", "Peak status", "SAFE / WARN / DANGER frames", "Max growth", "Min distance", "Min proxy TTC", "Avg conf."]}>
      {vehicles.map((v) => (
        <tr key={v.track_id} className="transition-colors hover:bg-ink-800/60">
          <Td className="font-semibold">#{v.track_id}</Td>
          <Td>{titleCase(v.class_name)}{v.class_switches > 0 && <span className="ml-1 text-xs text-warn" title="The detector changed this track's class label, which changes the assumed vehicle width and makes distance and TTC jump.">{v.class_switches} label switch{v.class_switches > 1 ? "es" : ""}</span>}</Td>
          <Td>{fmtInt(v.frames_seen)}{!v.confirmed && <span className="ml-1 text-xs text-warn">unconfirmed</span>}</Td>
          <Td>{v.first_frame}–{v.last_frame}</Td>
          <Td><StatusBadge status={v.peak_status} size="sm" /></Td>
          <Td>{v.status_frames.SAFE} / {v.status_frames.WARNING} / {v.status_frames.DANGER}</Td>
          <Td>{fmt(v.max_growth_px, 1, " px")}</Td>
          <Td>{fmt(v.min_est_distance_m, 1, " m")}</Td>
          <Td>{fmt(v.min_proxy_ttc_s, 1, " s")}</Td>
          <Td>{fmt(v.avg_confidence, 2)}</Td>
        </tr>
      ))}
    </Table>
  );
}
