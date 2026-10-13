'use client';

import { useAuthStore } from '@/lib/auth-store';
import { isSocialShareEnabled } from '@/lib/social-share';
import { deferFirstShare, hasOfferedFirstShare, shouldOfferFirstShare } from '@/lib/social-share-offer';

/**
 * Save the first-rollout share offer for the NEXT visit, when this was the
 * person's first rollout and the offer has not been made yet.
 *
 * It does not open the sheet. Until 2026-10-13 the sheet opened straight after
 * the create, before the planner, which asked people to tell fans about a
 * rollout that had no plan yet (flagged as "too early" by a prospect in a live
 * walkthrough). Onboarding had already moved its offer to Home on the next
 * visit (2026-10-11); this is the same move for every other way in. The sheet
 * host (`ShareSheet`) opens the saved offer once, on Home, in a later visit, at
 * a quiet moment. The rollout's own Share button works the whole time.
 *
 * Never throws: every caller is in the middle of a create flow.
 */
export function deferFirstShareOffer(releaseId: string, firstRelease: boolean | undefined): void {
  const userId = useAuthStore.getState().user?.id ?? null;
  if (!userId) return;
  const offer = shouldOfferFirstShare({
    enabled: isSocialShareEnabled(),
    firstRelease: firstRelease === true,
    alreadyOffered: hasOfferedFirstShare(userId),
  });
  if (offer) deferFirstShare(userId, releaseId);
}

/**
 * A create flow's continuation, with the first-rollout share offer saved for
 * the next visit on the way through. The continuation always runs straight
 * away: nothing waits on a sheet any more.
 *
 * Kept as a wrapper (rather than a call at each site) because the three create
 * flows (the workspace, the UrgAns page and the topbar's modal) have drifted
 * apart before, and because the decision should be made when the wrapper RUNS,
 * after the team-login step, not when it is built.
 */
export function withFirstShareOffer(input: {
  releaseId: string;
  firstRelease: boolean | undefined;
  then: () => void;
}): () => void {
  return () => {
    deferFirstShareOffer(input.releaseId, input.firstRelease);
    input.then();
  };
}
