'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minimize2 } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
import { InviteTeamBanner } from '@/components/chappi/InviteTeamBanner';
import { ChappiPageSkeleton } from '@/components/loading/ChappiPageSkeleton';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { useFirstReleasePrompt } from '@/components/releases/useFirstReleasePrompt';
import { useStartTestRelease } from '@/components/releases/useStartTestRelease';
import { isTestReleaseEnabled } from '@/lib/test-release';
import { useToast } from '@/components/shared/ToastProvider';
import { FirstReleaseWin } from '@/components/workspace/FirstReleaseWin';
import { ReleaseAccessStep } from '@/components/releases/ReleaseAccessStep';
import { useKeyboardOpen } from '@/lib/keyboard-viewport';

// Same flag AppTopbar reads for the nav icon — if a direct link is followed
// while the flag is off, bounce to the workspace instead of 404ing (the
// route itself has no server-side gate; the flag is inlined at build time).
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

// Same flag WorkspaceView reads for the "first win" reveal — Chappi's
// "New rollout" card can plausibly create a user's very first release too.
const FIRST_WIN_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FIRST_WIN === 'true';
const TEAM_LOGINS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TEAM_LOGINS === 'true';
// Type-first create (2026-09-01): tap-the-type creation lands straight in the
// release, skipping the access step / first-win / ?new=1 — see WorkspaceView's
// onCreated for the full rationale; this handler mirrors it.
const TYPE_FIRST_CREATE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE === 'true';

// When on, MobileNavBar carries this page's below-lg navigation, so the
// column has one row of chrome subtracted less: see
// .chappi-shell-height-nav in globals.css (kept in sync with
// ChappiPageSkeleton). The dock retires on this route entirely once the
// flag is on.
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';

// The one-tap test path — the first-release pop-up this page mounts carries
// the same "Just looking?" link WorkspaceView's does, since the deferred
// prompt can fire on either surface. Read through the predicate so the env
// var name is typed once (lib/test-release.ts).
const TEST_RELEASE_ENABLED = isTestReleaseEnabled();

