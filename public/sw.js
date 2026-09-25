// Bump this on every deploy that should invalidate old caches -- `activate`
// below deletes every cache that isn't this one, so a stale version never
// lingers on a user's device past their next visit.
const CACHE_VERSION = "v3";
const CACHE_NAME = `nubtang-${CACHE_VERSION}`;
const SHELL_URL = "/";
// How long a launch waits on the network for the page before it opens the
// cached copy instead. Long enough that a normal connection always wins (so
// a fresh deploy is picked up straight away), short enough that a bad one
// is not what the user spends their first seconds looking at.
const NAVIGATE_TIMEOUT_MS = 1500;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(SHELL_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Supabase and any other third-party origin: never intercept -- these
  // need to fail with a real network error offline, not a stale cached
  // response, and the app already handles that failure via setError/toasts.
  if (url.origin !== self.location.origin) return;
  // This app's own API routes (Gemini analysis, etc.) are equally
  // network-dependent and must never be served from cache.
  if (url.pathname.startsWith("/api/")) return;

  // Only the app itself is the shell. Any other page (/login, /privacy) goes straight
  // to the network: answering it from the cached shell would open the app in
  // its place, and caching its response as the shell would do the reverse on
  // the next launch.
  if (request.mode === "navigate" && url.pathname !== SHELL_URL) return;

  if (request.mode === "navigate") {
    // Network first, but not network at any cost. On a slow mobile
    // connection, waiting for the page itself kept the app on its splash for
    // as long as the network cared to take, even with a perfectly good copy
    // in the cache. Past NAVIGATE_TIMEOUT_MS the cached shell is served and
    // the fetch carries on in the background to refresh it, so the next
    // launch picks up whatever this one could not wait for. A navigation with
    // nothing cached yet still waits for the network, since there is no
    // alternative to offer.
    const network = fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, copy));
      }
      return response;
    });
    event.waitUntil(network.catch(() => undefined));
    event.respondWith(
      caches.match(SHELL_URL).then((cached) => {
        const fallback = () => cached ?? Response.error();
        if (!cached) return network.catch(fallback);
        const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NAVIGATE_TIMEOUT_MS));
        return Promise.race([network.catch(fallback), timeout]);
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })),
    );
  }
});
