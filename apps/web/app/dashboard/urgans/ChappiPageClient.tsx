'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minimize2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
import { InviteTeamBanner } from '@/components/chappi/InviteTeamBanner';
import { ChappiPageSkeleton } from '@/components/loading/ChappiPageSkeleton';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
import { useFirstReleaseRequired } from '@/components/releases/useFirstReleaseRequired';
import { FirstReleaseWin } from '@/components/workspace/FirstReleaseWin';

// Same flag AppTopbar reads for the nav icon — if a direct link is followed
// while the flag is off, bounce to the workspace instead of 404ing (the
// route itself has no server-side gate; the flag is inlined at build time).
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

// Same flag WorkspaceView reads for the "first win" reveal — Chappi's
// "New release" card can plausibly create a user's very first release too.
const FIRST_WIN_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FIRST_WIN === 'true';

export default function ChappiPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, isInitialLoading, loadCommandCenter } = useReleaseStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [winReleaseId, setWinReleaseId] = useState<string | null>(null);

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
    void loadCommandCenter();
  }, [authLoading, loadCommandCenter, router, user]);

  // URG-217 — same forced first-release flow as the workspace. This page is
  // the post-login landing surface when the UrgAns flag is on (HOME_PATH), so
  // it needs the auto-open too or a zero-release user lands somewhere the lock
  // never fires. See WorkspaceView for the fail-open rationale.
  const firstReleaseRequired = useFirstReleaseRequired();
  useEffect(() => {
    if (firstReleaseRequired) {
      setIsCreateModalOpen(true);
    }
  }, [firstReleaseRequired]);

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
          short viewports usable; the empty state centers within the
          definite height. */}
      <div className="chappi-shell-height flex flex-col">
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
        onCreated={(releaseId, plan) => {
          setIsCreateModalOpen(false);
          void loadCommandCenter();
          if (FIRST_WIN_ENABLED && releases.length === 0) {
            setWinReleaseId(releaseId);
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
        }}
      />

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
