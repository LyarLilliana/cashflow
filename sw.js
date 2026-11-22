const CACHE = "safespend-v10-153-startup-cache-recovery";
const ASSETS = [
  "./",
  "./index.html",
  "./credit.js",
  "./project-transfer.js",
  "./project-wallet.js?v=10-147",
  "./project-savings.js?v=10-151",
  "./wallet-accounts.js?v=10-151",
  "./aa.js",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url,{cache:"reload"}))))
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
    const cached = await cache.match(request);
    try {
      const fresh = request.mode === "navigate" || ["script","style","document"].includes(request.destination);
      const response = await fetch(request, fresh ? {cache:"no-store"} : undefined);
      if (response.ok) {
        await cache.put(request, response.clone()).catch(() => {});
        return response;
      }
      if (cached) return cached;
      return response;
    } catch (error) {
      if (cached) return cached;
      if (request.mode === "navigate") {
        const documentFallback = await cache.match("./index.html");
        if (documentFallback) return documentFallback;
      }
      return Response.error();
    }
  })());
});
