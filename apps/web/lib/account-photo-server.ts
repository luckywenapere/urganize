import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-constants';
import { thumbPathFor } from '@/lib/image-thumb';
import { MAX_PROFILE_PHOTO_BYTES, PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS } from '@/lib/profile-photo';
import { removePhotoObject } from '@/lib/profile-photo-server';
import {
  GOOGLE_PHOTO_FETCH_TIMEOUT_MS,
  accountPhotoPathPrefix,
  googlePictureFromIdentities,
  isAllowedGooglePhotoUrl,
  isOwnAccountPhotoPath,
  normalizePhotoContentType,
} from '@/lib/account-photo';

/**
 * Server half of your account photo (lib/account-photo.ts has the why).
 *
 * READS NEVER THROW: a missing column (migration not applied), an unreadable
 * row or a signing hiccup all answer "no photo", and every face falls back to
 * initials. A stored path is only ever signed when it is still inside its
 * owner's own account folder, so a bad value can never expose another file.
 */

type Row = Record<string, unknown>;

/** The stored path for one user, or null. */
export async function loadAccountPhotoPath(admin: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.from('profiles').select('avatar_path').eq('id', userId).maybeSingle();
    if (error || !data) return null;
    const path = (data as Row).avatar_path;
    return isOwnAccountPhotoPath(path, userId) ? path : null;
  } catch {
    return null;
  }
}

/**
 * A full-life signed URL for one path (thumb preferred). Deliberately skips the
 * signed-URL cache in asset-helpers: a cached URL can be 48 minutes old, and
 * the browser keeps this one for up to 45 minutes before asking again.
 */
export async function signFreshAccountPhoto(admin: SupabaseClient, path: string): Promise<string | null> {
  try {
    const { data, error } = await admin.storage
      .from(RELEASE_ASSETS_BUCKET)
      .createSignedUrls([thumbPathFor(path), path], PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS);
    if (error || !Array.isArray(data)) return null;
    const usable = data.find((item) => item && !item.error && item.signedUrl);
    return usable?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** Your own photo, freshly signed, or null. */
export async function loadAccountPhotoUrl(admin: SupabaseClient, userId: string): Promise<string | null> {
  const path = await loadAccountPhotoPath(admin, userId);
  return path ? signFreshAccountPhoto(admin, path) : null;
}

/**
 * Fresh signed URLs for several account photos in ONE storage call, thumb
 * first, the full photo when there is no thumb. Uncached on purpose: the
 * shared signer (signPhotoPathsPreferThumb) can hand back a link with only
 * minutes left, and teammates' faces are never refreshed on the page.
 */
export async function signFreshAccountPhotos(
  admin: SupabaseClient,
  rows: Array<{ key: string; path: string }>
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (!rows.length) return urls;
  try {
    const paths = rows.flatMap((row) => [thumbPathFor(row.path), row.path]);
    const { data, error } = await admin.storage
      .from(RELEASE_ASSETS_BUCKET)
      .createSignedUrls(paths, PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS);
    if (error || !Array.isArray(data)) return urls;
    const byPath = new Map<string, string>();
    for (const item of data) {
      if (item && !item.error && item.signedUrl && item.path) byPath.set(item.path, item.signedUrl);
    }
    for (const { key, path } of rows) {
      const url = byPath.get(thumbPathFor(path)) ?? byPath.get(path);
      if (url) urls.set(key, url);
    }
  } catch {
    // A face falls back to initials; never fail the page for a photo.
  }
  return urls;
}

/** Signed photo URLs for teammates, keyed by user id. One profiles read and
 *  one fresh batched signing call (signFreshAccountPhotos). */
export async function loadAccountPhotoUrls(admin: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return new Map();
  try {
    const { data, error } = await admin.from('profiles').select('id, avatar_path').in('id', ids);
    if (error || !Array.isArray(data)) return new Map();
    const rows = (data as Row[])
      .filter((row) => isOwnAccountPhotoPath(row.avatar_path, String(row.id)))
      .map((row) => ({ key: String(row.id), path: String(row.avatar_path) }));
    return await signFreshAccountPhotos(admin, rows);
  } catch {
    return new Map();
  }
}

export type SaveAccountPhotoResult = { ok: true; photoUrl: string | null } | { ok: false; status: number; error: string };

/** Save (or clear) the path with the service role and drop the file it replaces. */
export async function saveAccountPhotoPath(
  admin: SupabaseClient,
  userId: string,
  nextPath: string | null
): Promise<SaveAccountPhotoResult> {
  if (nextPath !== null && !isOwnAccountPhotoPath(nextPath, userId)) {
    return { ok: false, status: 400, error: 'That photo is not yours.' };
  }
  const previous = await loadAccountPhotoPath(admin, userId);
  const { data, error } = await admin
    .from('profiles')
    .update({ avatar_path: nextPath })
    .eq('id', userId)
    .select('id');
  if (error) {
    if (error.code === '42703') {
      return { ok: false, status: 503, error: 'Photos are not ready yet. Try again soon.' };
    }
    return { ok: false, status: 500, error: 'Could not save the photo. Try again.' };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, status: 404, error: 'Your profile was not found.' };
  }
  if (previous && previous !== nextPath) await removePhotoObject(admin, previous);
  return { ok: true, photoUrl: nextPath ? await signFreshAccountPhoto(admin, nextPath) : null };
}

/** Every file under account/<uid>/photo/, thumbs included (account deletion). */
export async function listAccountPhotoObjects(admin: SupabaseClient, userId: string): Promise<string[]> {
  const prefix = accountPhotoPathPrefix(userId);
  try {
    const { data, error } = await admin.storage
      .from(RELEASE_ASSETS_BUCKET)
      .list(prefix.replace(/\/$/, ''), { limit: 1000 });
    if (error || !Array.isArray(data)) return [];
    return data.map((item) => item?.name).filter((name): name is string => Boolean(name)).map((name) => `${prefix}${name}`);
  } catch {
    return [];
  }
}

// ── Google ───────────────────────────────────────────────────────────────────

/** The Google picture on this account's identities, read with the admin
 *  client (never from the request), already through the host allowlist. */
export async function loadGooglePhotoSuggestion(admin: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    return googlePictureFromIdentities(data.user.identities);
  } catch {
    return null;
  }
}

