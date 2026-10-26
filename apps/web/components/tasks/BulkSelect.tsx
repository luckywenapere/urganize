'use client';

import { Check } from '@/components/icons';
import type { Task } from '@/types/tasks';

/**
 * Select mode's shared pieces (bulk mark as done, STMZ feedback 2026-10-22):
 * the list (TasksPanel) and the Timeline use the same Select button, the same
 * rule for what can be picked, and the same floating bar.
 */

// Same lift as the undo toast, so the select bar never lands under the phone's
// bottom nav.
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';

/** A row select mode can pick: open work only. Done and cancelled rows have
 * nothing left to mark, a locked one is waiting on earlier work, and an
 * unsynced one has no real id yet. */
export function isSelectableTask(task: Task): boolean {
  return (
    task.status !== 'done' &&
    task.status !== 'cancelled' &&
    task.status !== 'locked' &&
    !task.pendingSync
  );
}

/** "Select" / "Cancel". `bar` is the taller size used in the page bar. */
export function SelectToggleButton({
  selecting,
  bar = false,
  onToggle,
}: {
  selecting: boolean;
  bar?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selecting}
      className={`hit-44 relative motion-focus shrink-0 whitespace-nowrap rounded-full px-3 font-semibold transition-colors ${
        bar ? 'h-[34px] text-[13px]' : 'h-8 text-xs'
      } ${
        selecting
          ? 'text-content-secondary hover:text-content-primary'
          : 'border border-stroke-default bg-bg-surface text-content-primary hover:bg-bg-hover'
      }`}
    >
      {selecting ? 'Cancel' : 'Select'}
    </button>
  );
}

/** The floating bar: "N selected · Select all · Mark done". */
export function BulkSelectBar({
  count,
  allPicked,
  busy,
  onToggleAll,
  onMarkDone,
}: {
  count: number;
  allPicked: boolean;
  busy: boolean;
  onToggleAll: () => void;
  onMarkDone: () => void;
}) {
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 ${
        MOBILE_NAV_ENABLED ? 'mobile-nav-raise lg:bottom-8' : 'bottom-6 sm:bottom-8'
      }`}
    >
      <div
        role="toolbar"
        aria-label="Selected activities"
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full border border-stroke-default bg-bg-elevated py-2 pl-5 pr-2 text-sm shadow-lg"
      >
        <span className="whitespace-nowrap font-medium text-content-primary" aria-live="polite">
          {count} selected
        </span>
        <button
          type="button"
          onClick={onToggleAll}
          className="motion-focus whitespace-nowrap text-content-secondary transition-colors hover:text-content-primary"
        >
          {allPicked ? 'Clear' : 'Select all'}
        </button>
        <button
          type="button"
          onClick={onMarkDone}
          disabled={count === 0 || busy}
          className="motion-focus motion-press ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-4 font-semibold text-content-inverse transition-opacity disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
          {busy ? 'Marking…' : 'Mark done'}
        </button>
      </div>
    </div>
  );
}

/** The square box a picked or pickable row shows in select mode. */
export function SelectBox({ selected, disabled = false }: { selected: boolean; disabled?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border ${
        selected
          ? 'border-brand bg-brand text-content-inverse'
          : disabled
            ? 'border-stroke-subtle bg-bg-surface opacity-50'
            : 'border-stroke-control bg-transparent'
      }`}
    >
      {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </span>
  );
}
