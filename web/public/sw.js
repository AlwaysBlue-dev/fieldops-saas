/* FieldKeel — install shell + field navigation cache.
 * Caches allowlisted app documents after a successful visit so the installed
 * PWA can reopen My Day / prepared job detail offline. Job payloads stay in
 * IndexedDB (never in this SW). Does NOT cache /api or auth responses.
 */
const SHELL = "fieldops-shell-v6";
const NAV = "fieldops-nav-v1";
const PRECACHE = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
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
  const keep = new Set([SHELL, NAV]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function shouldBypass(url) {
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/api")) return true;
  if (url.pathname.startsWith("/_next/data")) return true;
  return false;
}

/** Field routes that may reopen from a previously visited document + IndexedDB. */
function isOfflineCapableNav(pathname) {
  if (pathname === "/app" || pathname === "/app/") return true;
  // /app/{slug}/my-day
  if (/^\/app\/[^/]+\/my-day\/?$/.test(pathname)) return true;
  // /app/{slug}/jobs/{jobId} (prepared job detail only — still needs IDB payload)
  if (/^\/app\/[^/]+\/jobs\/[^/]+\/?$/.test(pathname)) return true;
  // Workspace home often redirects technicians to My Day
  if (/^\/app\/[^/]+\/?$/.test(pathname)) return true;
  return false;
}

function isSensitiveNav(pathname) {
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/signup")) return true;
  if (pathname.startsWith("/onboarding")) return true;
  if (pathname.includes("/settings")) return true;
  if (pathname.includes("/billing")) return true;
  if (pathname.startsWith("/platform")) return true;
  if (pathname.includes("/approvals")) return true;
  if (pathname.includes("/reports")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (shouldBypass(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request, url));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            void cache.put(request, response.clone());
          }
          return response;
        } catch {
          return Response.error();
        }
      }),
    );
    return;
  }

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

async function handleNavigation(request, url) {
  try {
    const response = await fetch(request);
    if (
      response.ok &&
      isOfflineCapableNav(url.pathname) &&
      !isSensitiveNav(url.pathname)
    ) {
      const cache = await caches.open(NAV);
      void cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (isOfflineCapableNav(url.pathname) && !isSensitiveNav(url.pathname)) {
      const cache = await caches.open(NAV);
      const cached =
        (await cache.match(request)) ||
        (await cache.match(url.pathname)) ||
        (await findNavFallback(cache, url.pathname));
      if (cached) return cached;
    }
    const offline = await caches.match("/offline.html");
    return offline || Response.error();
  }
}

async function findNavFallback(cache, pathname) {
  const keys = await cache.keys();
  // Prefer an exact my-day match for the same org when job detail wasn't cached.
  const myDayMatch = pathname.match(/^\/app\/([^/]+)\//);
  if (myDayMatch) {
    const slug = myDayMatch[1];
    const myDayUrl = `/app/${slug}/my-day`;
    for (const key of keys) {
      const keyUrl = new URL(key.url);
      if (keyUrl.pathname === myDayUrl || keyUrl.pathname === `${myDayUrl}/`) {
        return cache.match(key);
      }
    }
  }
  return null;
}
