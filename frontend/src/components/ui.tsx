import { ReactNode } from "react";
import { AlertTriangle, CircleCheck, DatabaseZap, Info, OctagonAlert, RefreshCw, ServerCrash, ShieldAlert } from "lucide-react";
import { cn } from "../lib/utils";
import type { ApiState } from "../lib/api";
import type { ApiStatus, RiskStatus } from "../lib/types";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-lg border border-ink-700 bg-ink-850", className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, action, info }: { title: string; subtitle?: string; action?: ReactNode; info?: string }) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-ink-700 px-4 py-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-100">
          {title}
          {info && <InfoTip text={info} />}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={text} className="rounded text-ink-500 transition-colors hover:text-brand-400 focus-visible:text-brand-400">
        <Info size={14} aria-hidden />
      </button>
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-xs font-normal leading-relaxed text-ink-200 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}

const STATUS_STYLE: Record<RiskStatus, { cls: string; Icon: typeof CircleCheck }> = {
  SAFE: { cls: "bg-safe/12 text-safe border-safe/30", Icon: CircleCheck },
  WARNING: { cls: "bg-warn/12 text-warn border-warn/30", Icon: AlertTriangle },
  DANGER: { cls: "bg-danger/12 text-danger border-danger/30", Icon: OctagonAlert },
};

export function StatusBadge({ status, size = "md" }: { status: RiskStatus; size?: "sm" | "md" }) {
  const { cls, Icon } = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border font-semibold tracking-wide", cls,
      size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs")}>
      <Icon size={size === "sm" ? 12 : 14} aria-hidden />
      {status}
    </span>
  );
}

export function StatusDot({ status }: { status: RiskStatus }) {
  const c = { SAFE: "bg-safe", WARNING: "bg-warn", DANGER: "bg-danger" }[status];
  return <span className={cn("inline-block size-2 rounded-full", c)} aria-hidden />;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "warn" }) {
  const t = { neutral: "border-ink-600 text-ink-300", brand: "border-brand-500/40 bg-brand-500/10 text-brand-400", warn: "border-warn/40 bg-warn/10 text-warn" }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium", t)}>{children}</span>;
}

export function MetricCard({ label, value, hint, info, accent }: { label: string; value: ReactNode; hint?: ReactNode; info?: string; accent?: RiskStatus }) {
  const bar = accent ? { SAFE: "bg-safe", WARNING: "bg-warn", DANGER: "bg-danger" }[accent] : "bg-brand-500";
  return (
    <div className="relative overflow-hidden rounded-lg border border-ink-700 bg-ink-850 p-4">
      <span className={cn("absolute inset-y-0 left-0 w-0.5", bar)} aria-hidden />
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-400">{label}{info && <InfoTip text={info} />}</div>
      <div className="tabular mt-1.5 text-2xl font-semibold text-ink-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-400">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("pulse-soft rounded bg-ink-700/60", className)} aria-hidden />;
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading data" className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-56" />)}
    </div>
  );
}

export function EmptyState({ title, message, hint, icon }: { title: string; message?: string | null; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-ink-600 bg-ink-850/60 px-6 py-12 text-center">
      <div className="text-ink-500">{icon ?? <DatabaseZap size={28} aria-hidden />}</div>
      <h3 className="mt-3 text-sm font-semibold text-ink-100">{title}</h3>
      {message && <p className="mt-1 max-w-md text-sm text-ink-300">{message}</p>}
      {hint && <p className="mt-2 max-w-md text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: { message: string; kind?: string }; onRetry?: () => void }) {
  const offline = error.kind === "network";
  return (
    <div role="alert" className="flex flex-col items-center rounded-lg border border-danger/30 bg-danger/5 px-6 py-12 text-center">
      {offline ? <ServerCrash size={28} className="text-danger" aria-hidden /> : <ShieldAlert size={28} className="text-danger" aria-hidden />}
      <h3 className="mt-3 text-sm font-semibold text-ink-100">{offline ? "Backend unavailable" : "Could not load data"}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-300">{error.message}</p>
      {offline && (
        <p className="mt-2 max-w-md text-xs text-ink-400">
          Start the API with <code className="font-mono text-ink-200">uvicorn backend.main:app --port 8000</code>, or check
          the <code className="font-mono text-ink-200">VITE_API_BASE_URL</code> setting.
        </p>
      )}
      {onRetry && <Button className="mt-4" onClick={onRetry}><RefreshCw size={14} aria-hidden />Retry</Button>}
    </div>
  );
}

export function Button({ className, children, variant = "secondary", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const v = {
    primary: "bg-brand-500 text-ink-950 hover:bg-brand-400",
    secondary: "border border-ink-600 bg-ink-800 text-ink-100 hover:border-ink-500 hover:bg-ink-700",
    ghost: "text-ink-300 hover:bg-ink-800 hover:text-ink-100",
  }[variant];
  return (
    <button type="button" {...rest}
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50", v, className)}>
      {children}
    </button>
  );
}

interface Envelope { status?: ApiStatus; message?: string | null; warnings?: string[] }

/** Handles loading / backend-down / empty-data for any API response, then renders children. */
export function AsyncView<T extends Envelope>({ state, children, emptyTitle, emptyHint, skeletonRows }: {
  state: ApiState<T>; children: (data: T) => ReactNode; emptyTitle: string; emptyHint?: ReactNode; skeletonRows?: number;
}) {
  const { data, error, loading, reload } = state;
  if (loading && !data) return <PageSkeleton rows={skeletonRows} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  if (data.status === "missing" || data.status === "empty" || data.status === "error") {
    return <EmptyState title={emptyTitle} message={data.message} hint={emptyHint} />;
  }
  return (
    <div className="fade-in space-y-4">
      {error && <ErrorState error={error} onRetry={reload} />}
      {data.warnings && data.warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-ink-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <span>{data.warnings.join(" ")}</span>
        </div>
      )}
      {children(data)}
    </div>
  );
}

export function RecordedBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-brand-500/30 bg-brand-500/8 px-3.5 py-2.5 text-sm text-ink-200">
      <Info size={16} className="mt-0.5 shrink-0 text-brand-400" aria-hidden />
      <div>{children ?? <><strong className="font-semibold text-ink-100">Recorded experiment data.</strong> Everything here comes from an offline run on pre-recorded, synthetic-fog footage. It is not a live mine-camera stream.</>}</div>
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold text-ink-100">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-300">{description}</p>
    </div>
  );
}

export function Table({ head, children, caption }: { head: string[]; children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-ink-700 text-xs text-ink-400">
            {head.map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="tabular divide-y divide-ink-700/60">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children: ReactNode; className?: string }) =>
  <td className={cn("whitespace-nowrap px-4 py-2 text-ink-200", className)}>{children}</td>;
