// GullyScore service worker (PLT-06). Registered from src/app/layout.tsx in production only.
//
// What it does:
// - App files (/_next/static, fonts, icons) are cached the first time they load, so the app
//   opens fast and works on a weak connection.
// - Pages are always fetched fresh when online. If the phone is offline, the last copy of that
//   page is shown, or a small "You're offline" page.
// - It NEVER caches /api (scores must be live) or the scorer screen (/score/…, which has the
//   secret link and keeps its own offline queue), and never touches Supabase requests.
//
// To force every phone to pick up a new version, change VERSION.

const VERSION = "v1";
const STATIC_CACHE = `gullyscore-static-${VERSION}`;
const PAGE_CACHE = `gullyscore-pages-${VERSION}`;
const MAX_PAGES = 30;

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · GullyScore</title><style>
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#0b1210;color:#eef3ef;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:22px;margin:0 0 8px}p{color:#a3b1a8;margin:0 0 20px}button{font:inherit;font-weight:700;background:#2fbf71;color:#06140d;border:0;border-radius:12px;padding:12px 20px}
</style></head><body><main><h1>You're offline</h1><p>Connect to the internet to see the live score.</p>
<button onclick="location.reload()">Try again</button></main></body></html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [STATIC_CACHE, PAGE_CACHE];
      for (const name of await caches.keys()) if (!keep.includes(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

function isStatic(url) {
  return url.pathname.startsWith("/_next/static/") || /\.(?:png|svg|ico|woff2?)$/.test(url.pathname);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function trimPages(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(key);
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.delete(request); // re-add at the end so the oldest pages are trimmed first
      await cache.put(request, response.clone());
      void trimPages(cache);
    }
    return response;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: false });
    return hit ?? new Response(OFFLINE_HTML, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, Gemini: leave alone
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/score/")) return;

  if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  }
});
