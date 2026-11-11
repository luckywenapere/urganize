import { isCalendarDate, type RecordStatus } from '@/lib/next-records';

// The record page's small rules (#1190, mock docs/mocks/record-page-desktop):
// where a record stands on Idea, Making, Rollout, and the counts the desktop
// cards show beside their titles. Pure, so the page only draws.

export type RecordStageStep = {
  key: 'idea' | 'making' | 'planned';
  label: string;
  /** done: behind us. now: where it is. next: the stop after now. later: beyond that. */
  state: 'done' | 'now' | 'next' | 'later';
};

const STOPS = [
  { key: 'idea', label: 'Idea' },
  { key: 'making', label: 'Making' },
  { key: 'planned', label: 'Rollout' },
] as const;

/** Idea, Making, then its rollout (2026-11-04, #1074). A dropped record is at no stop. */
export function recordStageSteps(status: RecordStatus): RecordStageStep[] {
  const at = STOPS.findIndex((stop) => stop.key === status);
  return STOPS.map((stop, index) => ({
    ...stop,
    state: index === at ? 'now' : at > index ? 'done' : index === at + 1 ? 'next' : 'later',
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
