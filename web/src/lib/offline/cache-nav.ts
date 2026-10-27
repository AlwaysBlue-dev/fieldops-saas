/**
 * Explicitly cache App Router documents so DevTools Offline / hard reload
 * can reopen My Day and prepared job pages. Soft client navigations never
 * hit the service worker's navigate handler, so visiting My Day online alone
 * often leaves the document uncached.
 */
const NAV_CACHE = "fieldops-nav-v1";

export async function cacheOfflineNavDocument(pathname: string) {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  try {
    const absolute = new URL(path, window.location.origin).toString();
    const response = await fetch(absolute, {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    });
    if (!response.ok) return;
    const cache = await caches.open(NAV_CACHE);
    const clone = response.clone();
    await Promise.all([
      cache.put(absolute, response),
      cache.put(path, clone),
    ]);
  } catch {
    // Offline or blocked — ignore; IDB still holds payloads.
  }
}

export async function cachePreparedJobDocuments(
  orgSlug: string,
  jobIds: string[],
) {
  await cacheOfflineNavDocument(`/app/${orgSlug}/my-day`);
  await cacheOfflineNavDocument(`/app/${orgSlug}`);
  for (const jobId of jobIds) {
    await cacheOfflineNavDocument(`/app/${orgSlug}/jobs/${jobId}`);
  }
}

/** Soft App Router navigations fail offline; force a full document load. */
export function navigateFieldOfflineCapable(href: string) {
  if (typeof window === "undefined") return false;
  if (navigator.onLine) return false;
  const path = href.split("?")[0] ?? href;
  const offlineCapable =
    /\/app\/[^/]+\/my-day\/?$/.test(path) ||
    /\/app\/[^/]+\/jobs\/[^/]+\/?$/.test(path) ||
    /\/app\/[^/]+\/?$/.test(path);
  if (!offlineCapable) return false;
  window.location.assign(href);
  return true;
}
