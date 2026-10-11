import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASSET_UPLOAD_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  formatFileSize,
  generateSignedUrl,
  sanitizeFileName,
} from '@/lib/asset-helpers';
import {
  MAX_PROFILE_PHOTO_BYTES,
  PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS,
  isProfilePhotoMimeType,
} from '@/lib/profile-photo';

/**
 * Server half of profile photos (lib/profile-photo.ts has the why).
 *
 * READS NEVER THROW. A face is decoration on a roster or a directory card: a
 * missing column (migration not applied yet), an unreadable row or a signing
 * hiccup all answer "no photo" and the tile shows initials. The photo columns
 * are read in their OWN query so a problem here can never take the roster or
 * the directory down with it — the brand-colors precedent.
 */

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row => (value && typeof value === 'object' ? (value as Row) : {});

async function signAll(
  admin: SupabaseClient,
  rows: Array<{ key: string; path: string }>
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  await Promise.all(
    rows.map(async ({ key, path }) => {
      const url = await generateSignedUrl(admin, RELEASE_ASSETS_BUCKET, path, PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS);
      if (url) urls.set(key, url);
    })
  );
  return urls;
}

/** Signed photo URLs for these artists, keyed by artist id. */
export async function loadArtistPhotoUrls(admin: SupabaseClient, artistIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(artistIds.filter(Boolean)));
  if (!ids.length) return new Map();
  try {
    const { data, error } = await admin.from('artists').select('id, photo_path').in('id', ids);
    if (error || !data) return new Map();
    return signAll(
      admin,
      data
        .map(asRow)
        .filter((row) => typeof row.photo_path === 'string' && row.photo_path)
        .map((row) => ({ key: String(row.id), path: String(row.photo_path) }))
    );
  } catch {
    return new Map();
  }
}

/** Signed avatar URLs for these directory people, keyed by user id. */
export async function loadPersonPhotoUrls(admin: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return new Map();
  try {
    const { data, error } = await admin
      .from('person_profiles')
      .select('user_id, avatar_storage_path')
      .in('user_id', ids);
    if (error || !data) return new Map();
    return signAll(
      admin,
      data
        .map(asRow)
        .filter((row) => typeof row.avatar_storage_path === 'string' && row.avatar_storage_path)
        .map((row) => ({ key: String(row.user_id), path: String(row.avatar_storage_path) }))
    );
  } catch {
    return new Map();
  }
}

/** One signed URL for one stored path, or null. */
export async function signPhotoPath(admin: SupabaseClient, path: unknown): Promise<string | null> {
  if (typeof path !== 'string' || !path) return null;
  return generateSignedUrl(admin, RELEASE_ASSETS_BUCKET, path, PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS);
}

/** Best effort: drop a replaced or cleared photo so storage does not keep
 *  every face somebody ever tried. Never fails the save that called it. */
export async function removePhotoObject(admin: SupabaseClient, path: unknown): Promise<void> {
  if (typeof path !== 'string' || !path) return;
  try {
    await admin.storage.from(RELEASE_ASSETS_BUCKET).remove([path]);
  } catch {
    // Orphaned bytes in a private bucket cost cents; a failed save costs a user.
  }
}

/**
 * Step one of the three-step signed upload (workspace logo, curator photo):
 * validate the file the client describes, hand back a signed PUT URL under the
 * owner's prefix. The client PUTs the bytes, then saves the returned path.
 */
export async function signProfilePhotoUpload(
  admin: SupabaseClient,
  prefix: string,
  body: unknown,
  logTag: string
): Promise<NextResponse> {
  const input = asRow(body);
  const fileName = typeof input.file_name === 'string' ? input.file_name.trim() : '';
  if (!fileName) return NextResponse.json({ error: 'Pick a photo.' }, { status: 400 });

  const mimeType = typeof input.mime_type === 'string' ? input.mime_type.trim() : '';
  if (!isProfilePhotoMimeType(mimeType)) {
    return NextResponse.json({ error: 'Photo must be a JPEG, PNG or WebP image.' }, { status: 400 });
  }

  const fileSize = Number(input.file_size);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: 'That file looks empty.' }, { status: 400 });
  }
  if (fileSize > MAX_PROFILE_PHOTO_BYTES) {
    return NextResponse.json(
      { error: `Photo must be ${formatFileSize(MAX_PROFILE_PHOTO_BYTES)} or smaller.` },
      { status: 400 }
    );
  }

  const storagePath = `${prefix}${randomUUID()}-${sanitizeFileName(fileName)}`;
  const { data, error } = await admin.storage.from(RELEASE_ASSETS_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.signedUrl) {
    console.error(`[${logTag}] could not sign upload:`, error?.message);
    return NextResponse.json({ error: 'Could not start the upload. Try again.' }, { status: 500 });
  }

  return NextResponse.json({
    upload_url: data.signedUrl,
    storage_path: storagePath,
    expires_in: ASSET_UPLOAD_URL_TTL_SECONDS,
  });
}
