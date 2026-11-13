import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RiskStatus } from "./types";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

export const NA = "Not available";

export function fmt(v: number | null | undefined, digits = 0, unit = ""): string {
  if (v === null || v === undefined || Number.isNaN(v)) return NA;
  return `${v.toFixed(digits)}${unit}`;
}
export const fmtInt = (v: number | null | undefined) => (v === null || v === undefined ? NA : v.toLocaleString("en-US"));
export function fmtBytes(b: number | null | undefined): string {
  if (b === null || b === undefined) return NA;
  return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}
export function fmtTime(s: number | null | undefined): string {
  if (s === null || s === undefined) return NA;
  return `${s.toFixed(2)} s`;
}
export function signed(v: number | null | undefined, digits = 1, unit = ""): string {
  if (v === null || v === undefined) return NA;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}${unit}`;
}

export const STATUS_COLOR: Record<RiskStatus, string> = {
  SAFE: "#3ecf8e", WARNING: "#f6b93b", DANGER: "#f0524f",
};
export const STATUS_ORDER: RiskStatus[] = ["SAFE", "WARNING", "DANGER"];
export const titleCase = (s: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : NA);
