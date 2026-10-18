// When an activity was ticked (2026-10-18, URG-369).
//
// Until now only the MCP / UrgAns paths (lib/services/task-service.ts) and the
// handoff checklist stamped tasks.completed_at. The app's own checkbox and
// status menu go through PATCH /api/tasks/[id], which set status alone, so 416
// of 417 done tasks had no completion time and the admin "Activities ticked"
// count had to guess from updated_at (which every later edit moves).
//
// The rule, pure so it can be tested:
//  - into done (from anything else): stamp now;
//  - out of done (undo, reopen): clear it;
//  - no status change, or done to done: leave the column alone.
// Nothing is backfilled: rows done before this shipped keep a null, and the
// admin counts fall back to updated_at for exactly those rows.

export const TASK_DONE = 'done';

export function completedAtPatch(
  previousStatus: string | null | undefined,
  nextStatus: unknown,
  now: Date = new Date()
): { completed_at: string | null } | null {
  if (typeof nextStatus !== 'string') return null;
  const wasDone = previousStatus === TASK_DONE;
  const isDone = nextStatus === TASK_DONE;
  if (isDone && !wasDone) return { completed_at: now.toISOString() };
  if (!isDone && wasDone) return { completed_at: null };
  return null;
}
