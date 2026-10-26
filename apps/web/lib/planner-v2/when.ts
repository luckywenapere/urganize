/**
 * Planner v2's undated timing (2026-10-26), import-free so the task reader
 * (lib/tasks-server.ts) and the browser can both use it. See ./dates.ts.
 */

/** "Now", "4 weeks before", "Release week", "Release day", "After release". */
export function relativeWhenLabel(offset: number, now: boolean): string {
  if (now) return 'Now';
  if (offset === 0) return 'Release day';
  if (offset > 0) return offset < 7 ? 'Release week' : 'After release';
  if (offset > -7) return 'Release week';
  const weeks = Math.round(-offset / 7);
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} before`;
}

/** What an undated task row keeps in `metadata.planner_v2`. */
export type UndatedTaskMeta = { offset_days: number; now: boolean };

export function readUndatedTaskMeta(metadata: unknown): UndatedTaskMeta | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const v2 = (metadata as Record<string, unknown>).planner_v2;
  if (!v2 || typeof v2 !== 'object') return null;
  const offset = (v2 as Record<string, unknown>).offset_days;
  if (typeof offset !== 'number' || !Number.isFinite(offset)) return null;
  return { offset_days: Math.round(offset), now: (v2 as Record<string, unknown>).now === true };
}

