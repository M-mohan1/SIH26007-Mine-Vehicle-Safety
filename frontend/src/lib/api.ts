import { useCallback, useEffect, useState } from "react";

/** Base URL of the FastAPI backend. Empty string = same origin (Vite proxies /api in dev). */
export const API_BASE: string = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export const apiUrl = (path: string) => `${API_BASE}${path}`;

export class ApiError extends Error {
  constructor(message: string, readonly kind: "network" | "http" | "parse", readonly httpStatus?: number) {
    super(message);
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { signal, headers: { Accept: "application/json" } });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(`Cannot reach the API at ${API_BASE || window.location.origin}.`, "network");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* non-JSON error body */ }
    throw new ApiError(`API returned ${res.status}: ${detail}`, "http", res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("The API returned a response that is not valid JSON.", "parse");
  }
}

export interface ApiState<T> { data: T | null; error: ApiError | null; loading: boolean; reload: () => void }

export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) { setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    apiGet<T>(path, ctrl.signal)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof ApiError ? e : new ApiError(String(e), "network"));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
