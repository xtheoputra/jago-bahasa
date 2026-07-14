/* =========================================================================
   Jago Bahasa — Service Worker (offline-first app shell)
   v2: ES-module precache, /api network-only, no HTML fallback for assets.
   ========================================================================= */
const VERSION = "jb-v2.1.0";
const CACHE = `jagobahasa-${VERSION}`;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/i18n.js",
  "./js/data.js",
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // API calls must always hit the network and are never cached (auth + sync).
  if (url.origin === self.location.origin && /\/api\//.test(url.pathname)) return;

  // Let cross-origin requests pass through untouched.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("./index.html")));
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
