import { DIRECTORY_ROLE_LABELS, type DirectoryRole } from './directory-roles';
import { PROFILE_TYPE_LABELS, type ProfileType } from './directory-profile-type';
import type { ProfileRole } from '@/types/directory';

// Pure rules for the claimed /p/{slug} page and its 9:16 share card (URG-305).
// Anything the page lacks is HIDDEN, never filled with placeholder copy.

/** The one-line hype under the name, max length typed in the claim flow. */
export const HYPE_LINE_MAX_CHARS = 90;
/** Faces drawn in the "Managing" row and on the share card. */
export const MANAGED_FACES_SHOWN = 4;
/** Tiles in the credits grid. */
export const CREDIT_TILES_SHOWN = 9;

export type ManagedFace = { id: string; name: string; photoUrl: string | null };
export type CreditTile = { id: string; coverUrl: string };

/** The bio's first line, trimmed and capped; null when there is none. */
export function hypeLine(bio: string | null | undefined): string | null {
  const first = (bio || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!first) return null;
  return first.length > HYPE_LINE_MAX_CHARS ? `${first.slice(0, HYPE_LINE_MAX_CHARS - 1).trimEnd()}…` : first;
}

/** "Manager · Lagos". Proven roles before claimed ones; the type as a fallback. */
export function roleLine(input: {
  roles: readonly ProfileRole[];
  profileType: ProfileType | null;
  city: string | null | undefined;
}): string | null {
  const proven = input.roles.find((entry) => entry.delivered > 0);
  const anyRole = proven ?? input.roles[0];
  const role = anyRole
    ? DIRECTORY_ROLE_LABELS[anyRole.role as DirectoryRole] ?? null
    : input.profileType
      ? PROFILE_TYPE_LABELS[input.profileType]
      : null;
  const city = (input.city || '').trim() || null;
  const parts = [role, city].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(' · ') : null;
}

/** Named artists only; ones with a photo first; at most MANAGED_FACES_SHOWN. */
export function pickManagedFaces<T extends { id: string; name: string; photoPath: string | null }>(rows: readonly T[]): T[] {
  return rows
    .filter((row) => row.id && row.name.trim())
    .map((row, index) => ({ row, index }))
    .sort((a, b) => Number(Boolean(b.row.photoPath)) - Number(Boolean(a.row.photoPath)) || a.index - b.index)
    .slice(0, MANAGED_FACES_SHOWN)
    .map(({ row }) => row);
}

/** Releases with artwork, newest first, at most CREDIT_TILES_SHOWN. */
export function pickCreditTiles<T extends { id: string; artworkAssetId: string | null; releaseDate: string | null }>(
  rows: readonly T[]
): T[] {
  return rows
    .filter((row) => row.id && row.artworkAssetId)
    .sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''))
    .slice(0, CREDIT_TILES_SHOWN);
}

/** Initials for a face with no photo. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '·';
}

/** The share card's image route for a page. */
export function shareCardPath(slug: string): string {
  return `/p/${encodeURIComponent(slug)}/card`;
}

/** "app.urganize.app/p/tobi" from a full url: what the card prints. The host
 *  stays whole, so the printed link is one that works when typed. */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}
