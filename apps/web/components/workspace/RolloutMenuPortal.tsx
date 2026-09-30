'use client';

import { useId } from 'react';
import { createPortal } from 'react-dom';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { useRailMenuStore } from '@/stores/useRailMenuStore';
import { RolloutMenu } from './RolloutMenu';
import { useRolloutMenuActions, type RolloutMenuDialogInput } from './useRolloutMenuActions';

/**
 * If the menu throws, give the slot back. The claim is what makes the column
 * reserve room for a menu, so a menu that crashed and went quiet while still
 * holding it would leave a blank 208px strip beside the workspace for nothing.
 * Releasing is idempotent, so the portal's own cleanup releasing again on the
 * way out is harmless.
 */
function GiveSlotBackOnCrash({ owner }: { owner: string }) {
  const release = useRailMenuStore((state) => state.release);
  useIsomorphicLayoutEffect(() => {
    release(owner);
  }, [owner, release]);
  return null;
}

type RolloutMenuPortalProps = {
  releaseId: string;
  releaseTitle: string;
  share?: RolloutMenuDialogInput | null;
  changeArtist?: RolloutMenuDialogInput | null;
  archive?: RolloutMenuDialogInput | null;
};

/**
 * Draws the rollout menu into the right-hand column.
 *
 * The menu is RENDERED by whoever mounts this (WorkspaceView — see the comment at
 * its mount for why exactly one place may) and lands in the column through a
 * portal into the slot RightRail exposes in the store. Two jobs, and the second
 * is the subtle one:
 *
 *  1. Portal the menu into the slot, once the slot exists.
 *  2. CLAIM the slot from the moment there is something to show, so the column
 *     knows a menu is coming and sizes itself for it. That happens in a LAYOUT
 *     effect, before the browser paints, so the first painted frame already has
 *     the column at its menu width: a plain effect would paint one frame at the
 *     old width and then jump.
 *
 * The rows are built HERE rather than inside the menu so the claim can depend on
 * whether there are any. With every optional feature off and no Share, Archive
 * or Change artist to offer, the menu is empty, and an empty menu must not
 * reserve a blank strip.
 *
 * It renders nothing while there is no slot (the server render, and any route
 * without the column), which keeps the server and first client render identical.
 *
 * The menu sits inside its own boundary: it is portalled OUT of the workspace but
 * is still a React child of it, so a throw in the menu would otherwise take the
 * whole workspace's error boundary with it. A broken menu should go quiet, not
 * take the activity list down.
 */
export function RolloutMenuPortal({
  releaseId,
  releaseTitle,
  share,
  changeArtist,
  archive,
}: RolloutMenuPortalProps) {
  const owner = useId();
  const slot = useRailMenuStore((state) => state.slot);
  const claim = useRailMenuStore((state) => state.claim);
  const release = useRailMenuStore((state) => state.release);

  const actions = useRolloutMenuActions({
    releaseId,
    variant: 'rail',
    share,
    changeArtist,
    archive,
  });
  const hasRows = actions.length > 0;

  useIsomorphicLayoutEffect(() => {
    if (!hasRows) return;
    claim(owner);
    return () => release(owner);
  }, [hasRows, owner, claim, release]);

  if (!slot || !hasRows) return null;

  return createPortal(
    <ErrorBoundary
      name="rollout-menu"
      onError={reportBoundaryError}
      fallback={<GiveSlotBackOnCrash owner={owner} />}
    >
      <RolloutMenu actions={actions} releaseTitle={releaseTitle} />
    </ErrorBoundary>,
    slot
  );
}
