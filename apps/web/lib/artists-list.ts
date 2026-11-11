import { bucketReleases, type OverviewRelease } from './artist-overview';

// The pure half of the Artists list (2026-10-29, #878, mock
// docs/mocks/artists-list, direction B): one row per artist with their next
// rollout, when it drops and where its tasks stand, plus the one rollout that
// drops soonest across the roster for the spotlight on top.

const DAY_MS = 86_400_000;

export type ListTask = { releaseId: string | null; status: string; dueDate: string | null };

/** What a row says about an artist, in the words the page shows. */
export type ArtistStatus = 'rolling_out' | 'out_now' | 'quiet';

export type ArtistListRow<A, R> = {
  artist: A;
  /** The nearest planned rollout, else the newest one just out, else null. */
  next: R | null;
  status: ArtistStatus;
  /** Whole days from today to `next`'s date; negative once out; null with no date. */
  daysToGo: number | null;
  done: number;
  total: number;
  dueThisWeek: number;
  late: number;
};

const dayNumber = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.round(parsed / DAY_MS) : null;
};

/**
 * Rows in roster order, and the spotlight: the planned rollout with the
 * soonest date across every artist. A rollout with no date yet never takes the
 * spotlight (there is no countdown to show). `today` is a YYYY-MM-DD day
 * (Lagos on the page); task counts are whatever tasks the viewer can see.
 */
export function artistsList<A extends { id: string }, R extends OverviewRelease>({
  artists,
  releases,
  tasks,
  today,
  now = new Date(),
}: {
  artists: A[];
  releases: R[];
  tasks: ListTask[];
  today: string;
  now?: Date;
}): { rows: ArtistListRow<A, R>[]; spotlight: ArtistListRow<A, R> | null } {
  const todayN = dayNumber(today) ?? 0;
  const tasksByRelease = new Map<string, ListTask[]>();
  for (const task of tasks) {
    if (!task.releaseId) continue;
    const list = tasksByRelease.get(task.releaseId) ?? [];
    list.push(task);
    tasksByRelease.set(task.releaseId, list);
  }

  const rows = artists.map((artist): ArtistListRow<A, R> => {
    const buckets = bucketReleases(
      releases.filter((release) => release.artistId === artist.id),
      now
    );
    const next = buckets.planned[0] ?? buckets.live[0] ?? null;
    const status: ArtistStatus = buckets.planned[0] ? 'rolling_out' : buckets.live[0] ? 'out_now' : 'quiet';
    const mine = next ? tasksByRelease.get(next.id) ?? [] : [];
    const open = mine.filter((task) => task.status !== 'done');
    const date = next ? dayNumber(next.releaseDate) : null;
    return {
      artist,
      next,
      status,
      daysToGo: date === null ? null : date - todayN,
      done: mine.length - open.length,
      total: mine.length,
      dueThisWeek: open.filter((task) => {
        const due = dayNumber(task.dueDate);
        return due !== null && due >= todayN && due < todayN + 7;
      }).length,
      late: open.filter((task) => {
        const due = dayNumber(task.dueDate);
        return due !== null && due < todayN;
      }).length,
    };
  });

  let spotlight: ArtistListRow<A, R> | null = null;
  for (const row of rows) {
    if (row.status !== 'rolling_out' || row.daysToGo === null) continue;
    if (!spotlight || row.daysToGo < (spotlight.daysToGo ?? Infinity)) spotlight = row;
  }
  return { rows, spotlight };
}

/** "9 days to go", "Tomorrow", "Today", "Out 3 days ago". */
export function describeDaysToGo(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `In ${days} days`;
  return days === -1 ? 'Out yesterday' : `Out ${-days} days ago`;
}

/**
 * Home on a computer (#1182): the list follows the Next drop card. Dated
 * rollouts first, soonest first; then rollouts with no date yet; then artists
 * whose newest song is out; artists with nothing planned sit last. Roster
 * order breaks ties, so the list never shuffles on its own.
 */
export function sortBySoonestDrop<A, R>(rows: readonly ArtistListRow<A, R>[]): ArtistListRow<A, R>[] {
  const rank = (row: ArtistListRow<A, R>): number =>
    row.status === 'rolling_out' ? (row.daysToGo === null ? 1 : 0) : row.status === 'out_now' ? 2 : 3;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const gap = rank(a.row) - rank(b.row);
      if (gap !== 0) return gap;
      if (rank(a.row) === 0) {
        const days = (a.row.daysToGo ?? 0) - (b.row.daysToGo ?? 0);
        if (days !== 0) return days;
      }
      return a.index - b.index;
    })
    .map(({ row }) => row);
}
