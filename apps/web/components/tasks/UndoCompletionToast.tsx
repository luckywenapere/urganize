'use client';

import { useState } from 'react';
import { CheckCircle2, X } from '@/components/icons';
import { useTaskStore } from '@/stores/useTaskStore';

// Same reasoning as ToastProvider — raise this above MobileNavBar below lg
// rather than let the Undo button land on/under the bar.
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';

/**
 * Floating "Task completed · Undo" toast surfaced after a tick. Mounted once
 * globally inside TaskUIProvider so the same affordance covers every surface
 * where tasks render — the workspace TasksPanel, the release detail page,
 * the task drawer.
 *
 * The store owns the lifecycle (set in `completeTask`, auto-cleared after
 * ~5s, force-cleared by `undoCompletion` or `dismissCompletionToast`). This
 * component is render-only: read `completionToast`, key off `tick` so a
 * second completion mounts a fresh DOM node (and a fresh enter animation)
 * even when the previous one is still on screen.
 */
export function UndoCompletionToast() {
  const completionToast = useTaskStore((state) => state.completionToast);
  const undoCompletion = useTaskStore((state) => state.undoCompletion);
  const dismissCompletionToast = useTaskStore((state) => state.dismissCompletionToast);
  const [isUndoing, setIsUndoing] = useState(false);

  // Reset the Undoing flag when the toast changes (new tick → new completion).
  // Uses the "Adjusting state when a prop changes" pattern from React's docs
  // (setState during render with a converging guard) instead of useEffect, to
  // match TasksPanel's auto-expand handling and avoid the
  // react-hooks/set-state-in-effect warning.
  const [prevTick, setPrevTick] = useState<number | null>(null);
  const currentTick = completionToast?.tick ?? null;
  if (prevTick !== currentTick) {
    setPrevTick(currentTick);
    if (isUndoing) setIsUndoing(false);
  }

  if (!completionToast) return null;

  const handleUndo = async () => {
    if (isUndoing) return;
    setIsUndoing(true);
    await undoCompletion(completionToast.taskId);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 ${
        MOBILE_NAV_ENABLED ? 'mobile-nav-raise lg:bottom-8' : 'bottom-6 sm:bottom-8'
      }`}
    >
      <div
        key={completionToast.tick}
        className="task-undo-toast pointer-events-auto flex max-w-md items-center gap-3 border border-stroke-default bg-bg-elevated px-4 py-3 text-sm text-content-primary shadow-lg"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate">
            <span className="text-content-secondary">Task completed</span>
            <span className="ml-1 text-content-primary" title={completionToast.title}>
              · {completionToast.title}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleUndo}
          disabled={isUndoing}
          className="motion-focus shrink-0 text-sm font-semibold text-brand transition-colors hover:text-brand-hover disabled:opacity-60"
        >
          {isUndoing ? 'Undoing…' : 'Undo'}
        </button>
        <button
          type="button"
          onClick={() => dismissCompletionToast(completionToast.taskId)}
          aria-label="Dismiss"
          className="motion-focus shrink-0 text-content-tertiary transition-colors hover:text-content-secondary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
