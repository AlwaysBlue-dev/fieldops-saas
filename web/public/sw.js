/* FieldKeel — install shell only.
 * Does NOT cache authenticated API responses, app HTML, or tenant business data.
 * Navigation failures fall back to /offline.html (static message only).
 */
const SHELL = "fieldops-shell-v2";
const PRECACHE = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function shouldBypass(url) {
  if (url.origin !== self.location.origin) return true;
  // Never touch API, auth, or any authenticated Nest proxy paths.
  if (url.pathname.startsWith("/api")) return true;
  // Do not cache Next data / RSC / app documents — network only.
  if (url.pathname.startsWith("/_next/data")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (shouldBypass(url)) return;

  // Navigations: network-first; offline → static offline page (no stale jobs/data).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/offline.html");
        return cached || Response.error();
      }),
    );
    return;
  }

  // Precached icons / offline shell only — never put arbitrary responses in cache.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response.ok) return response;
          const copy = response.clone();
          void caches.open(SHELL).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
  }
});
