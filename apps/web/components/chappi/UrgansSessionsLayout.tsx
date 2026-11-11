'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Clock } from '@/components/icons';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
import { InviteTeamBanner } from '@/components/chappi/InviteTeamBanner';
import { UrgansActivityView } from '@/components/urgans-activity/UrgansActivityView';
import { showMain } from '@/components/shell/swipe/main-thread';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { refreshMainChat } from '@/stores/useChappiHistoryStore';

/**
 * The Assistant on a computer: ONE chat that never resets (#1207, Oyin, 11 Nov
 * 2026; mock docs/mocks/assistant-one-chat). It replaced the sessions layout
 * (sessions down the left and "New session", 2026-10-26). Rollout chats stay
 * in the Rollouts list; old sessions were folded into this chat as earlier
 * pages ("Show earlier" at the top).
 *
 * Every morning at 8am Lagos the brief is written into this chat, so opening
 * the page, or coming back to the tab, checks for anything new.
 *
 * The file keeps its name so every import stays put. Sized by
 * .home-split-height, which leaves room for the top bar.
 */
export function UrgansSessionsLayout({ onNewRelease }: { onNewRelease: () => void }) {
  // "What AI did" shows in place of the chat (#849).
  const [showActivity, setShowActivity] = useState(false);

  useEffect(() => {
    void showMain().then(() => refreshMainChat());
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshMainChat();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return (
    <div className="home-split-height mx-auto flex w-full max-w-3xl flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 pb-2">
        <h1 className="font-display text-2xl text-content-primary">Assistant</h1>
        <button
          type="button"
          onClick={() => setShowActivity((current) => !current)}
          aria-pressed={showActivity}
          className="motion-focus motion-press inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          {showActivity ? (
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Clock className="h-4 w-4" aria-hidden="true" />
          )}
          {showActivity ? 'Back to the chat' : 'What AI did'}
        </button>
      </div>

      <section aria-label="AI" data-tour="nav-urgans" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0">
          <InviteTeamBanner />
        </div>
        {showActivity ? (
          <div className="min-h-0 flex-1">
            <UrgansActivityView />
          </div>
        ) : null}
        {/* Hidden, never unmounted, while "What AI did" shows: a reply on its
            way lives in it. */}
        <div className={`min-h-0 flex-1 ${showActivity ? 'hidden' : ''}`}>
          <ErrorBoundary name="urgans-conversation" onError={reportBoundaryError} fallback={null}>
            <ChappiConversation onNewRelease={onNewRelease} />
          </ErrorBoundary>
        </div>
      </section>
    </div>
  );
}
