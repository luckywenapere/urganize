'use client';

import { useAuthStore } from '@/lib/auth-store';
import { isSocialShareEnabled, type ShareReleaseFacts } from '@/lib/social-share';
import {
  hasOfferedFirstShare,
  markFirstShareOffered,
  markPendingFirstShare,
  shouldOfferFirstShare,
} from '@/lib/social-share-offer';
import { useShareStore } from '@/stores/useShareStore';

/**
 * Put the first-rollout share sheet into a create flow's sequence.
 *
 * The three create flows (the workspace, the UrgAns page and the topbar's
 * modal) each end in their own continuation: the planner intake, the
 * new-rollout guide, or a navigation. This wraps that continuation so the
 * sheet opens FIRST when this was the person's first rollout, and the rest of
 * the flow runs when it closes. Otherwise it is the continuation, untouched,
 * which is what keeps the flag-off path byte-for-byte what it was.
 *
 * One helper rather than three copies, because the three create flows have
 * already drifted apart once (the team-login step existed in two of them for
 * a while) and "open once" is exactly the kind of rule that drifts.
 *
 * The decision is made when the wrapper RUNS, not when it is built: the
 * team-login step sits between the two, and the answer should be the one true
 * at the moment the sheet would open.
 *
 * The offer is only spent when a sheet actually took it. The sheet is a lazy
 * chunk in AppShell, so on a slow connection a very quick first create can
 * finish before it has mounted. Then the flow carries straight on and a
 * pending marker is left instead, the same one onboarding uses, so the sheet
 * offers itself once it is up and nothing else is open.
 */
export function withFirstShareOffer(input: {
  releaseId: string;
  firstRelease: boolean | undefined;
  snapshot?: ShareReleaseFacts;
  then: () => void;
}): () => void {
  return () => {
    const userId = useAuthStore.getState().user?.id ?? null;
    const offer = shouldOfferFirstShare({
      enabled: isSocialShareEnabled(),
      firstRelease: input.firstRelease === true,
      alreadyOffered: hasOfferedFirstShare(userId),
    });
    if (!offer) {
      input.then();
      return;
    }
    const opened = useShareStore.getState().open({
      releaseId: input.releaseId,
      source: 'first_release',
      snapshot: input.snapshot,
      then: input.then,
    });
    if (opened) markFirstShareOffered(userId);
    else markPendingFirstShare(input.releaseId);
  };
}
