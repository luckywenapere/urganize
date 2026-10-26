/* Bring your notes: the phone's share sheet (Web Share Target).
 *
 * The manifest (app/manifest.ts) names POST /share-target as a share target, so
 * once Urganize is installed it shows up in Android's share sheet next to
 * WhatsApp's contacts. A shared chat export, voice note, photo or piece of text
 * arrives here as a multipart POST. There is no page to receive it (the app's
 * session lives in the browser, not in a cookie), so this worker parks the
 * share in its own cache and redirects to the Notes page, which reads it back,
 * deletes it, and opens Bring your notes with it already loaded.
 *
 * Loaded by both sw.js and sw-offline.js with importScripts, so it works
 * whichever one owns the scope. The cache name does not start with
 * "urganize-offline-", so neither worker's cleanup touches it. Nothing here is
 * sent anywhere; an unclaimed share is swept after a day.
 */

const SHARE_CACHE = 'urganize-share-v1';
const SHARE_TTL_MS = 24 * 60 * 60 * 1000;
const SHARE_MAX_FILES = 8;

function shareText(value) {
  return typeof value === 'string' ? value : '';
}

async function sweepOldShares(cache) {
  const now = Date.now();
  const keys = await cache.keys();
  await Promise.all(
    keys.map((request) => {
      const match = new URL(request.url).pathname.match(/^\/__share\/(\d+)-/);
      const madeAt = match ? Number(match[1]) : 0;
      return madeAt && now - madeAt > SHARE_TTL_MS ? cache.delete(request) : undefined;
    })
  );
}

async function handleShareTarget(request) {
  const fallback = new URL('/dashboard/notes?import=1', self.location.origin).href;
  try {
    const form = await request.formData();
    const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const cache = await caches.open(SHARE_CACHE);
    await sweepOldShares(cache);

    const files = form.getAll('files').filter((entry) => entry && typeof entry !== 'string');
    const stored = [];
    for (let index = 0; index < Math.min(files.length, SHARE_MAX_FILES); index += 1) {
      const file = files[index];
      const key = '/__share/' + id + '/file-' + index;
      await cache.put(
        key,
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name || 'file'),
            'X-File-Modified': String(file.lastModified || 0),
          },
        })
      );
      stored.push(key);
    }

    const meta = {
      title: shareText(form.get('title')),
      text: shareText(form.get('text')),
      url: shareText(form.get('url')),
      files: stored,
    };
    await cache.put(
      '/__share/' + id + '/meta',
      new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } })
    );

    return Response.redirect(
      new URL('/dashboard/notes?import=share&share=' + encodeURIComponent(id), self.location.origin).href,
      303
    );
  } catch (error) {
    return Response.redirect(fallback, 303);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'POST') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname !== '/share-target') return;
  event.respondWith(handleShareTarget(request));
});
