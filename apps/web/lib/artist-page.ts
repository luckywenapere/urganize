// Small pure helpers for the artist pages, kept out of the components so they
// can be tested. The grouping rules live in lib/artist-overview.ts.

/** The artist pages need both flags, the way every artist route does: the page
 *  is built on the workspace roster, so without that flag there is no roster. */
export const isArtistPageEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_ARTIST_PAGE === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

/** Where a release opens: the catalogue's scoped view, the one place a rollout
 *  is worked. */
export const releaseHref = (releaseId: string): string =>
  `/dashboard?release=${encodeURIComponent(releaseId)}`;

/** An artist's page sits straight under /dashboard (Oct 30, 2026, founder:
 *  Home is the artist list, with no "artists" in the address). The old
 *  /dashboard/artists/<id> addresses redirect here (next.config.js). */
export const artistHref = (artistId: string): string =>
  `/dashboard/${encodeURIComponent(artistId)}`;

/** Every folder under app/dashboard. /dashboard/<x> is that page when x is one
 *  of these, and an artist's page otherwise. lib/dashboard-sections.test.ts
 *  holds this list to the folders on disk, so a new page cannot be read as an
 *  artist. */
export const DASHBOARD_SECTIONS: readonly string[] = [
  'artists',
  'audience',
  'cancel',
  'chappi',
  'credits',
  'directory',
  'distribute',
  'front-desk',
  'home',
  'notes',
  'opportunities',
  'pitching',
  'press-kits',
  'relationships',
  'releases',
  'settings',
  'tasks',
  'team',
  'trash',
  'urgans',
];

/** A record page: /dashboard/<artist>/records/<record> since Oct 30, 2026,
 *  and the old /dashboard/artists/<artist>/records/<record>, which redirects
 *  there. Group 1 is the record id. The one pattern for every reader (UrgAns'
 *  record scope, the onboarding trial sheet), so they cannot drift again. */
export const RECORD_PATH = /^\/dashboard\/(?:artists\/)?[^/]+\/records\/([^/?#]+)\/?$/;

export function isRecordPath(pathname: string | null | undefined): boolean {
  return RECORD_PATH.test(pathname ?? '');
}

/**
 * The rollout back arrow always lands on the rollout's artist (Oct 30, 2026;
 * never "wherever you came from", the founder's 2026-08-30 call). When the
 * page just before the rollout IS that artist page, it steps back in history
 * instead of replacing, so history does not hold the artist page twice and
 * the next Back is not a dead tap. Any other case replaces, as before.
 */
export function rolloutBackStepsBack(previous: string | null, artistPath: string, historyLength: number): boolean {
  if (!previous || historyLength < 2) return false;
  return previous.split(/[?#]/)[0].replace(/\/+$/, '') === artistPath;
}

/** The artist whose page (or record) a path is, or null for any other page. */
export function artistIdFromPath(pathname: string | null | undefined): string | null {
  const match = /^\/dashboard\/([^/?#]+)/.exec(pathname ?? '');
  if (!match || DASHBOARD_SECTIONS.includes(match[1])) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** A record in the making, under its artist in Catalogue (2026-10-27). */
export const recordHref = (artistId: string, recordId: string): string =>
  `${artistHref(artistId)}/records/${encodeURIComponent(recordId)}`;

/** "Oct 2, 2026" from a date-only string, or null for none or junk. Parsed as a
 *  LOCAL date so a release dated the 2nd never shows as the 1st west of UTC. */
export function formatCalendarDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

/** One plain sentence of what an artist has, for a card. Never prints a zero. */
export function describeArtistCounts(summary: {
  releases: number;
  planned: number;
  live: number;
}): string {
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (summary.releases > 0) parts.push(plural(summary.releases, 'release', 'releases'));
  if (summary.planned > 0) parts.push(`${summary.planned} planned`);
  if (summary.live > 0) parts.push(`${summary.live} out now`);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing yet';
}

/** The route that lists who works on one artist. Built here and not in the page
 *  because the word for the team's space is banned in anything a person reads,
 *  and the copy guard cannot tell a URL from a sentence. */
export const artistTeamUrl = (artistId: string): string =>
  `/api/workspace/artists/${encodeURIComponent(artistId)}/team`;
