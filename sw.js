const CACHE = "safespend-v10-155-fast-start";
const ASSETS = [
  "./",
  "./index.html",
  "./credit.js?v=10-154",
  "./project-transfer.js?v=10-154",
  "./project-wallet.js?v=10-154",
  "./project-savings.js?v=10-154",
  "./wallet-accounts.js?v=10-151",
  "./aa.js",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];
const ROOT = new URL("./", self.location.href);
const INDEX = new URL("./index.html", ROOT);
const isAppDocument = url => url.origin === ROOT.origin &&
  (url.pathname === ROOT.pathname || url.pathname === INDEX.pathname);
const explicitRefresh = url => url.searchParams.has("refresh");

self.addEventListener("install", event => {
  // Publish a complete version only after all its assets have been fetched.
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
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const navigation = request.mode === "navigate" && isAppDocument(url);
    const cached = await cache.match(request) ||
      (navigation ? await cache.match(INDEX.href) : undefined);
    let manualRefresh = navigation && explicitRefresh(url);
    if (!manualRefresh && request.referrer) {
      try {
        const referrer = new URL(request.referrer);
        manualRefresh = isAppDocument(referrer) && explicitRefresh(referrer);
      } catch (_) {}
    }
    // Installed app launches immediately from the versioned cache. The browser
    // checks the service-worker update independently; no document network wait.
    if (cached && !manualRefresh) return cached;
    try {
      const response = await fetch(request, manualRefresh ? {cache:"no-store"} : undefined);
      if (response.ok) return response;
      return cached || response;
    } catch (error) {
      // Only a navigation can receive an HTML fallback.
      return cached || Response.error();
    }
  })());
});
