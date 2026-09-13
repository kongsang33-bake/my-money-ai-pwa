// Two things invalidate this cache, and only one of them is manual.
//
// CACHE_VERSION is the reset switch, for changes to the caching rules in this
// file itself: `activate` deletes every cache that isn't the current name, so
// bumping it drops each device's stored copy wholesale on their next visit.
// Ordinary deploys do NOT need a bump -- `reconcileShell` below drops the
// previous build's static assets as soon as a freshly fetched shell stops
// referencing them.
//
// It used to say "bump this on every deploy", which nobody ever did, and that
// was only half the problem: the cache writes below were floating promises
// rather than `event.waitUntil`, so the browser was free to kill the worker
// before the shell was actually rewritten. A device could therefore hold an
// app shell from weeks ago, pointing at a stylesheet from weeks ago, which
// cache-first happily served -- so a launch that missed the network came up
// painted in a palette that had since been retired. Both halves are fixed
// here; v2 also clears whatever "v1" accumulated.
const CACHE_VERSION = "v2";
const CACHE_NAME = `monii-${CACHE_VERSION}`;
const SHELL_URL = "/";
const STATIC_PREFIX = "/_next/static/";

// Every build-stamped asset the shell HTML points at. These URLs are content
// hashed, so the set changes exactly when a new build ships -- which makes it
// a reliable "is this still the deployed build?" test, where comparing the
// HTML itself is not (the inlined RSC payload can differ between requests
// without anything having been deployed).
const STATIC_ASSET_RE = /\/_next\/static\/[^"'()\s\\<>]+/g;

function staticAssetsIn(html) {
  return new Set((html.match(STATIC_ASSET_RE) ?? []).map((url) => url.split("?")[0]));
}

function sameAssets(a, b) {
  return a.size === b.size && [...a].every((url) => b.has(url));
}

// Only store a response worth replaying: a real 200 from this origin. A 404,
// a 500 or a redirect cached as the app shell turns a passing outage into one
// that outlives it.
function isCacheable(response) {
  return response.ok && response.type === "basic" && !response.redirected;
}

// Store the freshly fetched shell, and if it belongs to a newer build than the
// one we had, evict the assets the old shell referenced -- otherwise every
// deploy leaves its whole stylesheet-and-chunk set behind forever, and the
// cache only ever grows.
async function reconcileShell(forCache, forRead) {
  const cache = await caches.open(CACHE_NAME);
  const previous = await cache.match(SHELL_URL);
  const previousAssets = previous ? staticAssetsIn(await previous.text()) : null;
  const nextAssets = staticAssetsIn(await forRead.text());

  await cache.put(SHELL_URL, forCache);

  if (!previousAssets || sameAssets(previousAssets, nextAssets)) return;

  const keys = await cache.keys();
  await Promise.all(keys.map((request) => {
    const { origin, pathname } = new URL(request.url);
    if (origin !== self.location.origin) return null;
    if (!pathname.startsWith(STATIC_PREFIX)) return null;
    if (nextAssets.has(pathname)) return null;
    return cache.delete(request);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // Non-fatal: a failed precache costs the offline shell until the next
      // successful visit, but failing install would leave the *previous*
      // worker in charge -- including, on an upgrade, the one this version
      // exists to replace.
      .then((cache) => cache.add(SHELL_URL).catch(() => {}))
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

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            // waitUntil, not a floating promise. The worker may be killed the
            // moment respondWith settles, and this write is what keeps the
            // offline shell pointing at the deployed build.
            event.waitUntil(reconcileShell(response.clone(), response.clone()));
          }
          return response;
        })
        .catch(() => caches.open(CACHE_NAME)
          .then((cache) => cache.match(SHELL_URL))
          .then((cached) => cached ?? Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith(STATIC_PREFIX) || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      // Scoped to this cache rather than caches.match's global lookup, so a
      // cache another version left behind can never answer for this one.
      caches.open(CACHE_NAME).then((cache) => cache.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        if (isCacheable(response)) event.waitUntil(cache.put(request, response.clone()));
        return response;
      }))),
    );
  }
});
