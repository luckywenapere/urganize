import { parseSearchTerms } from './task-search';
import type { DirectoryRole } from './directory-roles';
import type { PersonAvailability, ProfileRole } from '@/types/directory';
import type { ProfileType } from './directory-profile-type';

/**
 * The directory's filtering, and the counts its empty state needs.
 *
 * Pure and in lib/ for the reason lib/task-search.ts and lib/release-search.ts
 * both give: vitest collects lib/**\/*.test.ts and this repo has no component
 * tests, so ranking rules are only testable when they live here. It shares
 * `parseSearchTerms` with those two rather than re-splitting the query, so a
 * manager who has learned that word order does not matter in one search does
 * not discover that it does in this one.
 *
 * FILTERING HAPPENS HERE, IN THE BROWSER, over a set the page already fetched.
 * There is no text search anywhere in this repo and this phase deliberately did
 * not add one:
 *
 *   1. The empty state needs to say what exists NEARBY — how many if you drop
 *      the city, how many are open to work. With the whole set in hand those
 *      are free; querying per filter would need a round trip per suggestion.
 *   2. It is what this codebase already does three times over (task search,
 *      release search, the notes store).
 *   3. `ILIKE` treats `_` as a wildcard, which has already caused a real bug
 *      here — the credits route had to stop using it for email matching.
 */

/** The slice of a profile this needs. Structural, so the pure module never
 *  imports a component's props or a row type.
 *
 *  The filters below are GENERIC over anything carrying this shape rather than
 *  taking it directly, so a caller with extra fields — the page's cards carry a
 *  slug and a visibility flag — gets its own type back instead of a narrowed
 *  one. The alternative was a cast at the call site, which is exactly where a
 *  wrong assumption would stop being checked. */
export type DirectoryEntry = {
  userId: string;
  displayName: string;
  city: string | null;
  availability: PersonAvailability;
  /** Claimed and delivered together, as profileRoles builds them. Filtering by
   *  role matches EITHER: somebody who has delivered artwork and somebody who
   *  says they design are both answers to "find me a designer", and the card
   *  shows which is which. */
  roles: ProfileRole[];
  /** The effective type, derived or overridden. Absent on older callers. */
  profileType?: ProfileType | null;
};

export type DirectoryFilters = {
  query: string;
  role: DirectoryRole | null;
  city: string | null;
  availability: PersonAvailability | null;
  /** Optional so callers that never set it keep compiling. */
  profileType?: ProfileType | null;
};

const normalize = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase();

const hasRole = (entry: DirectoryEntry, role: DirectoryRole): boolean =>
  entry.roles.some((held) => held.role === role);

const matchesCity = (entry: DirectoryEntry, city: string | null): boolean =>
  !city || normalize(entry.city) === normalize(city);

const matchesAvailability = (
  entry: DirectoryEntry,
  availability: PersonAvailability | null
): boolean => !availability || entry.availability === availability;

/**
 * Rank for one person, or null when the query excludes them.
 *
 *   0  the name starts with what was typed
 *   1  every term appears somewhere in the name
 *
 * Deliberately only two tiers and only the NAME. A role is a filter, not
 * something to fuzzy match, and matching a bio would rank somebody who
 * mentioned a city above somebody who lives in it.
 */
function rankName(entry: DirectoryEntry, terms: string[], joined: string): 0 | 1 | null {
  const name = entry.displayName.toLowerCase();
  if (name.startsWith(joined)) return 0;
  if (terms.every((term) => name.includes(term))) return 1;
  return null;
}

/**
 * The visible list.
 *
 * AN EMPTY QUERY RETURNS EVERYONE, which is the opposite of `searchTasks` and
 * the same as `searchReleases`. The difference is what the surface is: this bar
 * filters a list that is already on screen, so an empty box means "no filter".
 * The activity search is a palette that appears on demand, so an empty box
 * there means "nothing asked for yet". Copying the wrong sibling here would
 * leave the directory blank on arrival.
 */
export function applyDirectoryFilters<T extends DirectoryEntry>(
  entries: T[],
  filters: DirectoryFilters
): T[] {
  const narrowed = entries.filter(
    (entry) =>
      (!filters.role || hasRole(entry, filters.role)) &&
      matchesCity(entry, filters.city) &&
      matchesAvailability(entry, filters.availability) &&
      (!filters.profileType || entry.profileType === filters.profileType)
  );

  const terms = parseSearchTerms(filters.query);
  if (terms.length === 0) return narrowed;

  const joined = terms.join(' ');
  return narrowed
    .map((entry) => ({ entry, rank: rankName(entry, terms, joined) }))
    .filter((scored): scored is { entry: T; rank: 0 | 1 } => scored.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.entry.displayName.localeCompare(b.entry.displayName))
    .map((scored) => scored.entry);
}

export type FallbackCounts = {
  /** How many match if the city filter is dropped. Null when no city is set,
   *  because suggesting you drop a filter you never chose is nonsense. */
  withoutCity: number | null;
  withoutRole: number | null;
  /** Everyone open to work, whatever else is filtered. Always a number: it is
   *  a standing offer rather than a relaxation of what was asked. */
  openToWork: number;
};

/**
 * What to offer when the result set is empty.
 *
 * COUNTED FROM THE WHOLE SET, never from the filtered one. That is the entire
 * rule: computed from the filtered list every suggestion reads zero, and an
 * empty state offering "0 more if you drop the city" is worse than one that
 * says nothing at all.
 *
 * Every number here is real. A count that cannot be computed is null and its
 * line does not render, because the brief allows no invented numbers anywhere,
 * empty states included.
 */
export function fallbackCounts<T extends DirectoryEntry>(
  entries: T[],
  filters: DirectoryFilters
): FallbackCounts {
  const withoutCity = filters.city
    ? applyDirectoryFilters(entries, { ...filters, city: null }).length
    : null;

  const withoutRole = filters.role
    ? applyDirectoryFilters(entries, { ...filters, role: null }).length
    : null;

  const openToWork = entries.filter((entry) => entry.availability === 'open').length;

  return { withoutCity, withoutRole, openToWork };
}

/** The cities that actually have somebody in them, for the filter control.
 *  Derived rather than typed, so a filter can never offer an empty city. */
export function availableCities<T extends DirectoryEntry>(entries: T[]): string[] {
  const cities = new Map<string, string>();
  for (const entry of entries) {
    const key = normalize(entry.city);
    if (key && !cities.has(key)) cities.set(key, (entry.city ?? '').trim());
  }
  return [...cities.values()].sort((a, b) => a.localeCompare(b));
}
