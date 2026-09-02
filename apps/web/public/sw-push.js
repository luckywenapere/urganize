/* Web Push delivery + notification clicks. Loaded via importScripts() by
 * whichever top-level service worker is registered (public/sw.js when
 * NEXT_PUBLIC_FEATURE_OFFLINE is off, public/sw-offline.js when it's on) —
 * split out so the offline caching layer can be added, removed, or rolled
 * back without ever touching push delivery, and vice versa.
 *
 * Payload contract (see apps/web/lib/push-server.ts, the ONLY sender):
 *   { title: string, body: string, url?: string, tag?: string }
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A malformed payload still surfaces as a generic notification rather
    // than being dropped silently.
  }

  const title = data.title || 'Urganize';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/images/urganize-logo-square.png',
      badge: '/images/urganize-mark.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Prefer focusing an already-open app window (and navigating it) over
      // opening a duplicate tab.
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
