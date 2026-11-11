import { isCalendarDate, type RecordStatus } from '@/lib/next-records';

// The record page's small rules (#1190, mock docs/mocks/record-page-desktop):
// where a record stands on Song, Release, Out, and the counts the desktop
// cards show beside their titles. Pure, so the page only draws.

export type RecordStageStep = {
  key: 'song' | 'release' | 'out';
  label: string;
  /** done: behind us. now: where it is. next: the stop after now. later: beyond that. */
  state: 'done' | 'now' | 'next' | 'later';
};

const STOPS = [
  { key: 'song', label: 'Song' },
  { key: 'release', label: 'Release' },
  { key: 'out', label: 'Out' },
] as const;

/**
 * Song, Release, Out (2026-11-11, #1143). Idea and Making are both Song on
 * screen; the song checklist's groups are what used to be those stages. A
 * project becomes its rollout at Release; Out is lit on the rollout itself.
 * A dropped record is at no stop.
 */
export function recordStageSteps(status: RecordStatus): RecordStageStep[] {
  const at = status === 'idea' || status === 'making' ? 0 : status === 'planned' ? 1 : -1;
  return STOPS.map((stop, index) => ({
    ...stop,
    state: index === at ? 'now' : at > index ? 'done' : at >= 0 && index === at + 1 ? 'next' : 'later',
  }));
}

/** "4 open, 1 done"; done is left out at zero. */
export function taskCountsLine(open: number, done: number): string {
  return done > 0 ? `${open} open, ${done} done` : `${open} open`;
}

/** An open task whose day is before today (both YYYY-MM-DD, Lagos). */
export function isTaskLate(dueDate: string | null | undefined, today: string, closed: boolean): boolean {
  if (closed) return false;
  const day = (dueDate || '').slice(0, 10);
  return isCalendarDate(day) && day < today;
}
