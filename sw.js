const cacheName = "tms-cache-v6";
const assets = [
  "browserconfig.xml",
  "index.html",
  "manifest.json",
  "sw.js",
  "dependencies/acknowledgements.md",
  "dependencies/b+tree.js",
  "dependencies/graphemes.js",
  "dependencies/jquery.js",
  "dependencies/symbols.woff2",
  "resources/android-chrome-192x192.png",
  "resources/android-chrome-512x512.png",
  "resources/apple-touch-icon.png",
  "resources/examples.js",
  "resources/favicon-16x16.png",
  "resources/favicon-32x32.png",
  "resources/favicon-template.png",
  "resources/favicon.ico",
  "resources/layout.css",
  "resources/maskable_icon.png",
  "resources/mstile-150x150.png",
  "resources/safari-pinned-tab.svg",
  "resources/turingsim4.js",
  "resources/ui.js",
  "resources/worker.js",
];

self.addEventListener("install", installEvent => {
  installEvent.waitUntil(
    caches.open(cacheName).then(cache =>
      cache.addAll(assets)
    )
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(async function() {
    const activeCacheNames = await caches.keys();
    await Promise.all(
      activeCacheNames
        .filter(activeCacheName => activeCacheName !== cacheName)
        .map(cacheName => caches.delete(cacheName))
    );
  }());
});

self.addEventListener("fetch", event => {
  event.respondWith(async function() {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(event.request);
    const networkResponsePromise = fetch(event.request);

    event.waitUntil(async function() {
      const networkResponse = await networkResponsePromise;
      await cache.put(event.request, networkResponse.clone());
    }());

    return cachedResponse || networkResponsePromise;
  }());
});
