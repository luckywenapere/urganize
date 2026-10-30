import type { ImportRelease } from './providers';

// What the Add an artist check screen says about the music coming in (#882):
// the latest release as "Aug 2026" and the first as its year.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function describeImportedMusic(releases: readonly Pick<ImportRelease, 'releaseDate'>[]): {
  latest: string | null;
  first: string | null;
} {
  const dates = releases
    .map((release) => release.releaseDate?.slice(0, 10) ?? '')
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  if (dates.length === 0) return { latest: null, first: null };
  const last = dates[dates.length - 1];
  return {
    latest: `${MONTHS[Number(last.slice(5, 7)) - 1]} ${last.slice(0, 4)}`,
    first: dates[0].slice(0, 4),
  };
}

/** A release out within this many days wears a "New" tag under Out now. */
export const NEW_RELEASE_DAYS = 30;

/** Pure: whether a released date (YYYY-MM-DD) is recent enough to mark as new. */
export function isNewRelease(releaseDate: string | null, today: string): boolean {
  if (!releaseDate) return false;
  const a = Date.parse(`${releaseDate.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const days = (b - a) / 86_400_000;
  return days >= 0 && days <= NEW_RELEASE_DAYS;
}
