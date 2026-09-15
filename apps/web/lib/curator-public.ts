/**
 * What a curator's public page shows, and to whom.
 *
 * Pure, so the page, the loader and the tests all hold the same rules without a
 * database. The loading half is lib/curator-public-server.ts.
 *
 * THE PAYLOAD BUILDER BELOW IS THE ENTIRE PRIVACY BOUNDARY FOR THIS SURFACE,
 * and that is unusual enough to say plainly. curator_profiles and
 * curator_playlists have owner-only select policies and no insert policy at
 * all, so a public page cannot be served through RLS — the loader uses a
 * service-role client, which can read every column of every curator. What stops
 * a stranger seeing something they should not is this file, not the database.
 */

import { suggestSlug } from './person-profile';
import type { PitchPlatform } from '@/types/pitching';

/** Mirrors curator_profiles_slug_shape_check. */
export const CURATOR_SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MIN_CURATOR_SLUG_LENGTH = 2;
export const MAX_CURATOR_SLUG_LENGTH = 60;

/**
 * A handle from a curator's display name.
 *
 * Deliberately the directory's builder rather than a third copy. There are
 * already two in this repo and they differ on one point — the press kit turns
 * "D'Prince" into `d-prince`, the directory into `dprince` — and a curator's
 * display name is a PERSON'S NAME, which is the case the directory's version
 * was written for: it normalizes accents and drops apostrophes instead of
 * turning them into hyphens. Sharing it means a person who is both a curator
 * and in the directory cannot end up with two differently spelled handles,
 * which is the same reason the two tables share a shape check.
 */
export { suggestSlug as suggestCuratorSlug };

/** Whether a slug somebody typed is one the database will accept. */
export function isValidCuratorSlug(slug: string): boolean {
  return (
    slug.length >= MIN_CURATOR_SLUG_LENGTH &&
    slug.length <= MAX_CURATOR_SLUG_LENGTH &&
    CURATOR_SLUG_SHAPE.test(slug)
  );
}

/**
 * Whether the public page renders at all.
 *
 * `published_at` is the only gate, and it is deliberately a different column
 * from the slug. An unpublished page is a 404 indistinguishable from a slug
 * nobody ever had — the same refusal the press kit and the EPK link both make,
 * so that taking a page down never tells a stranger it once existed.
 */
export function isCuratorPageLive(publishedAt: string | null | undefined): boolean {
  return Boolean(publishedAt);
}

/** Where a curator's page lives. */
export function curatorPagePath(slug: string): string {
  return `/pitch/${slug}`;
}

export type PublicCuratorPlaylist = {
  id: string;
  name: string;
  platform: PitchPlatform;
  genres: string[];
  followerCount: number | null;
  url: string;
};

export type PublicCuratorPage = {
  slug: string;
  displayName: string;
  bio: string;
  photoUrl: string | null;
  playlists: PublicCuratorPlaylist[];
};

/**
 * Every key a stranger is allowed to see. The test asserts the payload's keys
 * are EXACTLY this, so a column added to curator_profiles three months from now
 * cannot arrive on the public page by accident.
 */
export const PUBLIC_CURATOR_PAGE_KEYS: readonly (keyof PublicCuratorPage)[] = [
  'slug',
  'displayName',
  'bio',
  'photoUrl',
  'playlists',
];

export const PUBLIC_CURATOR_PLAYLIST_KEYS: readonly (keyof PublicCuratorPlaylist)[] = [
  'id',
  'name',
  'platform',
  'genres',
  'followerCount',
  'url',
];

type ProfileRow = {
  slug?: unknown;
  display_name?: unknown;
  bio?: unknown;
  [key: string]: unknown;
};

type PlaylistRow = {
  id?: unknown;
  name?: unknown;
  platform?: unknown;
  genres?: unknown;
  follower_count?: unknown;
  url?: unknown;
  [key: string]: unknown;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Build the public payload FIELD BY FIELD.
 *
 * Never `{ ...row }`, and never a denylist. The query legitimately reads
 * columns this page must not show — `user_id`, because the playlists are found
 * by it, and `photo_path`, because it has to be signed — so a spread with a few
 * keys deleted would leak the next column somebody adds. Naming what goes out
 * is the only version of this that stays correct without anyone remembering to
 * update it.
 */
export function buildPublicCuratorPayload(
  profile: ProfileRow,
  playlists: readonly PlaylistRow[],
  photoUrl: string | null
): PublicCuratorPage | null {
  const slug = text(profile.slug).trim();
  const displayName = text(profile.display_name).trim();

  // A page with no name is not a page. Both are guaranteed by the schema, so
  // reaching this means something is wrong and a 404 beats a blank header.
  if (!slug || !displayName) return null;

  return {
    slug,
    displayName,
    bio: text(profile.bio).trim(),
    photoUrl: photoUrl || null,
    playlists: playlists
      .map((row) => buildPublicCuratorPlaylist(row))
      .filter((row): row is PublicCuratorPlaylist => row !== null),
  };
}

function buildPublicCuratorPlaylist(row: PlaylistRow): PublicCuratorPlaylist | null {
  const id = text(row.id).trim();
  const name = text(row.name).trim();
  if (!id || !name) return null;

  const followerCount =
    typeof row.follower_count === 'number' && Number.isFinite(row.follower_count)
      ? row.follower_count
      : null;

  return {
    id,
    name,
    platform: (text(row.platform) || 'other') as PitchPlatform,
    genres: Array.isArray(row.genres) ? row.genres.filter((g): g is string => typeof g === 'string') : [],
    followerCount,
    url: text(row.url).trim(),
  };
}

/**
 * The line a link preview shows.
 *
 * Her own bio when she wrote one, else a plain sentence built from her name.
 * Never an invented one: an empty description beats a confident sentence
 * nobody wrote, which is also what the copy guard's invented-number rule is
 * there to stop.
 */
export function curatorPageDescription(page: PublicCuratorPage): string {
  const bio = page.bio.trim();
  if (bio) return bio.length > 300 ? `${bio.slice(0, 297).trimEnd()}...` : bio;
  return `Pitch your music to ${page.displayName} on Urganize.`;
}
