/**
 * Reachability for offline UI / sync.
 * Do not trust navigator.onLine alone — DevTools and some networks leave it
 * true while fetches fail (or false while the API is reachable).
 */

type Listener = (online: boolean) => void;

const listeners = new Set<Listener>();
let currentOnline: boolean | null = null;
let probing = false;
let stopPolling: (() => void) | null = null;

function apiBase() {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(
    /\/+$/,
    "",
  );
}

function publish(next: boolean) {
  if (currentOnline === next) return;
  currentOnline = next;
  for (const listener of listeners) listener(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fieldops:connectivity", { detail: { online: next } }),
    );
  }
}

export function getOnlineSnapshot() {
  if (typeof navigator === "undefined") return true;
  if (currentOnline != null) return currentOnline;
  return navigator.onLine;
}

/** True only when the API answered (any HTTP status). Cached SW docs do not count. */
export async function probeOnline(timeoutMs = 2500): Promise<boolean> {
  if (typeof window === "undefined") return true;
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}/health`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
      headers: { "X-FieldOps-Requested-With": "web" },
    });
    return typeof res.status === "number" && res.status > 0;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Probe once and publish the result (used before hard navigations). */
export async function confirmOnline(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    publish(false);
    return false;
  }
  const ok = await probeOnline();
  publish(ok);
  return ok;
}

function ensurePolling() {
  if (typeof window === "undefined" || stopPolling) return;

  const run = () => {
    void (async () => {
      if (probing) return;
      probing = true;
      try {
        if (!navigator.onLine) {
          publish(false);
          return;
        }
        publish(await probeOnline());
      } finally {
        probing = false;
      }
    })();
  };

  const onOffline = () => publish(false);
  const onOnline = () => run();
  const onVisible = () => {
    if (document.visibilityState === "visible") run();
  };

  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(run, 3000);
  run();

  stopPolling = () => {
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", run);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
    stopPolling = null;
  };
}

export function subscribeConnectivity(listener: Listener) {
  listeners.add(listener);
  listener(getOnlineSnapshot());
  ensurePolling();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopPolling?.();
  };
}
