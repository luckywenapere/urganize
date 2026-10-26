'use client';

import { useEffect, useRef } from 'react';
import { Plus } from '@/components/icons';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
import { ChappiHistoryList } from '@/components/chappi/ChappiHistoryList';
import { InviteTeamBanner } from '@/components/chappi/InviteTeamBanner';
import { withoutHomeChat } from '@/lib/chappi/home-chat';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { useChappiHistoryStore } from '@/stores/useChappiHistoryStore';
import { useChappiStore } from '@/stores/useChappiStore';

/**
 * The UrgAns view on a computer (2026-10-26, founder call, from the Hark
 * reference): the sessions down the left, the open session in the middle. The
 * Home and UrgAns pills in the top bar move between this and Home, so there is
 * no Chat | Sessions switch.
 *
 * Landing here with no session open puts the most recent one on screen. Home's
 * own chat is never a session, so arriving from Home (where it is on screen)
 * swaps it for the latest session, or a blank one when there are none. Done
 * once per visit: starting a new session afterwards is the person's own move.
 * Sized like Home's split (.home-split-height), which has the same chrome.
 */
export function UrgansSessionsLayout({ onNewRelease }: { onNewRelease: () => void }) {
  const summaries = useChappiHistoryStore((state) => state.summaries);
  const homeChatId = useChappiHistoryStore((state) => state.homeChatId);
  const listStatus = useChappiHistoryStore((state) => state.listStatus);
  const loadList = useChappiHistoryStore((state) => state.loadList);
  const open = useChappiHistoryStore((state) => state.open);
  const settled = useRef(false);

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
    else if (onHomeChat) chappi.reset();
  }, [listStatus, summaries, homeChatId, open]);

  const startNew = () => useChappiStore.getState().reset();

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
        <div className="min-h-0 flex-1">
          <ChappiHistoryList variant="panel" />
        </div>
      </aside>

      <section aria-label="UrgAns" data-tour="nav-urgans" className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0">
          <InviteTeamBanner />
        </div>
        <div className="min-h-0 flex-1">
          <ErrorBoundary name="urgans-conversation" onError={reportBoundaryError} fallback={null}>
            <ChappiConversation onNewRelease={onNewRelease} />
          </ErrorBoundary>
        </div>
      </section>
    </div>
  );
}
