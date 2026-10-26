const CACHE = "safespend-v10-131-compact-buttons-wallet-saving-allocation";
const ASSETS = [
  "./",
  "./index.html",
  "./credit.js",
  "./project-transfer.js",
  "./wallet-accounts.js",
  "./aa.js",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("safespend-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // A failed script request must never receive HTML: that leaves the PWA on a blank boot screen.
    const cached = await caches.match(request);
    try {
      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone()).catch(() => {});
        return response;
      }
      if (cached) return cached;
      return response;
    } catch (error) {
      if (cached) return cached;
      if (request.mode === "navigate") {
        const documentFallback = await caches.match("./index.html");
        if (documentFallback) return documentFallback;
      }
      return Response.error();
    }
  })());
});
