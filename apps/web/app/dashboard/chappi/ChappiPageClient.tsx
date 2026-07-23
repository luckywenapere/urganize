'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
import { InviteTeamBanner } from '@/components/chappi/InviteTeamBanner';
import { ChappiPageSkeleton } from '@/components/loading/ChappiPageSkeleton';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
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
          ChappiConversation and the input stays pinned at the bottom. The
          height is the viewport minus the chrome around it (topbar min-h-16
          = 4rem + its 1px border, main pt-5 = 1.25rem, main pb-28 = 7rem
          mobile / md:pb-10 = 2.5rem). The invite banner lives INSIDE the
          locked column — as a sibling above it, its height overflowed the
          calc and re-introduced page scroll. Floor keeps short viewports
          usable; the empty state centers within the definite height. */}
      <div className="flex h-[calc(100dvh-12.25rem-1px)] min-h-[24rem] flex-col md:h-[calc(100dvh-7.75rem-1px)]">
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
            router.push(
              plan === 'template'
                ? `/dashboard/releases/${releaseId}?new=1`
                : `/dashboard/releases/${releaseId}`
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
            router.push(`/dashboard/releases/${target}`);
          }}
        />
      ) : null}
    </>
  );
}
