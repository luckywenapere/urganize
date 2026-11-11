'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock } from '@/components/icons';
import { consumeArrivingFromHome } from '@/lib/home-chat-glide';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
import { InviteTeamBanner } from '@/components/chappi/InviteTeamBanner';
import { UrgansActivityView } from '@/components/urgans-activity/UrgansActivityView';
import { ChappiPageSkeleton } from '@/components/loading/ChappiPageSkeleton';
import { RolloutCreateFlow } from '@/components/releases/RolloutCreateFlow';
import { useKeyboardOpen } from '@/lib/keyboard-viewport';
import { UrgansSessionsLayout } from '@/components/chappi/UrgansSessionsLayout';
import { showMain } from '@/components/shell/swipe/main-thread';
import { refreshMainChat } from '@/stores/useChappiHistoryStore';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';

// Same flag the shell reads for UrgAns — if a direct link is followed while the
// flag is off, bounce to the workspace instead of 404ing (the route itself has
// no server-side gate; the flag is inlined at build time).
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

// When on, the bottom bar carries this page's navigation, so the column has one
// row of chrome subtracted less: see .chappi-shell-height-nav in globals.css
// (kept in sync with ChappiPageSkeleton).
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';


/**
 * The Assistant page: ONE chat that never resets (#1207, Oyin, 11 Nov 2026),
 * with the morning brief waiting in it each day. On a computer it is
 * UrgansSessionsLayout (one centred chat); on a phone, one column. There is no
 * "New session" and no sessions list any more: rollout chats live in the
 * Rollouts list, and old sessions were folded into this chat.
 */
export default function ChappiPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { isInitialLoading, loadCommandCenter } = useReleaseStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const keyboardOpen = useKeyboardOpen();
  const isDesktop = useIsDesktopViewport();
  // Opened by the Home box sliding down: fade the chat in to finish the move.
  const [arrivedFromHome] = useState(() => consumeArrivingFromHome());
  // "What UrgAns did" swaps in for the chat (#849).
  const [showActivity, setShowActivity] = useState(false);

  // The Assistant is one chat that never resets (#1207): show it, and check
  // for anything new (the 8am brief) on arrival and when the tab comes back.
  // The computer layout does the same in UrgansSessionsLayout.
  useEffect(() => {
    if (!CHAPPI_ENABLED || isDesktop) return;
    void showMain().then(() => refreshMainChat());
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshMainChat();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isDesktop]);

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


  if (!CHAPPI_ENABLED) return null;

  // ONE skeleton, rendered here (not as a route-segment Suspense fallback) —
  // same rationale as WorkspaceView: SSR serializes the skeleton, hydration
  // reconciles the same JSX, no remount.
  if (authLoading || isInitialLoading) {
    return <ChappiPageSkeleton />;
  }

  if (isDesktop) {
    return (
      <>
        <UrgansSessionsLayout onNewRelease={() => setIsCreateModalOpen(true)} />
        <RolloutCreateFlow open={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      {/* One viewport-locked column (Claude-app mechanics, founder call,
          2026-07-23): the PAGE never scrolls — the transcript scrolls inside
          ChappiConversation and the input stays pinned at the bottom. Height
          comes from .chappi-shell-height (globals.css). The invite banner
          lives INSIDE the locked column — as a sibling above it, its height
          overflowed the calc and re-introduced page scroll. */}
      <div
        className={`${MOBILE_NAV_ENABLED ? 'chappi-shell-height-nav' : 'chappi-shell-height'} flex flex-col${
          arrivedFromHome ? ' urgans-arrive' : ''
        }`}
      >
        <div className="flex shrink-0 items-center justify-end">
          <button
            type="button"
            onClick={() => setShowActivity((current) => !current)}
            aria-pressed={showActivity}
            className="motion-focus motion-press mr-2 inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            {showActivity ? (
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {showActivity ? 'Back' : 'What I did'}
          </button>
        </div>
        <div className="shrink-0">
          <InviteTeamBanner />
        </div>
        <div className="min-h-0 min-w-0 flex-1">
          {showActivity ? <UrgansActivityView /> : null}
          {/* Hidden, never unmounted, while "What I did" shows: the upload and
              recap cards, and any reply still on its way, live in it. */}
          <div className={`h-full min-h-0 ${showActivity ? 'hidden' : ''}`}>
            <ChappiConversation onNewRelease={() => setIsCreateModalOpen(true)} />
          </div>
        </div>
      </div>

      <RolloutCreateFlow open={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
    </>
  );
}
