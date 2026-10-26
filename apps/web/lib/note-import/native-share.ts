// Bring your notes: the Android app's share sheet, page side. The shell (apps/mobile)
// holds what someone shared and hands it over a chunk at a time; this pulls it
// into the same cache the installed web app's service worker uses
// (public/sw-share-target.js), so the Notes page reads both the same way with
// takeShare. Nothing is uploaded here.

import { SHARE_CHUNK_CHARS, type SharedFileInfo, type SharedPayload } from '@urganize/native-bridge';
import { request } from '@/lib/native-bridge';
import { SHARE_CACHE } from './share';

const SHARE_TTL_MS = 24 * 60 * 60 * 1000;

/** Base64 text to bytes. A chunk is a multiple of 4 characters, so each decodes on its own. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** How many `share.readFile` asks a file of this size needs, at most. Guards a runaway loop. */
export function maxChunksFor(size: number | null): number {
  const bytes = size && size > 0 ? size : 12 * 1024 * 1024;
  return Math.ceil(((bytes * 4) / 3) / SHARE_CHUNK_CHARS) + 3;
}

async function pullFile(id: string, info: SharedFileInfo): Promise<Blob> {
  const parts: BlobPart[] = [];
  let offset: number | null = 0;
  let guard = maxChunksFor(info.size);
  while (offset !== null) {
    if (guard <= 0) throw new Error('The shared file did not finish arriving.');
    guard -= 1;
    const answer: { data: string; next: number | null } = await request(
      'share.readFile',
      { id, index: info.index, offset },
      { timeoutMs: 30_000 }
    );
    parts.push(base64ToBytes(answer.data) as BlobPart);
    offset = answer.next;
  }
  return new Blob(parts, { type: info.mimeType || 'application/octet-stream' });
}

async function sweepOldShares(cache: Cache): Promise<void> {
  const now = Date.now();
  for (const entry of await cache.keys()) {
    const match = new URL(entry.url).pathname.match(/^\/__share\/(\d+)-/);
    const madeAt = match ? Number(match[1]) : 0;
    if (madeAt && now - madeAt > SHARE_TTL_MS) await cache.delete(entry);
  }
}

/**
 * Pulls a share out of the shell and parks it in the share cache under the
 * shell's own id. Resolves with that id, or null when nothing could be kept.
 * Always tells the shell it is done, so it lets go of the files either way.
 */
export async function receiveNativeShare(shared: SharedPayload): Promise<string | null> {
  if (typeof caches === 'undefined') {
    void request('share.done', { id: shared.id }).catch(() => {});
    return null;
  }
  try {
    const cache = await caches.open(SHARE_CACHE);
    await sweepOldShares(cache);

    const keys: string[] = [];
    for (const info of shared.files) {
      const blob = await pullFile(shared.id, info);
      const key = `/__share/${shared.id}/file-${info.index}`;
      await cache.put(
        key,
        new Response(blob, {
          headers: {
            'Content-Type': info.mimeType || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(info.name),
            'X-File-Modified': String(Date.now()),
          },
        })
      );
      keys.push(key);
    }

    await cache.put(
      `/__share/${shared.id}/meta`,
      new Response(JSON.stringify({ title: shared.title, text: shared.text, url: '', files: keys }), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
    return shared.id;
  } catch {
    return null;
  } finally {
    void request('share.done', { id: shared.id }).catch(() => {});
  }
}
