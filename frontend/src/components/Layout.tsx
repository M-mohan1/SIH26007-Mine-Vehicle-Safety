import { ReactNode, useEffect, useState } from "react";
import { Activity, BarChart3, Boxes, Eye, Gauge, Info, LayoutDashboard, Menu, ScanEye, TriangleAlert, X } from "lucide-react";
import { Link, usePath } from "../lib/router";
import { API_BASE, useApi } from "../lib/api";
import type { HealthResponse } from "../lib/types";
import { cn } from "../lib/utils";

export const NAV = [
  { to: "/", label: "Overview", Icon: LayoutDashboard },
  { to: "/monitor", label: "Safety Monitor", Icon: ScanEye },
  { to: "/fog-benchmark", label: "Fog Benchmark", Icon: BarChart3 },
  { to: "/recovery", label: "Visibility Recovery", Icon: Eye },
  { to: "/risk-analytics", label: "Risk Analytics", Icon: TriangleAlert },
  { to: "/architecture", label: "System Architecture", Icon: Boxes },
  { to: "/about", label: "About the Project", Icon: Info },
] as const;

function ApiIndicator() {
  const { data, error, loading } = useApi<HealthResponse>("/api/health");
  const state = loading ? "checking" : error ? "offline" : data?.status === "ok" ? "ok" : "degraded";
  const map = {
    checking: ["bg-ink-500", "Checking API…"],
    offline: ["bg-danger", "API offline"],
    degraded: ["bg-warn", "API online · some data missing"],
    ok: ["bg-safe", "API online"],
  } as const;
  return (
    <div className="flex items-center gap-2 text-xs text-ink-300" title={API_BASE || "Same origin (dev proxy)"}>
      <span className={cn("size-2 rounded-full", map[state][0])} aria-hidden />
      {map[state][1]}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const path = usePath();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const current = NAV.find((n) => n.to === path);

  const nav = (
    <nav aria-label="Primary" className="flex flex-col gap-0.5 p-3">
      {NAV.map(({ to, label, Icon }) => (
        <Link key={to} to={to}
          className={(active) => cn(
            "flex items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm transition-colors",
            active ? "border-brand-500 bg-ink-800 text-ink-100" : "border-transparent text-ink-300 hover:bg-ink-850 hover:text-ink-100")}>
          <Icon size={17} aria-hidden className={path === to ? "text-brand-400" : ""} />
          {label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900 md:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="border-t border-ink-700 p-4 text-[11px] leading-relaxed text-ink-400">
          SIH26007 · Open-cast iron ore mine safety. Prototype built on recorded demo data.
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/60" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-ink-900 shadow-xl"><Brand />{nav}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-700 bg-ink-900/95 px-4 backdrop-blur-sm lg:px-6">
          <button className="rounded p-1.5 text-ink-300 hover:bg-ink-800 md:hidden" aria-label="Open navigation" onClick={() => setOpen(!open)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-ink-200">{current?.label ?? "Not found"}</div>
          <span className="hidden items-center gap-1.5 rounded border border-brand-500/40 bg-brand-500/10 px-2 py-1 text-[11px] font-medium text-brand-400 sm:inline-flex">
            <Activity size={12} aria-hidden /> Recorded data · not live
          </span>
          <ApiIndicator />
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2.5 border-b border-ink-700 px-4">
      <span className="grid size-8 place-items-center rounded-md bg-brand-500/15 text-brand-400"><Gauge size={18} aria-hidden /></span>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-ink-100">Mine Vehicle Safety</div>
        <div className="text-[11px] text-ink-400">Low-visibility monitor</div>
      </div>
    </div>
  );
}
