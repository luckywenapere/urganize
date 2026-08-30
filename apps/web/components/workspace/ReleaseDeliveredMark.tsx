'use client';

import { Chappi, CHAPPI_MIN_SIZE } from '@urganize/ui';

/**
 * Every activity on the release is done. Kept as a named predicate so the
 * mobile Motion strip (WorkspaceView) and the desktop one
 * (WorkspaceDesktopFocused) cannot disagree about when the release is
 * delivered — the duplicated-condition problem this codebase has had to undo
 * for `isRecapEligible`, the four-flag scene expression and four copies of
 * `getAccessToken`.
 *
 * A release with no activities is NOT delivered: 0 of 0 is an empty release,
 * not a finished one.
 */
export function isReleaseDelivered(total: number, done: number) {
  return total > 0 && done === total;
}

/**
 * Chappi celebrating, beside the Motion readout that just reached 100%.
 *
 * Placed here rather than in a toast or a sheet on purpose. Task completion
 * already has a three-way contest for the one bottom surface (cover art ask,
 * then the check-in, then the undo toast — see useTaskStore.completeTask),
 * and a fourth claimant would either lose every time or push a real question
 * off the screen. The progress readout hitting done/done IS the confirmation,
 * so the celebration sits on it: no popup, no confetti, no sound.
 */
export function ReleaseDeliveredMark({ total, done }: { total: number; done: number }) {
  if (!isReleaseDelivered(total, done)) return null;

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Chappi
        pose="celebrating"
        size={CHAPPI_MIN_SIZE}
        ariaLabel="Every activity on this release is done"
      />
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
        Delivered
      </span>
    </span>
  );
}
