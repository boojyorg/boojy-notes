const CACHE_NAME = "boojy-notes-v2";

const PRECACHE_URLS = ["/", "/index.html"];

// Install: pre-cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

// Fetch: stale-while-revalidate for the app shell
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Stale-while-revalidate: serve cached immediately,
  // fetch fresh copy in background and update cache for next load
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (
              response.ok &&
              url.origin === self.location.origin &&
              event.request.method === "GET"
            ) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cached); // fallback to cached on network error
        return cached || fetchPromise;
      }),
    ),
  );
});
