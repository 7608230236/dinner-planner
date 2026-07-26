const APP_VERSION = "60";
const BUILD_ID = "__BUILD_ID__";
const CACHE_NAME = `dinner-made-easy-v${APP_VERSION}-${BUILD_ID}`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  `/css/styles.css?v=${APP_VERSION}-${BUILD_ID}`,
  `/js/ingredient-engine.js?v=${APP_VERSION}-${BUILD_ID}`,
  `/js/recipes.js?v=${APP_VERSION}-${BUILD_ID}`,
  `/js/app.js?v=${APP_VERSION}-${BUILD_ID}`,
  `/js/developer.js?v=${APP_VERSION}-${BUILD_ID}`,
  "/hero-family-kitchen.jpg",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request, fallbackUrl = "") {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (fallbackUrl ? await cache.match(fallbackUrl) : undefined) || Response.error();
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/.netlify/functions/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/index.html"));
    return;
  }

  event.respondWith(networkFirst(request));
});
