// The one rule for moving a task's status (issue #1408, state-machines.md
// open item 2).
//
// Before this, only the checkbox in the app (useTaskStore.completeTask) and the
// service used by MCP and UrgAns (TaskService.completeTaskWithCascade) checked
// whether a task could be finished. PATCH /api/tasks/[id] took any status, so a
// locked task could go straight to done through the status menu, the API or
// update_task, skipping the blocker check. This is that check, written once and
// called by the route, so every door agrees with the checkbox.
//
// Pure on purpose: vitest only reaches lib/, and a rule written inline in a
// route is a rule nothing checks. The route loads the blocker (a database read)
// only when this says it is needed.
import { TASK_STATUS_OPTIONS } from '@/types/tasks';

export const TASK_DONE = 'done';

export type TaskStatusDecision =
  | { ok: true }
  | { ok: false; status: 400 | 409; reason: 'unknown_status' | 'blocked'; message: string };

export function isKnownTaskStatus(value: unknown): value is (typeof TASK_STATUS_OPTIONS)[number] {
  return typeof value === 'string' && (TASK_STATUS_OPTIONS as readonly string[]).includes(value);
}

/**
 * True only for a move INTO done. Leaving done (reopen, undo) and done to done
 * are never gated: undoing a tick must always work, and re-sending done must
 * stay harmless.
 */
export function completionNeedsBlockerCheck(from: string | null | undefined, to: unknown): boolean {
  return to === TASK_DONE && from !== TASK_DONE;
}

/**
 * Decide whether a status change may be written.
 *
 * `blocker` is what getTaskCompletionBlocker returned for the task (null when
 * nothing holds it up). Pass it only when completionNeedsBlockerCheck is true;
 * for any other move it is ignored.
 */
export function decideTaskStatusChange(input: {
  from: string | null | undefined;
  to: unknown;
  blocker?: string | null;
}): TaskStatusDecision {
  if (!isKnownTaskStatus(input.to)) {
    return {
      ok: false,
      status: 400,
      reason: 'unknown_status',
      message: `status must be one of: ${TASK_STATUS_OPTIONS.join(', ')}.`,
    };
  }
  if (completionNeedsBlockerCheck(input.from, input.to) && input.blocker) {
    return { ok: false, status: 409, reason: 'blocked', message: input.blocker };
  }
  return { ok: true };
}