export default function ChappiPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, isInitialLoading, loadCommandCenter } = useReleaseStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [winReleaseId, setWinReleaseId] = useState<string | null>(null);
  // See WorkspaceView for the shape and why the continuation is deferred.
  const [accessStep, setAccessStep] = useState<{
    releaseId: string;
    title: string | null;
    resume: () => void;
  } | null>(null);
  const keyboardOpen = useKeyboardOpen();

  // iOS scrolls the document to reveal a focused field BEFORE the layout has
  // had a chance to react, and this page's own contract is that it never
  // scrolls at all — so whatever offset that left behind is pure dead space
  // once the column pins itself to the visible region. Undoing it here
  // rather than in the shared bridge on purpose: on an ordinary long page a
  // forced scroll-to-top mid-typing would be sabotage, not a fix. `instant`
  // overrides globals.css's `scroll-behavior: smooth`, which would otherwise
  // animate this in front of the user.
  useEffect(() => {
    if (!keyboardOpen) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [keyboardOpen]);

  // Fire immediately rather than behind authLoading — see the same pattern in
  // WorkspaceView: the store reads its own token from getSession() (local), so
  // waiting on the auth store's GoTrue round trip only delays real data.
  useEffect(() => {
    if (!CHAPPI_ENABLED) return;
    void loadCommandCenter();
  }, [loadCommandCenter]);

  useEffect(() => {
    if (!CHAPPI_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    // Backstop if the session wasn't readable at mount (no-op otherwise).
    void loadCommandCenter();
  }, [authLoading, loadCommandCenter, router, user]);

  // The deferred first-release prompt — same hook as the workspace. Kept here
  // even though the catalog is the landing surface again (2026-08-12): a
  // zero-release user can still arrive on this page from the topbar, the
  // mobile nav or an installed PWA pointed at the old start_url, and the
  // prompt has to arm wherever they land. The sessionStorage countdown
  // (lib/first-release-prompt.ts) is what makes the two surfaces one prompt.
  useFirstReleasePrompt(() => setIsCreateModalOpen(true));

  // The test link closes the modal before it runs, so this page has no inline
  // slot left for a failure — the shared toast stack is the surface (this page
  // renders inside AppShell's ToastProvider; a silent failure is the one
  // unacceptable outcome). Success navigates to /dashboard scoped to the new
  // test release, where the standing banner takes over.
  const { pushToast } = useToast();
  const { startTestRelease } = useStartTestRelease({
    onError: (message) => pushToast(message, 'error'),
  });

  if (!CHAPPI_ENABLED) return null;

  // ONE skeleton, rendered here (not as a route-segment Suspense fallback) —
  // same rationale as WorkspaceView: SSR serializes the skeleton, hydration
  // reconciles the same JSX, no remount.
  if (authLoading || isInitialLoading) {
    return <ChappiPageSkeleton />;
  }

  return (
    <>
      {/* One viewport-locked column (Claude-app mechanics, founder call,
          2026-07-23): the PAGE never scrolls — the transcript scrolls inside
          ChappiConversation and the input stays pinned at the bottom. Height
          comes from .chappi-shell-height (globals.css), which matches
          AppShell's .chappi-main-padding term-for-term. The invite banner
          lives INSIDE the locked column — as a sibling above it, its height
          overflowed the calc and re-introduced page scroll. Floor keeps
          short viewports usable; the empty state centers vertically within
          the definite height. */}
      <div className={`${MOBILE_NAV_ENABLED ? 'chappi-shell-height-nav' : 'chappi-shell-height'} flex flex-col`}>
        {/* Collapse — the mirror image of ChappiSidePanel's expand button.
            Desktop-only (the split view it returns to doesn't exist below
            lg). Opens the side rail explicitly (an intentional "give me the
            split" action, so it overrides an earlier close) and restores
            `?release=` from the assistant's own scope so the rail re-opens
            live-synced to whatever release the conversation was pinned to,
            exactly as if the catalog had been scoped to it. */}
        <div className="hidden shrink-0 justify-end lg:flex">
          <button
            type="button"
            onClick={() => {
              const { scopedReleaseId, setRailOpen } = useChappiStore.getState();
              setRailOpen(true);
              router.push(
                scopedReleaseId ? `/dashboard?release=${scopedReleaseId}` : '/dashboard'
              );
            }}
            aria-label="Collapse into workspace"
            title="Back to workspace"
            className="motion-focus motion-press grid h-7 w-7 place-items-center text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="shrink-0">
          <InviteTeamBanner />
        </div>
        <div className="min-h-0 flex-1">
          <ChappiConversation onNewRelease={() => setIsCreateModalOpen(true)} />
        </div>
      </div>

      <CreateReleaseModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onStartTestRelease={TEST_RELEASE_ENABLED ? startTestRelease : undefined}
        onCreated={(releaseId, plan, result) => {
          setIsCreateModalOpen(false);
          void loadCommandCenter();
          const plannerPending = result?.plannerPending === true;
          // TYPE-FIRST CREATE (2026-09-01): straight into the release — same
          // branch, same rationale as WorkspaceView's onCreated.
          if (TYPE_FIRST_CREATE_ENABLED) {
            router.push(`/dashboard?release=${releaseId}`);
            if (plannerPending) {
              usePlannerStore.getState().openIntake({
                source: 'empty_state',
                releaseId,
                ...(result?.releaseType
                  ? { prefill: { releaseType: result.releaseType } }
                  : {}),
              });
            }
            return;
          }
          // Deferred continuation, mirroring WorkspaceView's onCreated: the
          // compulsory team-login step runs first, then hands back to the
          // original branches unchanged.
          const resume = () => {
            if (FIRST_WIN_ENABLED && releases.length === 0 && !plannerPending) {
              setWinReleaseId(releaseId);
            } else if (plannerPending) {
              // Straight into the intake, same as the workspace's create flow:
              // planning is the whole point of having chosen a rollout plan.
              // Previously this path pushed ?new=1 and the user had to find
              // the Plan card themselves — where the intake then re-asked the
              // release type the modal had already collected. The prefill is
              // what stops that double-ask. (The intake modal is mounted
              // app-wide by AppShell, so it survives this navigation.)
              router.push(`/dashboard?release=${releaseId}`);
              usePlannerStore.getState().openIntake({
                source: 'empty_state',
                releaseId,
                ...(result?.releaseType
                  ? { prefill: { releaseType: result.releaseType } }
                  : {}),
              });
            } else {
              // Same one-time getting-started guide as the workspace's create
              // flow — template creations only (see WorkspaceView's onCreated).
              // Lands on the workspace scoped to the new release (2026-08-04 —
              // the release detail page was removed).
              router.push(
                plan === 'template'
                  ? `/dashboard?release=${releaseId}&new=1`
                  : `/dashboard?release=${releaseId}`
              );
            }
          };
          // Creating a release from the assistant is still creating a release,
          // so it gets the same compulsory step. Skipping it here would make
          // the step's presence depend on which button you happened to use.
          if (TEAM_LOGINS_ENABLED) {
            setAccessStep({ releaseId, title: result?.title ?? null, resume });
            return;
          }
          resume();
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
