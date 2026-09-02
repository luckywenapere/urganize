/* Urganize service worker — push-only (NEXT_PUBLIC_FEATURE_OFFLINE off).
 *
 * Deliberately minimal: no caching/offline layer of its own. This file
 * exists so push subscriptions have a worker to deliver to — including
 * installed PWAs on phones. See sw-push.js for the push/notificationclick
 * handlers, and sw-offline.js for the caching layer registered instead of
 * this file when the offline flag is on (lib/offline/register.ts).
 *
 * Both files are registered at the SAME scope ('/'), so flipping the flag
 * swaps which script owns that scope on the next page load — the browser's
 * own update mechanism, no version negotiation of our own needed. This
 * file's activate handler deletes any caches sw-offline.js created, so
 * turning the flag back off is a real kill switch: the next load registers
 * this script, and the very first thing it does is remove the offline
 * caching layer's state.
 */

importScripts('/sw-push.js');

const OFFLINE_CACHE_PREFIX = 'urganize-offline-';

self.addEventListener('install', () => {
  // Take over immediately on updates — there is no cache state of our own
  // to migrate (any offline caches present belong to sw-offline.js, cleaned
  // up in activate below).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(OFFLINE_CACHE_PREFIX))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});
