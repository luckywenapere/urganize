// What the Pitching page's "Editorial" section shows: one row per rollout,
// saying where its editorial pitch stands. Pure, so vitest can hold it. It reads
// the same task the pitch panel edits (no second copy of the data) and the same
// window rules (lib/editorial-pitch.ts).

import {
  PITCH_WINDOW_CLOSES_DAYS,
  allPitchFieldsFilled,
  daysToRelease,
  daysUntilWindowCloses,
  pitchWindowState,
  type PitchFields,
} from '@/lib/editorial-pitch';

export type EditorialRowState =
  | 'skipped'
  | 'sent'
  | 'ready'
  | 'to_write'
  | 'closed'
  | 'past'
  | 'no_date';

export type EditorialRowInput = {
  releaseId: string;
  releaseTitle: string;
  releaseDate: string | null;
  taskId: string;
  taskStatus: string | null;
  skippedAt: string | null;
  fields: PitchFields;
};

export type EditorialRow = {
  releaseId: string;
  releaseTitle: string;
  releaseDate: string | null;
  taskId: string;
  state: EditorialRowState;
  /** Whole days left before the window closes, only while it is open. */
  daysLeft: number | null;
};

export function editorialRow(input: EditorialRowInput, now: Date): EditorialRow {
  const days = daysToRelease(input.releaseDate, now);
  const window = pitchWindowState(days);
  let state: EditorialRowState;
  if (input.skippedAt) state = 'skipped';
  else if (input.taskStatus === 'done') state = 'sent';
  else if (window === 'past') state = 'past';
  else if (window === 'closed') state = 'closed';
  else if (window === 'unknown') state = 'no_date';
  else state = allPitchFieldsFilled(input.fields) ? 'ready' : 'to_write';

  return {
    releaseId: input.releaseId,
    releaseTitle: input.releaseTitle,
    releaseDate: input.releaseDate,
    taskId: input.taskId,
    state,
    daysLeft: window === 'open' && days !== null ? daysUntilWindowCloses(days) : null,
  };
}

// Rows that still need a person first, soonest window first; settled ones last.
const STATE_ORDER: Record<EditorialRowState, number> = {
  to_write: 0,
  ready: 1,
  closed: 2,
  no_date: 3,
  sent: 4,
  skipped: 5,
  past: 6,
};

export function sortEditorialRows(rows: readonly EditorialRow[]): EditorialRow[] {
  return [...rows].sort((a, b) => {
    const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state];
    if (byState !== 0) return byState;
    const left = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
    const right = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.releaseTitle.localeCompare(b.releaseTitle);
  });
}

export const EDITORIAL_SECTION_TITLE = 'Editorial pitches';
export const EDITORIAL_EMPTY_COPY =
  'No editorial pitches yet. Each rollout with a plan gets one step for Spotify and Apple Music.';
export const EDITORIAL_EMPTY_COPY_ROLLOUT =
  'No editorial pitch yet. Make a plan and this rollout gets one step for Spotify and Apple Music.';
export const EDITORIAL_OPEN_LABEL = 'Open pitch details';

export function editorialStateCopy(row: EditorialRow): string {
  switch (row.state) {
    case 'sent':
      return 'Pitched.';
    case 'skipped':
      return 'Released without a pitch.';
    case 'past':
      return 'Release day has passed.';
    case 'closed':
      return `The window closed ${PITCH_WINDOW_CLOSES_DAYS} days before release day.`;
    case 'no_date':
      return 'Add a release date to see the window.';
    case 'ready':
      return row.daysLeft === null ? 'Ready to paste.' : `Ready to paste. ${daysLeftCopy(row.daysLeft)}`;
    default:
      return row.daysLeft === null ? 'Needs writing.' : `Needs writing. ${daysLeftCopy(row.daysLeft)}`;
  }
}

function daysLeftCopy(days: number): string {
  return days === 1 ? '1 day left.' : `${days} days left.`;
}
