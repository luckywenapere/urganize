'use client';

import { CalendarClock, Pin } from '@/components/icons';
import { useHiddenNudge } from '@/lib/hidden-nudges';

/**
 * "Confirm your release date", pinned on top of a new user's first plan
 * (URG-251 flow, step 8). Which task, and for whom, is decided in
 * lib/pinned-confirm-date.ts; this only shows it and opens it. It goes away on
 * its own once the task is done, or with Unpin (founder, Oct 31, 2026, #919),
 * which only takes the pin off in this browser: the task stays in the plan.
 */
export function PinnedConfirmDateCard({
  taskId,
  title,
  dueDate,
  onOpen,
}: {
  taskId: string;
  title: string;
  dueDate: string | null;
  onOpen: () => void;
}) {
  const [unpinned, unpin] = useHiddenNudge(`pinned-confirm-date:${taskId}`);
  const due = formatDue(dueDate);
  if (unpinned) return null;
  return (
    <div className="flex w-full items-center rounded-2xl border border-brand/40 bg-brand/8 transition-colors duration-fast ease-standard hover:border-brand">
      <button
        type="button"
        onClick={onOpen}
        data-pinned-task="confirm-release-date"
        className="motion-focus motion-press flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-content-inverse">
          <CalendarClock className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
            <Pin className="h-3 w-3" aria-hidden="true" />
            Pinned · do this first
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-content-primary">{title}</span>
          {due ? <span className="block text-xs text-content-tertiary">Due {due}</span> : null}
        </span>
      </button>
      <button
        type="button"
        onClick={unpin}
        className="motion-focus mr-2 inline-flex h-10 shrink-0 items-center rounded-lg px-3 text-xs font-medium text-content-secondary hover:text-content-primary"
      >
        Unpin
      </button>
    </div>
  );
}

function formatDue(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
