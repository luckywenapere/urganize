'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useHomeStore } from '@/stores/useHomeStore';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { HomeSkeleton } from '@/components/loading/HomeSkeleton';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
import { useFirstReleasePrompt } from '@/components/releases/useFirstReleasePrompt';
import { ReleaseAccessStep } from '@/components/releases/ReleaseAccessStep';
import { withFirstShareOffer } from '@/components/share/withFirstShareOffer';
import { ManagerMidReleaseView } from '@/components/home/ManagerMidReleaseView';
import { HomeNotBuiltYet } from '@/components/home/HomeNotBuiltYet';
import { ManagerQuietView } from '@/components/home/ManagerQuietView';

// Same loop-guard reasoning as HOME_PATH (lib/home-path.ts) and
// ChappiPageClient's own CHAPPI_ENABLED read: the route itself has no
// server-side gate, so an off flag has to bounce here.
const HOME_ENABLED = process.env.NEXT_PUBLIC_FEATURE_HOME === 'true';
const TEAM_LOGINS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TEAM_LOGINS === 'true';

/**
 * The Home tab's page. Follows ChappiPageClient's established shape for a
 * dashboard sub-route: fire the data load immediately (not gated behind
 * authLoading — the store reads its own token from getSession()), bounce on
 * a resolved "no session" or a flag-off deployment, render ONE skeleton
 * until both auth and Home's own data are ready.
 *
 * The create-release flow here is DELIBERATELY SIMPLER than
 * WorkspaceView's/ChappiPageClient's: it wires the compulsory team-login
 * step and the first-rollout share offer (both correctness-affecting), but
 * does not yet branch on NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE or
 * NEXT_PUBLIC_FEATURE_FIRST_WIN the way those two pages do. Worth widening
 * in a follow-up step if Home needs to match that behavior exactly.
 */
export default function HomePageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { isInitialLoading: releasesLoading, loadCommandCenter } = useReleaseStore();
  const { data: home, isLoading: homeLoading, load: loadHome } = useHomeStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [accessStep, setAccessStep] = useState<{
    releaseId: string;
    title: string | null;
    resume: () => void;
  } | null>(null);

  useEffect(() => {
    if (!HOME_ENABLED) return;
    void loadHome();
  }, [loadHome]);

  useEffect(() => {
    if (!HOME_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    // Backstop if the session wasn't readable at mount (no-op otherwise).
    void loadHome();
  }, [authLoading, loadHome, router, user]);

  // The deferred first-release prompt — same hook every landing surface uses.
  useFirstReleasePrompt(() => setIsCreateModalOpen(true));

  if (!HOME_ENABLED) return null;

  if (authLoading || homeLoading || !home) {
    return <HomeSkeleton />;
  }

  return (
    <>
      {home.role === 'manager' && home.state === 'manager_mid_release' ? (
        <ManagerMidReleaseView home={home} viewerId={user?.id ?? ''} />
      ) : home.state === 'manager_all_clear' || home.state === 'manager_between' ? (
        <ManagerQuietView home={home} onNewRollout={() => setIsCreateModalOpen(true)} />
      ) : (
        <HomeNotBuiltYet home={home} />
      )}

      <CreateReleaseModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(releaseId, plan, result) => {
          setIsCreateModalOpen(false);
          void loadCommandCenter({ force: true });
          void loadHome({ force: true });
          const plannerPending = result?.plannerPending === true;

          const resume = () => {
            if (plannerPending) {
              router.push(`/dashboard?release=${releaseId}`);
              usePlannerStore.getState().openIntake({
                source: 'empty_state',
                releaseId,
                ...(result?.releaseType ? { prefill: { releaseType: result.releaseType } } : {}),
              });
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

      {/* Kept in sync with useReleaseStore's own loading state so a create
          modal opened while the catalog's data is still settling doesn't
          race — mirrors WorkspaceView/ChappiPageClient's own reliance on
          isInitialLoading for the same reason (unused here beyond keeping
          the store subscription live so onCreated's release count reads
          are correct). */}
      {releasesLoading ? null : null}
    </>
  );
}
