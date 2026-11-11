import { isTaskClosed } from '@/types/tasks';

// More of the pure half of the artist page (#1183, mock
// docs/mocks/artist-page-desktop): the rules that keep a record in one stage
// only, and which tasks the page's tasks card shows. lib/artist-overview.ts
// holds the stage buckets and Up next.

const DAY_MS = 86_400_000;

const dayNumber = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.round(parsed / DAY_MS) : null;
};

/**
 * The records to list under In the making. A record still being made can
 * already point at its rollout (lib/next-records-rollout-server.ts links them
 * when the planner opens, and the record only leaves when the plan saves). If
 * that rollout is on the page, the record has reached Rolling out or Out now
 * and shows there, once. A link to a rollout the page does not show keeps the
 * record here, so it is never lost.
 */
export function recordsStillInTheMaking<C extends { releaseId?: string | null }>(
  records: readonly C[],
  shownReleaseIds: Iterable<string>
): C[] {
  const shown = new Set(shownReleaseIds);
  return records.filter((record) => !record.releaseId || !shown.has(record.releaseId));
}

/** A store's date can sit this far from the date on the rollout and still be the same song. */
export const SAME_SONG_WINDOW_DAYS = 60;

/** "  Ọwámbẹ̀ Season! " and "owambe season" are the same title. */
const titleKey = (title: string): string =>
  title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The songs brought in from streaming, minus the ones a rollout on this page
 * already put out. The streaming check also finds a song released through
 * Urganize, and nothing matches the two, so it used to sit under Out now
 * twice. Same title (case, accents and punctuation aside) and, when both have
 * a date, dates within SAME_SONG_WINDOW_DAYS: an old song that only shares a
 * name with a new rollout stays. Pass only rollouts that are already out.
 */
export function olderSongsNotRolledOut<S extends { title: string; release_date: string | null }>(
  songs: readonly S[],
  outRollouts: readonly { title: string; releaseDate: string | null }[]
): S[] {
  const out = outRollouts
    .map((rollout) => ({ key: titleKey(rollout.title), day: dayNumber(rollout.releaseDate) }))
    .filter((rollout) => rollout.key !== '');
  if (out.length === 0) return [...songs];
  return songs.filter((song) => {
    const key = titleKey(song.title);
    if (!key) return true;
    const day = dayNumber(song.release_date);
    return !out.some(
      (rollout) =>
        rollout.key === key && (day === null || rollout.day === null || Math.abs(day - rollout.day) <= SAME_SONG_WINDOW_DAYS)
    );
  });
}

export type ArtistTaskInput = {
  id: string;
  releaseId: string | null;
  status: string;
  dueDate: string | null;
  assignedToUserId: string | null;
  /** The team member it was given to. Set alone for someone invited who has not joined yet. */
  assignedTo?: string | null;
};

export type ArtistTaskRow<T> = {
  task: T;
  /** "4 days late", "Today", "Mon 16 Nov" or "No date". */
  dueLabel: string;
  late: boolean;
  /** Whose it is: the person looking, a teammate, or nobody yet. */
  owner: 'viewer' | 'other' | 'nobody';
};

const shortDay = (day: number): string =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(day * DAY_MS)
  );

/**
 * The tasks card on the artist page: the open tasks on this artist's rollouts,
 * late first (the most late on top), then the soonest, then the ones with no
 * date. `tasks` is what the page already holds, so it is only what the person
 * may see. Late and due-this-week count the same way Up next does
 * (artistUpNext): before today is late, today to six days out is this week.
 */
export function artistTaskList<T extends ArtistTaskInput>({
  tasks,
  releaseIds,
  today,
  viewerId,
  limit = 5,
}: {
  tasks: readonly T[];
  releaseIds: Iterable<string>;
  /** A YYYY-MM-DD day (Lagos on the page). */
  today: string;
  viewerId: string | null;
  limit?: number;
}): { rows: ArtistTaskRow<T>[]; open: number; late: number; dueThisWeek: number } {
  const mine = new Set(releaseIds);
  const todayN = dayNumber(today) ?? 0;
  const open = tasks
    .filter((task) => task.releaseId !== null && mine.has(task.releaseId) && !isTaskClosed(task.status))
    .map((task, index) => ({ task, index, due: dayNumber(task.dueDate) }));

  // Array.sort is stable, but the index makes the tie rule plain.
  open.sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || a.index - b.index);

  const rows = open.slice(0, Math.max(0, limit)).map(({ task, due }): ArtistTaskRow<T> => {
    const lateBy = due === null ? 0 : todayN - due;
    return {
      task,
      late: lateBy > 0,
      dueLabel:
        due === null ? 'No date' : lateBy > 0 ? `${lateBy} ${lateBy === 1 ? 'day' : 'days'} late` : lateBy === 0 ? 'Today' : shortDay(due),
      owner:
        viewerId && task.assignedToUserId === viewerId ? 'viewer' : task.assignedToUserId || task.assignedTo ? 'other' : 'nobody',
    };
  });

  return {
    rows,
    open: open.length,
    late: open.filter(({ due }) => due !== null && due < todayN).length,
    dueThisWeek: open.filter(({ due }) => due !== null && due >= todayN && due < todayN + 7).length,
  };
}
