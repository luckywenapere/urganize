/* Urganize service worker — Web Push delivery + notification clicks.
 *
 * Deliberately minimal: no caching/offline layer (the app is served by
 * Next.js/Vercel as usual). This file exists so push subscriptions have a
 * worker to deliver to — including installed PWAs on phones.
 *
 * Payload contract (see apps/web/lib/push-server.ts, the ONLY sender):
 *   { title: string, body: string, url?: string, tag?: string }
 */

self.addEventListener('install', () => {
  // Take over immediately on updates — there is no cache state to migrate.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

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
