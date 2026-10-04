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
  const scriptUrl = OFFLINE_ENABLED ? '/sw-offline.js' : '/sw.js';
  try {
    return await navigator.serviceWorker.register(scriptUrl);
  } catch {
    return null;
  }
}
