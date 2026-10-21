import { TASK_STATUS_OPTIONS, type TaskStatus } from '@/types/tasks';

// Small rules for the task pop-up's own fields.

/**
 * A due date with no time of day: the plan stores its dates at UTC midnight
 * (release day plus an offset), and a day typed with no time is stored the
 * same way. Anything with a real time of day is not date-only.
 */
export function isDateOnlyDue(value: string | null | undefined): boolean {
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

/** The value for a day-only input: the stored UTC day, never shifted by the viewer's zone. */
export function dueDateOnlyValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** The value for a date-and-time input, in the viewer's own zone. */
export function dueDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

/**
 * The statuses the pop-up's Status menu offers. Locked is set by the app when
 * an activity waits on another one, so it is not a choice: it shows only while
 * the activity is in that state, so the menu still reads right.
 */
export function selectableTaskStatuses(current: TaskStatus): readonly TaskStatus[] {
  return TASK_STATUS_OPTIONS.filter((status) => status !== 'locked' || current === 'locked');
}
