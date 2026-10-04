/* Urganize service worker — offline app shell (NEXT_PUBLIC_FEATURE_OFFLINE
 * on). Registered at the same scope ('/') as the push-only public/sw.js —
 * see that file's header for how the two coexist and how the flag rolls
 * back cleanly.
 *
 * What this DOES cache: same-origin static assets, images, the manifest,
 * and successfully-rendered HTML navigations — enough that a page you've
 * already opened once still opens with the app chrome intact when offline.
 *
 * What this NEVER caches: anything under /api/. Data belongs to the
 * store/localStorage layer (see lib/offline/network-error.ts and the
 * store-level cache-first hydration it protects) — a service-worker cache
 * of an API response would fight that layer's own auth and staleness
 * rules, and every real mutation needs a real round trip anyway. Only GET
 * requests to our own origin are ever inspected; everything else (POST/
 * PATCH/DELETE, and any cross-origin request — Supabase, PostHog) passes
 * straight through untouched.
 */

importScripts('/sw-push.js');

const CACHE_VERSION = 'v1';
const HTML_CACHE = `urganize-offline-html-${CACHE_VERSION}`;
const ASSET_CACHE = `urganize-offline-assets-${CACHE_VERSION}`;
// In-app (client-side) navigations fetch a React Server Component payload
// (`?_rsc=…`) rather than a document. Without keeping those, tapping a link
// offline fails the fetch and Next falls back to a full page load.
const RSC_CACHE = `urganize-offline-rsc-${CACHE_VERSION}`;
const CURRENT_CACHES = new Set([HTML_CACHE, ASSET_CACHE, RSC_CACHE]);
const OFFLINE_CACHE_PREFIX = 'urganize-offline-';

// A page that must never resolve to the dashboard's chrome offline — each
// is a link handed to someone outside the team (a press contact, a
// collaborator submitting credits, a fan, a curator, a fresh visitor) and
// showing them somebody's workspace would be a privacy failure, not a
// convenience.
const PUBLIC_ONLY_PREFIXES = ['/epk/', '/credits/', '/capture/', '/curator', '/auth', '/join', '/invite'];

// Signed-in app chrome — an unrecognized URL under these prefixes (or the
// root) falls back to the cached dashboard shell rather than a dead end,
// since navigating deeper into the app almost always means "take me
// somewhere inside it," not "show me this exact page."
const APP_CHROME_PREFIXES = ['/dashboard', '/settings', '/admin'];

// Room for every nav destination the page warms (see lib/prefetch-routes.ts)
// plus the pages the user has actually opened.
const MAX_CACHED_HTML_ENTRIES = 40;
const MAX_CACHED_RSC_ENTRIES = 80;
const NAVIGATION_TIMEOUT_MS = 5000;

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>You're offline — Urganize</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    background: #0d120e; color: #e9efe9;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    text-align: center; padding: 24px; box-sizing: border-box;
  }
  main { max-width: 360px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { font-size: 14px; line-height: 1.5; color: #9fb0a3; margin: 0 0 20px; }
  button {
    font: inherit; font-weight: 600; padding: 10px 20px; border-radius: 999px;
    border: none; background: #7fd99a; color: #0d120e; cursor: pointer;
  }
</style>
</head>
<body>
<main>
  <h1>You're offline</h1>
  <p>This page hasn't been opened before, so there's nothing saved to show. Reconnect and try again.</p>
  <button onclick="location.reload()">Try again</button>
</main>
</body>
</html>`;

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function isPublicOnlyPath(pathname) {
  return PUBLIC_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAppChromePath(pathname) {
  return pathname === '/' || APP_CHROME_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  if (excess <= 0) return;
  // Cache.keys() returns insertion order in every engine that matters here
  // (Chromium, Firefox, Safari) — good enough for "drop the oldest few,"
  // which is the only property this needs.
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

async function handleNavigation(request) {
  const url = new URL(request.url);

  try {
    const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    if (response && response.ok && response.type === 'basic') {
      const cache = await caches.open(HTML_CACHE);
      cache.put(request, response.clone());
      trimCache(HTML_CACHE, MAX_CACHED_HTML_ENTRIES);
    }
    return response;
  } catch {
    // Network failed or timed out. Prefer an exact cached copy of THIS
    // page (a page the user has genuinely already opened) over the
    // dashboard-shell fallback below.
    const exact = await caches.match(request, { ignoreSearch: false });
    if (exact) return exact;

    if (isPublicOnlyPath(url.pathname)) {
      return offlineResponse();
    }

    if (isAppChromePath(url.pathname)) {
      const shell = await caches.match('/dashboard');
      if (shell) return shell;
    }

    return offlineResponse();
  }
}

// Network first, so online behaviour is exactly what it was; the cached copy
// only answers when the network fails. Vary is ignored on lookup because the
// router state header differs between a prefetch and the click that follows.
async function handleRsc(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      const cache = await caches.open(RSC_CACHE);
      cache.put(request, response.clone());
      trimCache(RSC_CACHE, MAX_CACHED_RSC_ENTRIES);
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw error;
  }
}

// Fetch each page ahead of time so it is already on the device when the
// connection drops. Only same-origin app paths; never an API route.
async function precacheRoutes(paths) {
  const cache = await caches.open(HTML_CACHE);
  await Promise.all(
    paths.map(async (path) => {
      if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return;
      if (path.startsWith('/api/')) return;
      try {
        const response = await fetch(path, { credentials: 'same-origin' });
        if (response && response.ok && response.type === 'basic') {
          await cache.put(path, response);
        }
      } catch {
        // Best effort: a page that fails to warm is simply fetched on demand.
      }
    })
  );
  await trimCache(HTML_CACHE, MAX_CACHED_HTML_ENTRIES);
}

async function handleCacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function handleStaleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === 'basic') {
        caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || fetch(request);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(OFFLINE_CACHE_PREFIX) && !CURRENT_CACHES.has(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'precache-routes' || !Array.isArray(data.paths)) return;
  event.waitUntil(precacheRoutes(data.paths));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never GET, never same-origin → never ours. In particular this leaves
  // every /api/* call, every cross-origin request (Supabase Storage,
  // PostHog), and every mutation untouched — the browser's default
  // network handling applies exactly as if this file didn't exist.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.searchParams.has('_rsc')) {
    event.respondWith(handleRsc(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    // Content-hashed and immutable — safe to serve from cache forever
    // without ever re-checking the network.
    event.respondWith(handleCacheFirst(request, ASSET_CACHE));
    return;
  }

  if (url.pathname.startsWith('/images/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(handleStaleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  // Everything else (fonts served from other paths, favicons, etc.) is left
  // to the browser's own HTTP cache — deliberately not everything on the
  // origin needs to go through this worker.
});
