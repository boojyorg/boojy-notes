const CACHE_NAME = "boojy-notes-v1";

const PRECACHE_URLS = [
  "/",
  "/index.html",
];

// Install: pre-cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API/Supabase, cache-first for app shell
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Network-first for API calls (Supabase, external services)
  if (
    url.hostname.includes("supabase") ||
    url.pathname.startsWith("/rest/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/functions/")
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for app shell (HTML, JS, CSS, fonts, images)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache successful same-origin responses
        if (
          response.ok &&
          url.origin === self.location.origin &&
          event.request.method === "GET"
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
