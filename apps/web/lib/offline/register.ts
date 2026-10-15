/**
 * Registers the app's service worker — the offline shell (sw-offline.js)
 * when the flag is on, the push-only worker (sw.js) when it isn't. Both
 * register at the SAME scope ('/'), so this is the ONE call site that
 * decides which script owns it; lib/push.ts's own lookups
 * (`getRegistration('/sw.js')`) keep resolving correctly either way, since
 * they match by scope, not by which script is currently registered there.
 *
 * Deliberately does NOT require PushManager/VAPID like
 * registerPushServiceWorker() does — today's registration silently never
 * happens in an environment with no VAPID key configured (dev, most
 * previews), and the offline shell has nothing to do with push. Offline
 * needs only 'serviceWorker' in navigator.
 */

const OFFLINE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_OFFLINE === 'true';

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || '';
const OFFLINE_CACHE_PREFIX = 'urganize-offline-';

/**
 * Delete every offline cache this origin holds (2026-10-15, URG-314). Called on
 * sign-out so nothing one account's session cached is ever shown to the next
 * account on the same device. Runs from the window (CacheStorage is shared
 * with the worker) and also tells the worker, in case it is mid-write.
 * Never throws.
 */
export async function clearAppCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'clear-all' });
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => name.startsWith(OFFLINE_CACHE_PREFIX)).map((name) => caches.delete(name))
    );
  } catch {
    // Best effort.
  }
}

/**
 * Drop the cached pages (not the static chunks) before a chunk-recovery
 * reload, so the reload fetches the current deployment's HTML instead of the
 * stale shell that named the missing chunk. Never throws.
 */
export async function purgePageCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'purge-pages' });
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(`${OFFLINE_CACHE_PREFIX}html-`) || name.startsWith(`${OFFLINE_CACHE_PREFIX}rsc-`))
        .map((name) => caches.delete(name))
    );
  } catch {
    // Best effort.
  }
}

function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Ask the offline worker to download these pages now, so they open with no
 * connection even if the user has never visited them. A no-op unless the
 * offline flag is on and a worker is already controlling the page. Never
 * throws.
 */
export async function precacheRoutesOffline(paths: string[]): Promise<void> {
  if (!OFFLINE_ENABLED || !isServiceWorkerSupported() || paths.length === 0) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'precache-routes', paths });
  } catch {
    // Best effort.
  }
}

/** Safe to call on every app load. Never throws; a failed registration is
 * a silent no-op, same posture as registerPushServiceWorker(). */
export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;
  // Versioned per deployment so each deploy installs a fresh worker that
  // purges the previous build's caches (see public/sw-offline.js).
  const scriptUrl = OFFLINE_ENABLED
    ? `/sw-offline.js${BUILD_ID ? `?v=${encodeURIComponent(BUILD_ID)}` : ''}`
    : '/sw.js';
  try {
    return await navigator.serviceWorker.register(scriptUrl);
  } catch {
    return null;
  }
}
