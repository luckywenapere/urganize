// Rollout Trash rules (pure, no IO). Deleting a rollout sets releases.deleted_at;
// the row, its activities and its files stay put for TRASH_RETENTION_DAYS, then
// the purge cron removes them. Every read path hides rows where deleted_at is
// not null (see rollout-trash-server.ts for the helpers they share).

export const TRASH_RETENTION_DAYS = 30;
export const DELETE_CONFIRM_WORD = 'DELETE';

const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** When a rollout deleted at `deletedAt` is removed for good. */
export function trashPurgeAt(deletedAt: string | Date): Date {
  return new Date(toTime(deletedAt) + TRASH_RETENTION_DAYS * DAY_MS);
}

/** Whole days left before the purge, rounded up so "29 days left" is honest on
 * day one and "1 day left" holds until the last minute. Never below 0. */
export function trashDaysLeft(deletedAt: string | Date, now: Date = new Date()): number {
  const remaining = trashPurgeAt(deletedAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(remaining / DAY_MS));
}

export function isPurgeDue(deletedAt: string | Date, now: Date = new Date()): boolean {
  return trashPurgeAt(deletedAt).getTime() <= now.getTime();
}

/** The deleted_at cutoff the purge job uses: anything older goes. */
export function purgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS);
}

export type TrashUrgency = 'normal' | 'soon' | 'urgent';

/** Drives the amber (under 7 days) and red (under 2 days) badge in Trash. */
export function trashUrgency(daysLeft: number): TrashUrgency {
  if (daysLeft < 2) return 'urgent';
  if (daysLeft < 7) return 'soon';
  return 'normal';
}

export function formatDaysLeft(daysLeft: number): string {
  if (daysLeft <= 0) return 'Removing soon';
  return daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The typed double confirmation: the rollout's name or DELETE, any case. An
 * empty title never matches by name, so a blank box cannot pass. */
export function matchesDeleteConfirmation(input: unknown, title: string): boolean {
  if (typeof input !== 'string') return false;
  const typed = normalize(input);
  if (!typed) return false;
  if (typed === normalize(DELETE_CONFIRM_WORD)) return true;
  const name = normalize(title);
  return name.length > 0 && typed === name;
}

/** Row filter every list/load path applies. Kept as a function so tests and
 * in-memory callers share one definition of "deleted". */
export function isRolloutDeleted(row: { deleted_at?: string | null } | null | undefined): boolean {
  return Boolean(row && row.deleted_at);
}
