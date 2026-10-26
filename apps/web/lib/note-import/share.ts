// Bring your notes: reading back what the phone's share sheet handed us.
// public/sw-share-target.js parks a share in the Cache API; this reads it,
// deletes it, and sorts the files by what they are. The pure parts are tested.

export const SHARE_CACHE = 'urganize-share-v1';

export type SharedFileKind = 'text' | 'photo' | 'voice';

const TEXT_EXT = /\.(txt|md|docx|zip)$/i;
const VOICE_EXT = /\.(opus|ogg|oga|m4a|mp3|wav|webm)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** What a shared file is for. Null means Urganize has no use for it. */
export function classifySharedFile(file: { name: string; type: string }): SharedFileKind | null {
  const type = (file.type || '').toLowerCase();
  const name = file.name || '';
  if (type.startsWith('image/') || IMAGE_EXT.test(name)) return 'photo';
  if (type.startsWith('audio/') || VOICE_EXT.test(name)) return 'voice';
  if (
    type.startsWith('text/') ||
    type === 'application/zip' ||
    type === 'application/x-zip-compressed' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    TEXT_EXT.test(name)
  ) {
    return 'text';
  }
  return null;
}

/** One block of text from the share's title, text and link, without repeats. */
export function sharedText(meta: { title?: string; text?: string; url?: string }): string {
  const text = (meta.text || '').trim();
  const parts: string[] = [];
  const title = (meta.title || '').trim();
  if (title && !text.includes(title)) parts.push(title);
  if (text) parts.push(text);
  const url = (meta.url || '').trim();
  if (url && !text.includes(url)) parts.push(url);
  return parts.join('\n');
}

const ID_SHAPE = /^[a-z0-9-]{6,40}$/i;

export type TakenShare = { text: string; files: File[] };

/** Reads a share out of the cache and removes it. Null when it is gone or malformed. */
export async function takeShare(id: string): Promise<TakenShare | null> {
  if (!ID_SHAPE.test(id) || typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const metaResponse = await cache.match(`/__share/${id}/meta`);
    if (!metaResponse) return null;
    const meta = (await metaResponse.json()) as { title?: string; text?: string; url?: string; files?: string[] };

    const files: File[] = [];
    for (const key of Array.isArray(meta.files) ? meta.files : []) {
      if (typeof key !== 'string' || !key.startsWith(`/__share/${id}/file-`)) continue;
      const response = await cache.match(key);
      if (!response) continue;
      const blob = await response.blob();
      const name = decodeURIComponent(response.headers.get('X-File-Name') || 'file');
      files.push(
        new File([blob], name, {
          type: response.headers.get('Content-Type') || '',
          lastModified: Number(response.headers.get('X-File-Modified')) || Date.now(),
        })
      );
    }

    for (const request of await cache.keys()) {
      if (new URL(request.url).pathname.startsWith(`/__share/${id}/`)) await cache.delete(request);
    }
    return { text: sharedText(meta), files };
  } catch {
    return null;
  }
}
