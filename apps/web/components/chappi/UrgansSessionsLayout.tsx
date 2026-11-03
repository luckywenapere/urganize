'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock, Plus } from '@/components/icons';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
import { ChappiHistoryList } from '@/components/chappi/ChappiHistoryList';
import { InviteTeamBanner } from '@/components/chappi/InviteTeamBanner';
import { UrgansActivityView } from '@/components/urgans-activity/UrgansActivityView';
import { withoutHomeChat } from '@/lib/chappi/home-chat';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { useChappiHistoryStore } from '@/stores/useChappiHistoryStore';
import { useChappiStore } from '@/stores/useChappiStore';

/**
 * The UrgAns view on a computer (2026-10-26, founder call, from the Hark
 * reference): the sessions down the left, the open session in the middle. Since
 * 2026-10-27 this is the only place a computer shows the chat: Home there has
 * none, and the UrgAns pill in the top bar, "Ask UrgAns" on Home and the
 * drawer's expand all lead here.
 *
 * Landing here with no session open puts the most recent one on screen. Home's
 * own chat (the phone's Home box) is never a session, so if it is on screen it
 * is swapped for the latest session, or a blank one when there are none. Done
 * once per visit: starting a new session afterwards is the person's own move.
 * Sized by .home-split-height, which leaves room for the top bar.
 */
export function UrgansSessionsLayout({ onNewRelease }: { onNewRelease: () => void }) {
  const summaries = useChappiHistoryStore((state) => state.summaries);
  const homeChatId = useChappiHistoryStore((state) => state.homeChatId);
  const listStatus = useChappiHistoryStore((state) => state.listStatus);
  const loadList = useChappiHistoryStore((state) => state.loadList);
  const open = useChappiHistoryStore((state) => state.open);
  const settled = useRef(false);
  // "What UrgAns did" shows in the middle in place of the session (#849).
  const [showActivity, setShowActivity] = useState(false);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (settled.current || listStatus !== 'ready') return;
    settled.current = true;
    const chappi = useChappiStore.getState();
    const onHomeChat =
      !!homeChatId &&
      (chappi.conversationId === homeChatId ||
        (chappi.conversationId === null && chappi.nextChatId === homeChatId));
    const idle = chappi.conversationId === null && chappi.messages.length === 0;
    if (!onHomeChat && !idle) return;
    const latest = withoutHomeChat(summaries, homeChatId)[0];
    if (latest) void open(latest.id);
    else if (onHomeChat) {
      // Keep a question carried here from "Ask UrgAns" (lib/ask-urgans.ts).
      const carried = chappi.input;
      chappi.reset();
      if (carried) useChappiStore.getState().setInput(carried);
    }
  }, [listStatus, summaries, homeChatId, open]);

  const startNew = () => {
    useChappiStore.getState().reset();
    setShowActivity(false);
  };

  return (
    <div className="home-split-height flex gap-6 xl:gap-8">
      <aside aria-label="Sessions" className="flex w-72 shrink-0 flex-col xl:w-80">
        <button
          type="button"
          onClick={startNew}
          className="motion-focus motion-press mb-3 inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New session
        </button>
        <button
          type="button"
          onClick={() => setShowActivity(true)}
          aria-pressed={showActivity}
          className={`motion-focus motion-press mb-3 inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors ${
            showActivity
              ? 'bg-bg-hover text-content-primary'
              : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
          }`}
        >
          <Clock className="h-4 w-4" aria-hidden="true" />
          What AI did
        </button>
        <div className="min-h-0 flex-1">
          <ChappiHistoryList variant="panel" onDone={() => setShowActivity(false)} />
        </div>
      </aside>

      <section aria-label="AI" data-tour="nav-urgans" className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0">
          <InviteTeamBanner />
        </div>
        {showActivity ? (
          <div className="min-h-0 flex-1">
            <UrgansActivityView />
          </div>
        ) : null}
        {/* Hidden, never unmounted, while the history shows: a reply on its
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
