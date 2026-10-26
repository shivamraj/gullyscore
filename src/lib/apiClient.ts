// Browser helpers for calling our API: new ids, and a fetch wrapper.
// Who is calling is decided by the umpire's login cookie, which the browser sends by itself.

/**
 * A random UUID v4. crypto.randomUUID() only exists on https or localhost, so phones opening the
 * dev server over Wi-Fi (http://192.168.x.x) fall back to crypto.getRandomValues, which works everywhere.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // not a secure context; fall through
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Calls one of our API routes and throws the API's own error message on failure.
 * If the umpire's login has run out (401), opens the login page and comes back here after.
 */
export async function api<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? "GET",
      headers: { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error("Can't reach the server. Check your internet connection.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data as T;
}
