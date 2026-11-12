/**
 * The desktop Distribute checklist (#1210, part of #1175): the five things that
 * go to the stores, one row each, and how many are left.
 *
 * trmChecklist (./release.ts) already decides WHAT is wrong, as one row per
 * problem. This folds those rows into the five the page shows: Master, Cover
 * art, Details, Credits, Rights and policies. Missing details (title, artist,
 * release date, genre, language, explicit) become one Details row that counts
 * once, which is what the founder approved in the desktop mock (Nov 11, 2026).
 *
 * Pure: no React, no environment reads. Every number it writes comes from the
 * rows it is given, never a guess.
 */

import type { TrmRow } from './release';

export type DistributeRowKey = 'master' | 'cover_art' | 'details' | 'credits' | 'rights';

/** ready: a green tick. todo: a red mark, counted as left. at_send: the master,
 *  which is added in the send sheet, so it never holds Send back. */
export type DistributeRowState = 'ready' | 'todo' | 'at_send';

export type DistributeRow<R extends TrmRow = TrmRow> = {
  key: DistributeRowKey;
  title: string;
  state: DistributeRowState;
  detail: string;
  /** The problems behind a red mark, each with its own fix. */
  issues: R[];
};

export type DistributeChecklistInput<R extends TrmRow = TrmRow> = {
  blocking: readonly R[];
  ready: readonly R[];
  /** Each song's master at TRM, in order (null = none yet). */
  masters: ReadonlyArray<{ fileName: string | null } | null>;
  /** An EP or album lists its songs above the checklist, with their own
   *  problems, so song rows stay out of Details. */
  songsListedApart: boolean;
  /** Explicit is asked per song (the release has song rows), so it is not one
   *  of the rollout's details. */
  explicitPerSong: boolean;
};

export type DistributeChecklist<R extends TrmRow = TrmRow> = {
  rows: DistributeRow<R>[];
  /** Song problems shown in the songs list instead of a row. */
  songIssues: R[];
  /** Red rows plus song problems: what stands between the team and Send. */
  left: number;
};

/** The details trmChecklist checks, as row keys. */
const DETAIL_KEYS = ['title', 'artist', 'release_date', 'genre', 'language', 'explicit'] as const;
const MISSING = new Set(['Not set', 'Not answered']);

const isSongKey = (key: string) => key === 'songs' || key.startsWith('song:');

function groupOf(key: string): Exclude<DistributeRowKey, 'master'> {
  if (key === 'cover_art') return 'cover_art';
  if (key === 'credits') return 'credits';
  if (key === 'rights') return 'rights';
  // Title, artist, date, genre, language, explicit, a single's song rows, and
  // anything added later: under Details, so no problem is ever dropped.
  return 'details';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function detailsLine<R extends TrmRow>(issues: readonly R[], explicitPerSong: boolean): string {
  const total = DETAIL_KEYS.length - (explicitPerSong ? 1 : 0);
  const allMissingFacts = issues.every(
    (issue) => (DETAIL_KEYS as readonly string[]).includes(issue.key) && MISSING.has(issue.detail)
  );
  if (allMissingFacts) return `${total - issues.length} of ${total} filled in`;
  return `${plural(issues.length, 'thing', 'things')} to fix`;
}

function masterRow(masters: DistributeChecklistInput['masters']): DistributeRow<never> {
  const count = masters.length;
  const title = count > 1 ? 'Masters' : 'Master';
  if (count > 0 && masters.every(Boolean)) {
    return { key: 'master', title, state: 'ready', detail: `${plural(count, 'song', 'songs')} uploaded`, issues: [] };
  }
  return {
    key: 'master',
    title,
    state: 'at_send',
    detail: count > 1 ? 'Added when you send · one WAV per song' : 'Added when you send · WAV up to 150 MB',
    issues: [],
  };
}

export function distributeChecklist<R extends TrmRow>(input: DistributeChecklistInput<R>): DistributeChecklist<R> {
  const songIssues: R[] = [];
  const issues: Record<Exclude<DistributeRowKey, 'master'>, R[]> = { cover_art: [], details: [], credits: [], rights: [] };
  for (const row of input.blocking) {
    if (input.songsListedApart && isSongKey(row.key)) songIssues.push(row);
    else issues[groupOf(row.key)].push(row);
  }
  const readyDetail = (key: string) => input.ready.find((row) => row.key === key)?.detail ?? '';

  const coverIssues = issues.cover_art;
  const coverReady = readyDetail('cover_art');
  const rows: DistributeRow<R>[] = [
    masterRow(input.masters),
    {
      key: 'cover_art',
      title: 'Cover art',
      state: coverIssues.length ? 'todo' : 'ready',
      detail: coverIssues.length
        ? coverIssues.map((issue) => issue.detail).join(' · ')
        : [coverReady, 'Ready for stores'].filter(Boolean).join(' · '),
      issues: coverIssues,
    },
    {
      key: 'details',
      title: 'Details',
      state: issues.details.length ? 'todo' : 'ready',
      detail: issues.details.length ? detailsLine(issues.details, input.explicitPerSong) : readyDetail('details'),
      issues: issues.details,
    },
    {
      key: 'credits',
      title: 'Credits',
      state: issues.credits.length ? 'todo' : 'ready',
      detail: issues.credits.length ? issues.credits.map((issue) => issue.detail).join(' · ') : readyDetail('credits'),
      issues: issues.credits,
    },
    {
      key: 'rights',
      title: 'Rights and policies',
      state: issues.rights.length ? 'todo' : 'ready',
      detail: issues.rights.length ? issues.rights.map((issue) => issue.detail).join(' · ') : readyDetail('rights'),
      issues: issues.rights,
    },
  ];
  const left = rows.filter((row) => row.state === 'todo').length + songIssues.length;
  return { rows, songIssues, left };
}

/** The dark card's heading. */
export function leftHeading(left: number): string {
  return left === 0 ? 'Ready to send' : `${plural(left, 'thing', 'things')} left`;
}

const FINISH: Record<DistributeRowKey | 'songs', string> = {
  master: 'Add the master',
  cover_art: 'Add the cover art',
  details: 'Fill in the details',
  credits: 'Finish the credits',
  rights: 'Check the rights and policies',
  songs: 'Finish the songs',
};

/** The sentence under the heading: why Send is grey, in words. */
export function leftReason(checklist: DistributeChecklist, title: string): string {
  const name = title.trim() || 'it';
  if (checklist.left === 0) return `Everything is in. Send ${name} to the stores.`;
  if (checklist.left === 1) {
    const only = checklist.rows.find((row) => row.state === 'todo');
    const phrase = !only
      ? FINISH.songs
      : only.key === 'cover_art' && only.detail !== 'Not added'
        ? 'Replace the cover art'
        : FINISH[only.key];
    return `${phrase} and you can send ${name} to the stores.`;
  }
  return `Finish the ${checklist.left} marked rows and you can send ${name} to the stores.`;
}

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
const countWord = (n: number) => COUNT_WORDS[n] ?? String(n);

/** The line under "Get it ready for stores". */
export function readyLine(checklist: DistributeChecklist): string {
  const total = checklist.rows.length;
  const ready = checklist.rows.filter((row) => row.state === 'ready').length;
  const atSend = checklist.rows.some((row) => row.state === 'at_send');
  const head = `${countWord(total)} things go to the stores.`;
  const count = ready === total ? 'All are ready.' : `${countWord(ready)} ${ready === 1 ? 'is' : 'are'} ready.`;
  return [head, count, atSend ? 'The master goes in when you send.' : null].filter(Boolean).join(' ');
}
