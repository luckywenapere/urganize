/**
 * Your own photo on your account (2026-10-30, founder approved mocks v3).
 * The face your team sees on the top bar, the Team page and the assignee
 * picker. Behind NEXT_PUBLIC_FEATURE_PROFILE_PHOTO (off unless 'true').
 *
 * It is NOT the directory photo. That one lives at person/<uid>/avatar/ and is
 * part of a published profile; this one lives at account/<uid>/photo/ in the
 * same private bucket, so adding an account photo never touches or publishes
 * a directory profile. See docs/notes/2026-10-30-profile-photo.md.
 *
 * Pure: constants and rules only, shared by client, server and tests.
 */

import { PROFILE_PHOTO_MIME_TYPES } from '@/lib/profile-photo';

export function isAccountPhotoEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_PROFILE_PHOTO === 'true';
}

export const accountPhotoPathPrefix = (userId: string): string => `account/${userId}/photo/`;

/** One file name directly under the folder: the shape signProfilePhotoUpload
 *  makes (uuid + sanitized name) and the shape the Google copy uses. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const USER_ID = /^[A-Za-z0-9-]+$/;

/**
 * Whether `path` is a photo file in this user's own account folder. Stricter
 * than isOwnPhotoPath: one segment after the prefix, a safe character set, no
 * dot-dot anywhere, no thumb, so a stored value can never point the signer at
 * another person's file or another part of the bucket.
 */
export function isOwnAccountPhotoPath(path: unknown, userId: string): path is string {
  if (typeof path !== 'string' || !path || path.length > 512) return false;
  if (!userId || !USER_ID.test(userId)) return false;
  const prefix = accountPhotoPathPrefix(userId);
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  if (!name || name.length > 200) return false;
  if (!FILE_NAME.test(name)) return false;
  if (name.includes('..')) return false;
  if (name.endsWith('.thumb')) return false;
  return true;
}

export type AccountPhotoInput =
  | { kind: 'absent' }
  | { kind: 'clear' }
  | { kind: 'set'; path: string }
  | { kind: 'error'; error: string };

/** The `photoPath` field of PUT /api/account/photo: string sets, null clears. */
export function parseAccountPhotoInput(body: unknown, userId: string): AccountPhotoInput {
  if (!body || typeof body !== 'object' || !('photoPath' in body)) return { kind: 'absent' };
  const value = (body as { photoPath?: unknown }).photoPath;
  if (value === null) return { kind: 'clear' };
  if (isOwnAccountPhotoPath(value, userId)) return { kind: 'set', path: value };
  return { kind: 'error', error: 'That photo is not yours.' };
}

// ── Google ───────────────────────────────────────────────────────────────────

const GOOGLE_PHOTO_HOST_SUFFIX = '.googleusercontent.com';

/**
 * The only URLs the server will fetch a Google photo from: https on the
 * default port, no credentials, a host ending in .googleusercontent.com.
 * The server fetches it, so this is the SSRF fence.
 */
export function isAllowedGooglePhotoUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase();
  return host.endsWith(GOOGLE_PHOTO_HOST_SUFFIX) && host.length > GOOGLE_PHOTO_HOST_SUFFIX.length;
}

/** Google hands out a 96px picture (`=s96-c`); ask for 512px instead. */
export function upsizeGooglePhotoUrl(url: string): string {
  return url.replace(/=s\d+-c$/, '=s512-c');
}

type IdentityLike = { provider?: unknown; identity_data?: unknown };

/** The Google picture on the account's own identities (read server side with
 *  the admin client, never from the browser), or null. */
export function googlePictureFromIdentities(identities: unknown): string | null {
  if (!Array.isArray(identities)) return null;
  for (const identity of identities as IdentityLike[]) {
    if (!identity || identity.provider !== 'google') continue;
    const data = identity.identity_data;
    if (!data || typeof data !== 'object') continue;
    const record = data as Record<string, unknown>;
    for (const candidate of [record.picture, record.avatar_url]) {
      if (isAllowedGooglePhotoUrl(candidate)) return upsizeGooglePhotoUrl(candidate);
    }
  }
  return null;
}

/** A fetched image's type, if it is one we store. */
export function normalizePhotoContentType(value: unknown): (typeof PROFILE_PHOTO_MIME_TYPES)[number] | null {
  if (typeof value !== 'string') return null;
  const type = value.split(';')[0].trim().toLowerCase();
  return (PROFILE_PHOTO_MIME_TYPES as readonly string[]).includes(type)
    ? (type as (typeof PROFILE_PHOTO_MIME_TYPES)[number])
    : null;
}

export const GOOGLE_PHOTO_FETCH_TIMEOUT_MS = 8000;

// ── Client timing ────────────────────────────────────────────────────────────

/** Signed photo URLs live an hour; ask for a fresh one after 45 minutes. */
export const ACCOUNT_PHOTO_REFRESH_MS = 45 * 60 * 1000;

export function shouldRefreshAccountPhoto(fetchedAt: number | null, now: number): boolean {
  return fetchedAt === null || now - fetchedAt >= ACCOUNT_PHOTO_REFRESH_MS;
}

// ── The invitee step ─────────────────────────────────────────────────────────

export const invitePhotoSeenKey = (userId: string): string => `urganize.account_photo.invite_seen.${userId}`;

export function shouldOfferInvitePhoto(input: { enabled: boolean; hasPhoto: boolean; seen: boolean }): boolean {
  return input.enabled && !input.hasPhoto && !input.seen;
}

export type AccountPhotoPlace = 'onboarding_team' | 'invite_accept' | 'settings';

// ── A photo that will not load ───────────────────────────────────────────────

/** How long after one fresh-link retry the faces wait before another. */
export const BROKEN_PHOTO_RETRY_MS = 5 * 60 * 1000;

/**
 * Whether a face whose photo failed to load may ask for a fresh link now.
 * Every fresh link is a new url, so "once per url" never stops when the image
 * itself is blocked or unreadable; this is once per five minutes instead,
 * shared by every face on screen.
 */
export function mayRetryBrokenPhoto(lastRetryAt: number | null, now: number): boolean {
  return lastRetryAt === null || now - lastRetryAt >= BROKEN_PHOTO_RETRY_MS;
}

/**
 * A member list with every signed photo link removed, for saving to the
 * device. Signed links are credentials and expire within the hour, so they
 * never go to localStorage (the lib/scene-cache.ts rule); the next fetch
 * brings fresh ones.
 */
export function withoutSignedPhotos<T extends { avatarUrl?: string | null }>(members: readonly T[]): T[] {
  return members.map((member) => ({ ...member, avatarUrl: null }));
}
