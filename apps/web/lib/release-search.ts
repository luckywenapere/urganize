import { parseSearchTerms } from './task-search';

// The filter behind the catalog's "Search release" bar (2026-08-31, founder
// request). Pure and in lib/ for the same reason lib/task-search.ts is:
// vitest.config.ts collects lib/**/*.test.ts and this repo has no component
// tests, so ranking rules are only testable when they live here.
//
// It shares `parseSearchTerms` with the activity search rather than re-splitting
// the query, so a manager who has learned that word order does not matter in one
// search does not discover that it does in the other.

/** The shape this needs off a catalog card — a structural slice, so the pure
 *  module never has to import the component's own prop types. */
export type SearchableRelease = {
  release: { title: string; artistName: string | null };
};

/**
 * Tier for one release, or null when it does not match. Lower ranks first:
 *
 *   0  the title starts with what was typed
 *   1  every term is somewhere in the title
 *   2  every term is somewhere in title + artist name
 *
 * Artist ranks last so that typing an artist's name still finds their releases
 * while never pushing an exact title match down the list. It is included at all
 * because a roster account (artist rosters, 2026-08-30) genuinely has releases
 * it would look for by artist rather than by title.
 */
function rankRelease(entry: SearchableRelease, terms: string[], joined: string): 0 | 1 | 2 | null {
  const title = entry.release.title.toLowerCase();
  if (title.startsWith(joined)) return 0;
  if (terms.every((term) => title.includes(term))) return 1;
  const artist = (entry.release.artistName ?? '').toLowerCase();
  if (terms.every((term) => `${title} ${artist}`.includes(term))) return 2;
  return null;
}

/**
 * Releases matching `query`, ranked.
 *
 * An empty query returns the list UNCHANGED — the opposite of `searchTasks`,
 * and the difference is what each surface is. This bar FILTERS the catalog: an
 * empty box means "no filter", so the catalog has to be all of it. The activity
 * search is a palette that appears on demand, so an empty box there means
 * "nothing asked for yet" and returning everything would just duplicate the
 * list underneath it.
 *
 * Order within a tier is the incoming order, which is the store's own ordering —
 * Array.prototype.sort is stable per spec (ES2019), so a 0 from the comparator
 * means "leave these as they were".
 */
export function searchReleases<T extends SearchableRelease>(releases: T[], query: string): T[] {
  const terms = parseSearchTerms(query);
  if (terms.length === 0) return releases;

  const joined = terms.join(' ');
  const scored: { entry: T; tier: number }[] = [];

  releases.forEach((entry) => {
    const tier = rankRelease(entry, terms, joined);
    if (tier === null) return;
    scored.push({ entry, tier });
  });

  scored.sort((a, b) => a.tier - b.tier);
  return scored.map((item) => item.entry);
}
