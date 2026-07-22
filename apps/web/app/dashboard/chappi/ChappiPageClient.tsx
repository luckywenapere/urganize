'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useEntitlementsStore } from '@/stores/useEntitlementsStore';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
import { InviteTeamBanner } from '@/components/chappi/InviteTeamBanner';
import { ChappiPageSkeleton } from '@/components/loading/ChappiPageSkeleton';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
import { FirstReleaseWin } from '@/components/workspace/FirstReleaseWin';
import { FeatureUpsellCard } from '@/components/shared/FeatureUpsellCard';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';

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
  const entitlements = useEntitlementsStore((state) => state.entitlements);
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

  useEffect(() => {
    if (entitlements && !entitlements.chappiAssistant) {
      captureAnalyticsEvent(
        createPostHogEvent('gated_feature_attempted', {
          flag: 'chappiAssistant',
          surface: 'chappi_page',
        })
      );
    }
  }, [entitlements]);

  if (!CHAPPI_ENABLED) return null;

  // ONE skeleton, rendered here (not as a route-segment Suspense fallback) —
  // same rationale as WorkspaceView: SSR serializes the skeleton, hydration
  // reconciles the same JSX, no remount. entitlements === null holds the
  // skeleton one beat longer so paid users never see the upsell flash.
  if (authLoading || isInitialLoading || entitlements === null) {
    return <ChappiPageSkeleton />;
  }

  if (!entitlements.chappiAssistant) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <div className="max-w-md">
          <FeatureUpsellCard
            title="Chappi is part of the paid plan"
            body="Ask questions about your releases and tasks, and let Chappi take actions for you, once you upgrade."
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <InviteTeamBanner />

      {/* The conversation's empty state centers itself with justify-center,
          which needs a DEFINITE height to center within — AppShell's <main>
          is flex-1 under a min-h-screen column, so a child h-full resolves
          to content height and the block hugged the topbar. This wrapper
          pins the height to the viewport minus the chrome around it
          (topbar min-h-16 = 4rem, main pt-5 = 1.25rem, main pb-28 = 7rem
          mobile / md:pb-10 = 2.5rem), giving the PostHog-style vertical
          centering. Floor keeps short viewports usable; the active
          conversation scrolls inside the same box. */}
      <div className="h-[calc(100dvh-12.25rem)] min-h-[24rem] md:h-[calc(100dvh-7.75rem)]">
        <ChappiConversation onNewRelease={() => setIsCreateModalOpen(true)} />
      </div>

      <CreateReleaseModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(releaseId) => {
          setIsCreateModalOpen(false);
          void loadCommandCenter();
          if (FIRST_WIN_ENABLED && releases.length === 0) {
            setWinReleaseId(releaseId);
          } else {
            router.push(`/dashboard/releases/${releaseId}`);
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