/**
 * Fetch an allowed Google photo: https googleusercontent only, no redirects
 * followed, an 8 second limit, 5 MB cap, JPEG/PNG/WebP only. Null on anything
 * else.
 */
export async function fetchGooglePhoto(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!isAllowedGooglePhotoUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_PHOTO_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { redirect: 'manual', signal: controller.signal, cache: 'no-store' });
    if (response.status !== 200 || !response.body) return null;
    const contentType = normalizePhotoContentType(response.headers.get('content-type'));
    if (!contentType) return null;
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_PROFILE_PHOTO_BYTES) return null;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROFILE_PHOTO_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    if (!total) return null;
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Copy the Google photo into account/<uid>/photo/ and save it. */
export async function saveGooglePhoto(
  admin: SupabaseClient,
  userId: string,
  fetchImpl: typeof fetch = fetch
): Promise<SaveAccountPhotoResult> {
  const suggestion = await loadGooglePhotoSuggestion(admin, userId);
  if (!suggestion) return { ok: false, status: 404, error: 'There is no Google photo on your account.' };
  const photo = await fetchGooglePhoto(suggestion, fetchImpl);
  if (!photo) return { ok: false, status: 502, error: 'Could not get your Google photo. Try again.' };

  const path = `${accountPhotoPathPrefix(userId)}${randomUUID()}-google.${EXTENSION[photo.contentType]}`;
  const { error } = await admin.storage
    .from(RELEASE_ASSETS_BUCKET)
    .upload(path, photo.bytes, { contentType: photo.contentType, upsert: false });
  if (error) return { ok: false, status: 500, error: 'Could not save the photo. Try again.' };

  const saved = await saveAccountPhotoPath(admin, userId, path);
  if (!saved.ok) await removePhotoObject(admin, path);
  return saved;
}
