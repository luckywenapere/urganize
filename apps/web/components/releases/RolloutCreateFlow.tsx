'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
import { ReleaseAccessStep } from '@/components/releases/ReleaseAccessStep';
import { useStartTestRelease } from '@/components/releases/useStartTestRelease';
import { FirstReleaseWin } from '@/components/workspace/FirstReleaseWin';
import { withFirstShareOffer } from '@/components/share/withFirstShareOffer';
import { useToast } from '@/components/shared/ToastProvider';
import { isTestReleaseEnabled } from '@/lib/test-release';

const FIRST_WIN_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FIRST_WIN === 'true';
const TEAM_LOGINS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TEAM_LOGINS === 'true';
const TYPE_FIRST_CREATE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE === 'true';
const TEST_RELEASE_ENABLED = isTestReleaseEnabled();

type RolloutCreateFlowProps = {
  open: boolean;
  onClose: () => void;
  /** Runs right after a rollout is made, before any navigation (Home reloads its own data). */
  onCreated?: () => void;
};

/**
 * Making a rollout from Home or from the UrgAns page (2026-10-07). Both pages
 * used to carry their own copy of this, and Home's had fallen behind (no
 * type-first create, no first-win reveal, no test rollout link). Since desktop
 * Home now carries the conversation, its "New rollout" has to behave exactly
 * like the chat page's did, so the two share this.
 *
 * The order after a rollout is made is the one WorkspaceView's onCreated
 * records in full: type-first create goes straight into the rollout; otherwise
 * the team-login step (when on) comes first, then the first-rollout share
 * offer, then the first-win reveal, the planner, or the new-rollout guide.
 */
export function RolloutCreateFlow({ open, onClose, onCreated }: RolloutCreateFlowProps) {
  const router = useRouter();
  const releaseCount = useReleaseStore((state) => state.releases.length);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const [winReleaseId, setWinReleaseId] = useState<string | null>(null);
  const [accessStep, setAccessStep] = useState<{
    releaseId: string;
    title: string | null;
    resume: () => void;
  } | null>(null);

  // The test link closes the modal before it runs, so a failure has nowhere
  // inline to go: the shared toast stack is the surface.
  const { pushToast } = useToast();
  const { startTestRelease } = useStartTestRelease({
    onError: (message) => pushToast(message, 'error'),
  });

  return (
    <>
      <CreateReleaseModal
        open={open}
        onClose={onClose}
        onStartTestRelease={TEST_RELEASE_ENABLED ? startTestRelease : undefined}
        onCreated={(releaseId, plan, result) => {
          onClose();
          void loadCommandCenter({ force: true });
          onCreated?.();
          const plannerPending = result?.plannerPending === true;
          const openIntake = () =>
            usePlannerStore.getState().openIntake({
              source: 'empty_state',
              releaseId,
              ...(result?.releaseType ? { prefill: { releaseType: result.releaseType } } : {}),
            });

          if (TYPE_FIRST_CREATE_ENABLED) {
            withFirstShareOffer({
              releaseId,
              firstRelease: result?.firstRelease,
              snapshot: result?.share,
              then: () => {
                router.push(`/dashboard?release=${releaseId}`);
                if (plannerPending) openIntake();
              },
            })();
            return;
          }

          const resume = () => {
            if (FIRST_WIN_ENABLED && releaseCount === 0 && !plannerPending) {
              setWinReleaseId(releaseId);
            } else if (plannerPending) {
              router.push(`/dashboard?release=${releaseId}`);
              openIntake();
            } else {
              router.push(
                plan === 'template'
                  ? `/dashboard?release=${releaseId}&new=1`
                  : `/dashboard?release=${releaseId}`
              );
            }
          };
          const continueAfterAccess = withFirstShareOffer({
            releaseId,
            firstRelease: result?.firstRelease,
            snapshot: result?.share,
            then: resume,
          });
          if (TEAM_LOGINS_ENABLED) {
            setAccessStep({ releaseId, title: result?.title ?? null, resume: continueAfterAccess });
            return;
          }
          continueAfterAccess();
        }}
      />

      {accessStep ? (
        <ReleaseAccessStep
          releaseId={accessStep.releaseId}
          releaseTitle={accessStep.title}
          onDone={() => {
            const { resume } = accessStep;
            setAccessStep(null);
            resume();
          }}
        />
      ) : null}

      {winReleaseId ? (
        <FirstReleaseWin
          releaseId={winReleaseId}
          onDone={() => {
            const target = winReleaseId;
            setWinReleaseId(null);
            router.push(`/dashboard?release=${target}`);
          }}
        />
      ) : null}
    </>
  );
}
