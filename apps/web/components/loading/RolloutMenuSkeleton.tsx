'use client';

import { useId } from 'react';
import { createPortal } from 'react-dom';
import { useChappiStore } from '@/stores/useChappiStore';
import { useRailMenuStore } from '@/stores/useRailMenuStore';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { buildRolloutMenu } from '@/lib/rollout-menu';
import { ROLLOUT_MENU_FLAGS } from '@/lib/rollout-menu-flags';
import { SkeletonBlock } from './SkeletonBlock';

const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';
const SOCIAL_SHARE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_SOCIAL_SHARE === 'true';

/**
 * How many rows the real menu will have, worked out by asking the REAL builder
 * with the same flags rather than by counting flags here — so the placeholder
 * cannot drift from the menu it stands in for. Share is the one dialog row whose
 * presence is known from a flag alone; Archive and Change artist depend on data
 * this skeleton never has (who owns the rollout, whether it is finished, how many
 * artists there are), so they are not reserved. Under-reserving grows downward
 * when the real menu lands, which is the direction this file already prefers.
 */
const ROW_COUNT = buildRolloutMenu({
  releaseId: 'skeleton',
  activeScene: null,
  variant: 'rail',
  flags: ROLLOUT_MENU_FLAGS,
  share: SOCIAL_SHARE_ENABLED ? { label: 'Share' } : null,
}).length;

/**
 * The rollout menu's placeholder card. Its classes are the real card's, so the
 * chat under it does not jump when the menu arrives: the same border, the same
 * `pl-3 pr-2 py-2` padding, the same `mb-3` gap below, and rows of the same
 * `h-8` height in the same one-or-two columns.
 */
function RolloutMenuSkeleton() {
  // The same rule the real menu uses: two columns only while the chat is open.
  const chatOpen = useChappiStore((state) => CHAPPI_ENABLED && state.railOpen);
  return (
    <div
      aria-hidden="true"
      className="urg-cartouche mb-3 flex flex-col rounded-2xl border border-stroke-default bg-bg-surface py-2 pl-3 pr-2"
    >
      {/* 24.5px: the real header's height (a 16.5px line, `pt-0.5`, `pb-1.5`),
          measured off the rendered card rather than guessed, so the only thing
          that moves when the real menu arrives is the two rows this skeleton
          does not reserve. */}
      <div className="flex h-[24.5px] items-center px-2">
        <SkeletonBlock className="h-2.5 w-24" />
      </div>
      <div className={`grid gap-0.5 ${chatOpen ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {Array.from({ length: ROW_COUNT }).map((_, index) => (
          <div key={`menu-row-${index}`} className="flex h-8 items-center gap-2 px-2">
            <SkeletonBlock className="h-4 w-4 shrink-0 rounded-sm" />
            <SkeletonBlock className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Claims the right-hand column's slot and draws the menu's placeholder into it
 * while the workspace loads, so the column is already at its menu width and the
 * chat is already in its final place when the real menu takes over.
 *
 * Two owners hold the slot for a moment during that hand-over, which is why the
 * store keeps a LIST of owners: the skeleton's release must not empty a single
 * flag and collapse the column for a frame.
 *
 * Mount it only where a menu is genuinely coming — a desktop viewport, on
 * `/dashboard`, on a rollout — or it reserves a column for nothing.
 */
export function RolloutMenuSkeletonPortal() {
  const owner = useId();
  const slot = useRailMenuStore((state) => state.slot);
  const claim = useRailMenuStore((state) => state.claim);
  const release = useRailMenuStore((state) => state.release);

  useIsomorphicLayoutEffect(() => {
    claim(owner);
    return () => release(owner);
  }, [owner, claim, release]);

  if (!slot || ROW_COUNT === 0) return null;
  return createPortal(<RolloutMenuSkeleton />, slot);
}
