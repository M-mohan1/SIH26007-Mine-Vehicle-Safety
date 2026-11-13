import type { ReactNode } from "react";

// Shared chart styling so every Recharts chart looks the same.
export const AXIS = { stroke: "#3a4049", tick: { fill: "#8a929d", fontSize: 12 } } as const;
export const GRID = { stroke: "#2a2f36", strokeDasharray: "3 3", vertical: false } as const;
export const BRAND = "#f2801f";
export const NEUTRAL = "#8a929d";
// Fog ramp: one hue (brand orange), light -> dark = clear -> dense.
export const FOG_RAMP = ["#59606a", "#c9772f", "#f2801f", "#ffb36b"];

interface TipEntry { name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }
export function ChartTip({ active, payload, label, unit = "", labelFormatter, extra }: {
  active?: boolean; payload?: TipEntry[]; label?: string | number; unit?: string;
  labelFormatter?: (l: string | number) => string; extra?: (p: Record<string, unknown>) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <div className="mb-1 font-semibold text-ink-100">{labelFormatter ? labelFormatter(label) : label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-ink-200">
          <span className="inline-block size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span className="text-ink-400">{p.name}</span>
          <span className="tabular ml-auto pl-3 font-medium">{p.value ?? "Not available"}{p.value !== undefined && p.value !== null ? unit : ""}</span>
        </div>
      ))}
      {extra && payload[0]?.payload && <div className="mt-1 border-t border-ink-700 pt-1 text-ink-400">{extra(payload[0].payload)}</div>}
    </div>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-300">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.dashed ? "transparent" : i.color, borderTop: i.dashed ? `2px dashed ${i.color}` : undefined }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
