// Pure deadline-tier assignment (mobile push notifications, 2026-08-10).
// Extends the due-date sweep's original two-branch check (overdue / due
// within 24h) to three forward-looking tiers: 7 days, 3 days, and 1 day —
// "1 day" and "24 hours" are the same tier, task_due_soon.
//
// Kept UTC-instant, matching the existing sweep's math exactly (see
// createDueDateNotificationsForAllUsers in lib/tasks-server.ts) — this is a
// deliberate non-goal: due dates carry known timezone sloppiness elsewhere
// in the app (manual edits store a naive local wall-clock string), and
// fixing that is out of scope here.

const DAY_MS = 24 * 60 * 60 * 1000;

export type DueTier = 'task_overdue' | 'task_due_soon' | 'task_due_3d' | 'task_due_7d' | null;

/** Assigns exactly one tier (or null, when the task isn't due within the
 * next 7 days) for a given due timestamp. Idempotent across repeated runs
 * against the same clock: a task doesn't drift between tiers unless real
 * time passes. */
export function assignDueTier(dueMs: number, nowMs: number): DueTier {
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs)) return null;

  if (dueMs < nowMs) return 'task_overdue';
  if (dueMs <= nowMs + DAY_MS) return 'task_due_soon';
  if (dueMs <= nowMs + 3 * DAY_MS) return 'task_due_3d';
  if (dueMs <= nowMs + 7 * DAY_MS) return 'task_due_7d';
  return null;
}
