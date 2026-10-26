// When a task owner gets chased. Pure: data in, decision out.
//
// All days are Lagos days (UTC+1, no daylight saving). The sweep runs once a
// day from the existing cron, so "the day before", "the due day" and "every N
// days late" are day questions, not clock questions. Quiet hours exist so a
// reply to a chase, or a manual send, never lands at night.

export type ChaseKind = 'day_before' | 'due_day' | 'overdue';

export type ChaseSettings = {
  chaseDayBefore: boolean;
  chaseDueDay: boolean;
  chaseOverdue: boolean;
  overdueEveryDays: number;
};

export const QUIET_HOURS_START = 21;
export const QUIET_HOURS_END = 8;
/** Past this many days late the chasing stops; a task that old needs a person. */
export const MAX_OVERDUE_DAYS = 14;

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** The Lagos calendar day of an instant, as YYYY-MM-DD. */
export function lagosDay(at: Date): string {
  return new Date(at.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

export function lagosHour(at: Date): number {
  return new Date(at.getTime() + LAGOS_OFFSET_MS).getUTCHours();
}

/** Whole days from a to b (both YYYY-MM-DD). Positive when b is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function isQuietHour(at: Date): boolean {
  const hour = lagosHour(at);
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

/**
 * Which chase, if any, a task is due today.
 *
 * `lastOverdueChaseDay` is the Lagos day of the last overdue chase for this
 * task (null when none), so "every 2 days" counts from the last one sent
 * rather than from the due date.
 */
export function chaseKindFor(input: {
  dueDate: string | null;
  now: Date;
  settings: ChaseSettings;
  lastOverdueChaseDay: string | null;
}): ChaseKind | null {
  if (!input.dueDate) return null;
  const due = new Date(input.dueDate);
  if (Number.isNaN(due.getTime())) return null;

  const today = lagosDay(input.now);
  const diff = daysBetween(today, lagosDay(due));

  if (diff === 1) return input.settings.chaseDayBefore ? 'day_before' : null;
  if (diff === 0) return input.settings.chaseDueDay ? 'due_day' : null;
  if (diff < 0 && input.settings.chaseOverdue) {
    if (-diff > MAX_OVERDUE_DAYS) return null;
    const every = Math.min(14, Math.max(1, Math.floor(input.settings.overdueEveryDays) || 2));
    if (!input.lastOverdueChaseDay) return 'overdue';
    return daysBetween(input.lastOverdueChaseDay, today) >= every ? 'overdue' : null;
  }
  return null;
}

/** "Fri 30 Oct" for a Lagos day. */
export function formatDayShort(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${weekday} ${d.getUTCDate()} ${month}`;
}
