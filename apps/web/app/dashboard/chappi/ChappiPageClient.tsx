'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
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
      <ChappiConversation onNewRelease={() => setIsCreateModalOpen(true)} />

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
