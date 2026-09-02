'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@urganize/ui';

/**
 * The standing "Approve plan" control, and the twenty-second nudge that shares
 * its spot.
 *
 * Rendered TWICE by PlanScene — once pinned under the header below `lg`, once
 * pinned to the base of the scroll column at `lg`+ — because those are two
 * genuinely different anchors on two genuinely different scroll boxes. That
 * duplication predates this component and is deliberate; what this file does is
 * make sure the two copies cannot drift in what they say or offer. Positioning
 * stays with the caller, where the comments explaining each anchor live: pass
 * it in as `className` and do not move it in here.
 *
 * THE PROMPT (2026-08-25, founder request). A manager scrolling a sixty-task
 * plan has no natural stopping point — nothing on the page says "this is
 * enough, you can start now" — so twenty seconds in, the bar grows a card that
 * says exactly that and offers to move them on. Three things about it:
 *
 *  1. It is NOT a modal, a toast or a fixed overlay. It expands the bar that is
 *     already on screen and already correctly positioned on both viewports. A
 *     free-floating card would have to dodge MobileNavBar and the TasksPanel
 *     dock, which both own the bottom edge of a phone, and would be one more
 *     thing to keep in sync with two scroll boxes.
 *  2. Dismissing it collapses the bar back to its plain state — the approve
 *     button never goes away. "Keep reviewing" costs the manager nothing.
 *  3. It never appears when approving would fail (no release date, nothing to
 *     schedule); PlanScene owns that gate. Nudging someone toward a disabled
 *     button is worse than staying quiet.
 */

type PlanApproveBarProps = {
  /** Tasks that would be scheduled — the count the bar reports. */
  activeCount: number;
  /** False when approving would be refused (no date, or nothing left to run). */
  canApprove: boolean;
  isApproving: boolean;
  /** Show the twenty-second nudge instead of the plain count line. */
  showPrompt: boolean;
  onApprove: () => void;
  onDismissPrompt: () => void;
  /** Positioning and surface, owned by the caller. See the note above. */
  className?: string;
  /** Button sizing, so the two anchors can keep their own tap targets. */
  buttonClassName?: string;
};

export function PlanApproveBar({
  activeCount,
  canApprove,
  isApproving,
  showPrompt,
  onApprove,
  onDismissPrompt,
  className = '',
  buttonClassName = '',
}: PlanApproveBarProps) {
  const approveButton = (
    <Button
      type="button"
      onClick={onApprove}
      disabled={isApproving || !canApprove}
      className={`shrink-0 justify-center ${buttonClassName}`}
    >
      {isApproving ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Scheduling
        </>
      ) : (
        'Approve plan'
      )}
    </Button>
  );

  // The row lives in an inner element rather than on the root in BOTH states,
  // so the caller's `hidden` / `lg:block` / `lg:hidden` is the only thing
  // deciding display. Putting `flex` on the same element as the caller's
  // visibility classes loses: Tailwind emits `.hidden` after `.flex`, so a
  // base `flex` alongside a base `hidden` is simply ignored, and the row would
  // silently stack instead of sitting on one line.
  if (!showPrompt) {
    return (
      <div className={className}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
            {activeCount} {activeCount === 1 ? 'task' : 'tasks'} ready
          </p>
          {approveButton}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Announced, never focused: the manager is mid-scroll and moving their
          cursor for them would be worse than the silence this replaces. */}
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-sm leading-6 text-content-primary">
          <span className="font-semibold">Seen enough?</span>{' '}
          <span className="text-content-secondary">
            Approve to schedule all {activeCount} {activeCount === 1 ? 'task' : 'tasks'}. You
            can edit them after.
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onDismissPrompt}
            disabled={isApproving}
            className={`shrink-0 justify-center ${buttonClassName}`}
          >
            Keep reading
          </Button>
          {approveButton}
        </div>
      </div>
    </div>
  );
}
