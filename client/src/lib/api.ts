// Small fetch wrapper. Every request sends the CSRF header the API requires and the
// httpOnly auth cookie (same-origin). Errors come back as ApiError with field messages.

export class ApiError extends Error {
  status: number;
  code?: string;
  fields: Record<string, string>;
  details?: Record<string, unknown>;

  constructor(status: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.fields = (details?.fields as Record<string, string>) ?? {};
  }
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
export const apiUrl = (path: string) => `${BASE}/api${path}`;

type Query = Record<string, string | number | boolean | undefined | null>;

export function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; query?: Query; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "SmartPantry" };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(withQuery(path, opts.query)), { method: opts.method ?? "GET", headers, body, credentials: "include" });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.", "NETWORK");
  }

  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const err = data?.error;
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("sp:unauthorized"));
    throw new ApiError(res.status, err?.message ?? `Request failed (${res.status})`, err?.code, err?.details);
  }
  return data as T;
}

export const get = <T>(path: string, query?: Query) => api<T>(path, { query });
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body ?? {} });
export const patch = <T>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body });
export const del = <T>(path: string, query?: Query) => api<T>(path, { method: "DELETE", query });

/** Plain-language message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
