import { parseReleaseDate } from './recap-copy';

// The pure half of the artist page (Catalogue, Phase 1): which of an artist's
// rollouts are planned, just out, or behind them; which shows are ahead; and
// who on the team is limited to this artist. Kept in lib/ so the rules are unit
// tested and the page only arranges what this returns.

/** A release counts as "live" for this many days after its date. Long enough
 *  for the release to still be the thing the team is working, short enough that
 *  last quarter's single is not still sitting at the top. */
export const LIVE_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

export type OverviewRelease = {
  id: string;
  artistId: string;
  releaseDate: string | null;
  status: string;
};

export type ReleaseBuckets<T> = { planned: T[]; live: T[]; past: T[] };

const startOfToday = (now: Date): number => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return today.getTime();
};

/**
 * Sorts one artist's rollouts into planned, live and past.
 *
 * Planned: the date is ahead, or there is none yet. Live: the date is today or
 * within the live window. Past: older than that, or archived, or marked
 * released with no date to place it. Archived always means past: somebody put
 * it away on purpose. Every input lands in exactly one bucket.
 */
export function bucketReleases<T extends OverviewRelease>(
  releases: T[],
  now: Date = new Date()
): ReleaseBuckets<T> {
  const today = startOfToday(now);
  const planned: T[] = [];
  const live: T[] = [];
  const past: T[] = [];

  const dateOf = (release: T): number | null => {
    const parsed = parseReleaseDate(release.releaseDate);
    return parsed ? parsed.getTime() : null;
  };

  for (const release of releases) {
    const date = dateOf(release);
    if (release.status === 'archived') {
      past.push(release);
    } else if (date === null) {
      (release.status === 'released' ? past : planned).push(release);
    } else if (date > today) {
      planned.push(release);
    } else if ((today - date) / DAY_MS <= LIVE_WINDOW_DAYS) {
      live.push(release);
    } else {
      past.push(release);
    }
  }

  const ascending = (a: T, b: T) => (dateOf(a) ?? Infinity) - (dateOf(b) ?? Infinity);
  const descending = (a: T, b: T) => (dateOf(b) ?? -Infinity) - (dateOf(a) ?? -Infinity);
  planned.sort(ascending);
  live.sort(descending);
  past.sort(descending);
  return { planned, live, past };
}

/** The numbers on an artist's card in the list. */
export function artistSummary(
  artistId: string,
  releases: OverviewRelease[],
  now: Date = new Date()
): { releases: number; planned: number; live: number } {
  const mine = releases.filter((release) => release.artistId === artistId);
  const buckets = bucketReleases(mine, now);
  return {
    releases: mine.length,
    planned: buckets.planned.length,
    live: buckets.live.length,
  };
}

/**
 * Who on the team works on this artist. People limited to this artist (an
 * artist's own manager or a hired producer) are listed apart from people who
 * see every artist, so a manager can tell who is scoped without opening each
 * teammate. A person limited to a DIFFERENT artist is left out, since they
 * cannot see this one. A member with no scope row sees everything.
 */
export function splitTeamByArtistScope<T extends { id: string }>(
  members: T[],
  scopeByMemberId: Map<string, string | null>,
  artistId: string
): { scoped: T[]; everyone: T[] } {
  const scoped: T[] = [];
  const everyone: T[] = [];
  for (const member of members) {
    const scope = scopeByMemberId.get(member.id) ?? null;
    if (scope === artistId) scoped.push(member);
    else if (scope === null) everyone.push(member);
  }
  return { scoped, everyone };
}

/** What a task needs for Up next: which rollout, whether it is done, its day. */
export type UpNextTask = { releaseId: string | null; status: string; dueDate: string | null };

/** What a record in the making needs for Up next. */
export type UpNextRecord = { id: string; title: string; songCount: number; doneCount: number };

export type ArtistUpNext<R, C> =
  | { kind: 'rollout'; release: R; daysToGo: number | null; dueThisWeek: number; late: number }
  | { kind: 'out'; release: R; openTasks: number; late: number }
  | { kind: 'record'; record: C; step: 'add_songs' | 'finish' | 'plan' }
  | { kind: 'start' };

const dayNumber = (value: string): number | null => {
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.round(parsed / DAY_MS) : null;
};

/**
 * The one thing the artist page leads with (2026-10-29, #866, mock
 * docs/mocks/artist-page). The nearest planned rollout wins; then a release
 * that is just out but still has work open; then the record being made; else
 * a nudge to start one. `today` is a YYYY-MM-DD day (Lagos on the page).
 */
export function artistUpNext<R extends OverviewRelease, C extends UpNextRecord>({
  buckets,
  records,
  tasks,
  today,
}: {
  buckets: ReleaseBuckets<R>;
  records: C[];
  tasks: UpNextTask[];
  today: string;
}): ArtistUpNext<R, C> {
  const todayN = dayNumber(today) ?? 0;
  const openFor = (releaseId: string) =>
    tasks.filter((task) => task.releaseId === releaseId && task.status !== 'done');
  const isLate = (task: UpNextTask) => {
    const due = task.dueDate ? dayNumber(task.dueDate) : null;
    return due !== null && due < todayN;
  };

  const planned = buckets.planned[0];
  if (planned) {
    const open = openFor(planned.id);
    const date = planned.releaseDate ? dayNumber(planned.releaseDate) : null;
    return {
      kind: 'rollout',
      release: planned,
      daysToGo: date === null ? null : date - todayN,
      dueThisWeek: open.filter((task) => {
        const due = task.dueDate ? dayNumber(task.dueDate) : null;
        return due !== null && due >= todayN && due < todayN + 7;
      }).length,
      late: open.filter(isLate).length,
    };
  }

  for (const release of buckets.live) {
    const open = openFor(release.id);
    if (open.length > 0) return { kind: 'out', release, openTasks: open.length, late: open.filter(isLate).length };
  }

  const unfinished = records.find((record) => record.songCount > 0 && record.doneCount < record.songCount);
  if (unfinished) return { kind: 'record', record: unfinished, step: 'finish' };
  const ready = records.find((record) => record.songCount > 0);
  if (ready) return { kind: 'record', record: ready, step: 'plan' };
  if (records[0]) return { kind: 'record', record: records[0], step: 'add_songs' };
  return { kind: 'start' };
}
