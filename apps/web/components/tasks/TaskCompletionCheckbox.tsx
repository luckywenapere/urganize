'use client';

import { Check } from '@/components/icons';
import { TASK_DONE_STATUS, TASK_LOCKED_STATUS } from '@/lib/execution-types';
import { useTaskStore } from '@/stores/useTaskStore';
import { type TaskStatus } from '@/lib/tasks';
import { TASKS_CHANGED_EVENT } from '@/components/tasks/TaskUIProvider';

type TaskCompletionCheckboxProps = {
  taskId: string;
  status: TaskStatus;
  /** Called with the blocker text when completion is refused (locked task or
   * unmet dependency). The parent surfaces it via toast/banner. */
  onBlocker?: (message: string) => void;
  /** Task title, optional. When provided, the aria-label includes it so screen
   * readers can disambiguate among the many checkboxes in a task list. */
  taskTitle?: string;
  className?: string;
  /** Overrides the click behavior — called instead of hitting the store
   * directly. Used by TaskDetailView, whose completion must go through
   * TaskUIProvider's onSavePatch so the inline view's own task state (header
   * pill, blocker banner) refreshes correctly rather than only the store's
   * list state. */
  onToggle?: () => Promise<void> | void;
  /** True for a task that hasn't reached the server yet (offline queue,
   * see types/tasks.ts's Task.pendingSync). Renders the same muted circle a
   * locked task gets but as a plain, non-interactive element — nothing
   * should attempt to complete or reopen a row that has no real id yet. */
  disabled?: boolean;
};

/**
 * Circular completion checkbox for task rows.
 *
 * - Filled brand-green with a check when status === 'done'.
 * - Empty (border only) otherwise.
 * - Muted treatment when status === 'locked' to signal "you can interact but
 *   it'll get rejected" without disabling the control outright (we still want
 *   the click to surface the blocker reason).
 *
 * Click routing goes through `useTaskStore.completeTask`, which:
 *   - hydrates the task into the store if it isn't there yet,
 *   - reopens (PATCH to todo) if already done,
 *   - runs the blocker check + completion + cascade-unlock otherwise.
 *
 * `event.stopPropagation()` keeps the click from also opening the row's
 * drawer when the checkbox lives inside a clickable row.
 */
export function TaskCompletionCheckbox({
  taskId,
  status,
  onBlocker,
  taskTitle,
  className = '',
  onToggle,
  disabled = false,
}: TaskCompletionCheckboxProps) {
  const isDone = status === TASK_DONE_STATUS;
  const isLocked = status === TASK_LOCKED_STATUS;
  const taskLabel = taskTitle ? `"${taskTitle}"` : 'task';

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (onToggle) {
      await onToggle();
      return;
    }
    const result = await useTaskStore.getState().completeTask(taskId);
    if (!result) {
      const blocker = useTaskStore.getState().error;
      if (blocker) {
        onBlocker?.(blocker);
      }
      return;
    }
    // Notify list views that read directly from the API (e.g. the Tasks
    // page) to refetch so their local state matches the store.
    window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
  };

  const stateClasses = isDone
    ? 'border-brand bg-brand text-content-inverse'
    : isLocked
      ? 'border-stroke-default bg-bg-elevated/40 text-transparent hover:border-stroke-strong'
      : // The control outline (3:1 on every ground, rule 14 of the 2026-09-30
        // accessibility pass), not a hairline: on a card the same colour as the
        // circle, a hairline left nothing to see (found on Home's stacks).
        'border-stroke-control bg-bg-surface text-transparent hover:border-content-secondary';

  if (disabled) {
    return (
      <div
        role="checkbox"
        aria-checked={false}
        aria-disabled="true"
        aria-label={`${taskLabel} hasn't synced yet`}
        title="Waiting to sync"
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-elevated/40 text-transparent ${className}`}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </div>
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isDone}
      aria-label={isDone ? `Mark ${taskLabel} incomplete` : `Mark ${taskLabel} complete`}
      onClick={handleClick}
      className={`hit-44 relative motion-focus grid h-6 w-6 shrink-0 place-items-center rounded-full border transition ${stateClasses} ${className}`}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
}
