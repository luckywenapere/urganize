/**
 * Profile photos: one face per artist on the roster and one per person in the
 * directory (founder ask, 2026-10-11).
 *
 * WHY. The Artists list and the directory were rows of names. A manager scans a
 * roster by face long before they read it, and a directory of people you might
 * hire is a person-to-person moment — the same reasoning that put curators'
 * faces at the front of pitching. Somebody with no photo still gets a tile that
 * looks chosen (gradient + initials, components/shared/ProfileFace.tsx), so the
 * list never looks broken while it fills in.
 *
 * STORAGE. Both live in the private release-assets bucket, each under its own
 * prefix, and are read through short-lived signed URLs minted per response —
 * never stored, never public. The save routes refuse any path outside the
 * caller's own prefix, so nobody can point their face at another team's files.
 *
 * Pure: constants and path rules only, so client and server share them.
 */

/** A photo is a small square avatar. Big enough for a retina tile, small
 *  enough that a phone upload never stalls; the client downsizes first. */
export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

export const PROFILE_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** How long a signed photo URL lives. Matches the release-asset TTL. */
export const PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const artistPhotoPathPrefix = (artistId: string): string => `artist/${artistId}/photo/`;

export const personPhotoPathPrefix = (userId: string): string => `person/${userId}/avatar/`;

export function isProfilePhotoMimeType(value: unknown): boolean {
  return typeof value === 'string' && (PROFILE_PHOTO_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Whether a path handed back by the client may be saved under this prefix.
 * Rejects traversal and anything outside the owner's own folder.
 */
export function isOwnPhotoPath(path: unknown, prefix: string): path is string {
  if (typeof path !== 'string' || !path) return false;
  if (!path.startsWith(prefix)) return false;
  if (path.includes('..') || path.includes('//')) return false;
  return path.length > prefix.length && path.length <= 512;
}

/** Parse the `photoPath` field of a save body: a string sets, null clears,
 *  absent leaves it alone. */
export function parsePhotoPathInput(
  body: unknown,
  prefix: string
): { kind: 'absent' } | { kind: 'clear' } | { kind: 'set'; path: string } | { kind: 'error'; error: string } {
  if (!body || typeof body !== 'object' || !('photoPath' in body)) return { kind: 'absent' };
  const value = (body as { photoPath?: unknown }).photoPath;
  if (value === null) return { kind: 'clear' };
  if (isOwnPhotoPath(value, prefix)) return { kind: 'set', path: value };
  return { kind: 'error', error: 'That photo is not yours.' };
}
