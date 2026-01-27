/* BTP Connect PWA Service Worker (offline-control)
   - Cache statique uniquement (UI/assets)
   - Network-only pour /api et ressources cross-origin
*/
const CACHE_VERSION = "v3";
const CACHE_NAME = `btpconnect-static-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/sw.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isApiRequest(url) {
  // match /api/* on same origin
  return url.origin === self.location.origin && url.pathname.startsWith("/api");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never cache API or cross-origin requests
  if (isApiRequest(url) || url.origin !== self.location.origin) {
    // Network-only; allow normal browser handling (no respondWith) for simplicity
    return;
  }

  // Navigation: try network first, fallback to cached shell or offline page
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Optionally update cached "/" with latest shell
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(req)) || (await cache.match("/offline.html"));
        })
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Cache only successful basic responses
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          // If something static fails, show offline page as a last resort
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match("/offline.html")) || new Response("Offline", { status: 503 });
        });
    })
  );
});
