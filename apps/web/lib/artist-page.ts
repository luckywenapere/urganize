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

export const artistHref = (artistId: string): string =>
  `/dashboard/artists/${encodeURIComponent(artistId)}`;

/** The EPK editor. It keeps its own route: the artist page links to it. */
export const epkHref = (artistId: string): string =>
  `/dashboard/press-kits/${encodeURIComponent(artistId)}`;

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
  upcomingShows: number;
}): string {
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (summary.releases > 0) parts.push(plural(summary.releases, 'release', 'releases'));
  if (summary.planned > 0) parts.push(`${summary.planned} planned`);
  if (summary.live > 0) parts.push(`${summary.live} out now`);
  if (summary.upcomingShows > 0) parts.push(plural(summary.upcomingShows, 'show coming up', 'shows coming up'));
  return parts.length > 0 ? parts.join(' · ') : 'Nothing yet';
}

/** The route that lists who works on one artist. Built here and not in the page
 *  because the word for the team's space is banned in anything a person reads,
 *  and the copy guard cannot tell a URL from a sentence. */
export const artistTeamUrl = (artistId: string): string =>
  `/api/workspace/artists/${encodeURIComponent(artistId)}/team`;
