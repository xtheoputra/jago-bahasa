/* =========================================================================
   Jago Bahasa — Service Worker (offline-first app shell)
   v2: ES-module precache, /api network-only, no HTML fallback for assets.
   ========================================================================= */
const VERSION = "jb-v2.15.0";
const CACHE = `jagobahasa-${VERSION}`;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/i18n.js",
  "./js/data.js",
  /* Per-course vocabulary chunks — precached so the app stays fully offline
     even though they are only imported on demand. */
  "./js/data/ar.js",
  "./js/data/de.js",
  "./js/data/el.js",
  "./js/data/en.js",
  "./js/data/es.js",
  "./js/data/fr.js",
  "./js/data/hi.js",
  "./js/data/it.js",
  "./js/data/ja.js",
  "./js/data/ko.js",
  "./js/data/ms.js",
  "./js/data/nl.js",
  "./js/data/pl.js",
  "./js/data/pt.js",
  "./js/data/ru.js",
  "./js/data/sv.js",
  "./js/data/sw.js",
  "./js/data/th.js",
  "./js/data/tl.js",
  "./js/data/tr.js",
  "./js/data/uk.js",
  "./js/data/vi.js",
  "./js/data/zh.js",
  "./js/scripts.js",
  "./js/core/dom.js",
  "./js/core/ui.js",
  "./js/core/random.js",
  "./js/core/state.js",
  "./js/core/router.js",
  "./js/auth/index.js",
  "./js/auth/session.js",
  "./js/auth/crypto.js",
  "./js/auth/db.js",
  "./js/auth/validate.js",
  "./js/auth/local.js",
  "./js/auth/remote.js",
  "./js/views/partials.js",
  "./js/views/learn.js",
  "./js/views/dictionary.js",
  "./js/views/practice.js",
  "./js/views/auth.js",
  "./js/chrome.js",
  "./js/pwa.js",
  "./icons/icon.svg",
  "./icons/maskable.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Last-resort offline page, used only when the app shell was never cached. */
function offlinePage() {
  return new Response(
    `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1"><title>Jago Bahasa — Offline</title>
     <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1226;color:#eef0ff;
     font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px}
     p{color:#aab0d8;max-width:34ch;line-height:1.6}</style></head>
     <body><div><div style="font-size:3rem">📴</div><h1>Offline</h1>
     <p>Buka Jago Bahasa sekali saat online agar aplikasinya tersimpan untuk dipakai offline.</p>
     <p>Open Jago Bahasa once while online so it can be stored for offline use.</p></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // API calls must always hit the network and are never cached (auth + sync).
  if (url.origin === self.location.origin && /\/api\//.test(url.pathname)) return;

  // Let cross-origin requests pass through untouched.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached shell when offline.
  // If even the shell is missing (first visit made offline), answer with a
  // readable page instead of the browser's raw network error.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match("./index.html").then((cached) => cached || offlinePage())
      )
    );
    return;
  }

  // Static assets: cache-first, then network (and populate the cache).
  // IMPORTANT: never fall back to the HTML shell for a missing asset — a
  // module request answered with HTML is a hard parse error.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
