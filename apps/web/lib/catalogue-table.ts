// The Catalogue's rollouts table, as pure logic (design overhaul, 2026-10-04).
//
// One row per rollout, filtered by the artist the manager chose in the top bar,
// a status chip and the search box, and sorted by what they asked for. The
// component only draws what this returns, so the rules are testable here
// (vitest collects lib/** and this repo has no component tests).
//
// It shares `searchReleases` with the old catalogue search so word order and
// artist-name matching behave exactly as they always did.

import { searchReleases } from '@/lib/release-search';
import { isRecapEligible } from './recap-eligibility';

export type CatalogueNextTask = { title: string; dueDate: string | null };

export type CatalogueRow = {
  id: string;
  title: string;
  artistId: string | null;
  artistName: string | null;
  /** The status the Catalogue SHOWS: `displayStatus` of the stored one, so a
   *  rollout whose day has passed reads Released. Filters and chip counts read
   *  this too, so the pill and the chip a row sits under always agree. */
  status: string;
  releaseDate: string | null;
  tasksDone: number;
  tasksTotal: number;
  coverArtUrl: string | null;
  /** Small display copy of the cover (lib/image-thumb.ts); null: use coverArtUrl. */
  coverThumbUrl?: string | null;
  isTest: boolean;
  /** The soonest unfinished activity, or null when nothing is left to do. */
  nextTask: CatalogueNextTask | null;
};

export type StatusFilterKey = 'all' | 'planning' | 'active' | 'released' | 'archived';

export const STATUS_FILTERS: Array<{ key: StatusFilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'planning', label: 'Planning' },
  { key: 'active', label: 'In progress' },
  { key: 'released', label: 'Released' },
  { key: 'archived', label: 'Archived' },
];

export type SortKey = 'recent' | 'date' | 'progress';

export const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'recent', label: 'Newest first' },
  { key: 'date', label: 'Release date' },
  { key: 'progress', label: 'Least done first' },
];

/** The group a stored status belongs to. Unknown values count as planning: the
 *  safe answer for a status we have not seen is "still being worked on". */
export function statusGroup(status: string): Exclude<StatusFilterKey, 'all'> {
  switch (status) {
    case 'in_progress':
    case 'ready':
      return 'active';
    case 'released':
      return 'released';
    case 'archived':
      return 'archived';
    default:
      return 'planning';
  }
}

/**
 * The status to show for a rollout. Nothing in the product writes the
 * `released` status, so a stored `draft` stays `draft` forever, and every
 * rollout used to read Draft in the Catalogue, long after its release day.
 *
 * This derives `released` for DISPLAY ONLY, from the product's one existing
 * answer to "has this release happened" (`isRecapEligible` in
 * lib/recap-eligibility.ts: release day has arrived, or every activity is
 * done). It is not a third definition, and it writes nothing: the stored
 * status, the schema and every other reader are unchanged.
 *
 * Archived stays archived (`isRecapEligible` treats it as happened, but a
 * rollout someone put away must not reappear under Released). Anything that
 * has not happened keeps its stored status.
 */
export function displayStatus(
  row: Pick<CatalogueRow, 'status' | 'releaseDate' | 'tasksDone' | 'tasksTotal'>,
  now: Date = new Date()
): string {
  if (row.status === 'archived' || row.status === 'released') return row.status;
  const happened = isRecapEligible(
    { releaseDate: row.releaseDate, status: row.status },
    { totalTasks: row.tasksTotal, allTasksDone: row.tasksDone >= row.tasksTotal },
    now
  );
  return happened ? 'released' : row.status;
}

export type CatalogueFilters = {
  query: string;
  /** The top bar's artist, or null for everyone. */
  artistId: string | null;
  status: StatusFilterKey;
};

/** "All" means everything still in play: an archived rollout is out of the way
 *  until somebody asks for it by name. */
export function filterCatalogueRows(rows: CatalogueRow[], filters: CatalogueFilters): CatalogueRow[] {
  let out = rows;
  if (filters.artistId) {
    out = out.filter((row) => row.artistId === filters.artistId);
  }
  out =
    filters.status === 'all'
      ? out.filter((row) => statusGroup(row.status) !== 'archived')
      : out.filter((row) => statusGroup(row.status) === filters.status);

  if (filters.query.trim()) {
    const matched = searchReleases(
      out.map((row) => ({ release: { title: row.title, artistName: row.artistName }, row })),
      filters.query
    );
    out = matched.map((entry) => entry.row);
  }
  return out;
}

export function progressPercent(row: Pick<CatalogueRow, 'tasksDone' | 'tasksTotal'>): number {
  return row.tasksTotal > 0 ? Math.round((row.tasksDone / row.tasksTotal) * 100) : 0;
}

/** Sorted copy. `recent` keeps the incoming order (the store's own, newest
 *  created first). Ties always keep the incoming order too, so a sort never
 *  shuffles rows that are equal. */
export function sortCatalogueRows(rows: CatalogueRow[], sort: SortKey): CatalogueRow[] {
  if (sort === 'recent') return rows;
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    let diff = 0;
    if (sort === 'date') {
      // Soonest first; undated rollouts go last because they have no date to be
      // soonest at.
      const aTime = a.row.releaseDate ? Date.parse(a.row.releaseDate) : Number.POSITIVE_INFINITY;
      const bTime = b.row.releaseDate ? Date.parse(b.row.releaseDate) : Number.POSITIVE_INFINITY;
      diff = aTime === bTime ? 0 : aTime < bTime ? -1 : 1;
    } else {
      diff = progressPercent(a.row) - progressPercent(b.row);
    }
    return diff !== 0 ? diff : a.index - b.index;
  });
  return indexed.map((entry) => entry.row);
}

/** How many rows each status chip would show, so a chip can say "(3)" before it
 *  is pressed. Counts respect the artist and the search, but not the chip
 *  itself. */
export function statusCounts(
  rows: CatalogueRow[],
  filters: Pick<CatalogueFilters, 'query' | 'artistId'>
): Record<StatusFilterKey, number> {
  const counts = {} as Record<StatusFilterKey, number>;
  for (const { key } of STATUS_FILTERS) {
    counts[key] = filterCatalogueRows(rows, { ...filters, status: key }).length;
  }
  return counts;
}

/** The soonest unfinished activity: earliest due date first, undated ones after
 *  the dated ones, and the incoming order as the tiebreak. */
export function pickNextTask(
  tasks: Array<{ title: string; status: string; dueDate: string | null }>
): CatalogueNextTask | null {
  let bestTime = Number.POSITIVE_INFINITY;
  let best: CatalogueNextTask | null = null;
  for (const task of tasks) {
    // Closed either way (URG-389): a cancelled activity is never "next".
    if (task.status === 'done' || task.status === 'cancelled') continue;
    const parsed = task.dueDate ? Date.parse(task.dueDate) : Number.POSITIVE_INFINITY;
    const time = Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
    if (best === null || time < bestTime) {
      best = { title: task.title, dueDate: task.dueDate };
      bestTime = time;
    }
  }
  return best;
}
