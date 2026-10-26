'use client';

import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight } from '@/components/icons';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { InviteTeamBanner } from '@/components/chappi/InviteTeamBanner';
import { ChappiConversationSkeleton } from '@/components/loading/ChappiConversationSkeleton';
import { isChappiHistoryEnabled } from '@/lib/chappi/history-flag';
import { COMPOSER_FOCUS_EVENT } from '@/lib/composer-focus';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { showHomeChat, useChappiHistoryStore } from '@/stores/useChappiHistoryStore';
import {
  HOME_LIST_COLLAPSED_KEY,
  HOME_LIST_COLLAPSED_VERSION,
  useHomeChatStore,
} from '@/stores/useHomeChatStore';
import { reportBoundaryError } from '@/lib/report-boundary-error';

// The conversation is heavy and a phone never shows it on Home, so it is its
// own chunk, asked for only by this desktop layout.
const ChappiConversation = dynamic(
  () => import('@/components/chappi/ChappiConversation').then((m) => m.ChappiConversation),
  { ssr: false, loading: () => <ChappiConversationSkeleton /> }
);

const HISTORY_ENABLED = isChappiHistoryEnabled();

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/**
 * Home on a computer is the UrgAns chat (2026-10-07, founder call, from the
 * Hark reference): Home's own column on the left, the live conversation on the
 * right, both on screen. The page itself never scrolls: each side scrolls on
 * its own and the message box stays at the bottom of the right side.
 *
 * - The conversation is Home's one permanent chat (lib/chappi/home-chat.ts).
 *   Separate sessions live on the UrgAns page (2026-10-26, founder call): the
 *   Chat | Sessions switch that used to sit above the conversation is gone, and
 *   the Home and UrgAns pills in the top bar move between the two views.
 * - A round handle on the divider folds the left column away and brings it
 *   back (2026-10-26, founder call), remembered on this device. The Home pill
 *   no longer folds it.
 * - The right side carries data-tour="nav-urgans", so the tour's UrgAns step
 *   points here (the floating button is not drawn on Home).
 *
 * Mounted only at lg and up (HomePageClient), so ChappiConversation is never in
 * the DOM twice.
 */
export function HomeDesktopSplit({
  children,
  onNewRelease,
}: {
  /** The Home state view: greeting first, then the stacks. */
  children: ReactNode;
  /** Opens Home's own create-rollout modal. */
  onNewRelease: () => void;
}) {
  const homeChatId = useChappiHistoryStore((state) => state.homeChatId);
  const [focusRequest, setFocusRequest] = useState(0);
  const listCollapsed = useHomeChatStore((state) => state.listCollapsed);
  const setListCollapsed = useHomeChatStore((state) => state.setListCollapsed);

  // The fold is read once on mount, never during render, so the first paint
  // matches the server's (open) and a stored choice applies straight after.
  useEffect(() => {
    const stored = readPersistedState(HOME_LIST_COLLAPSED_KEY, HOME_LIST_COLLAPSED_VERSION, isBoolean);
    if (stored !== null) useHomeChatStore.getState().setListCollapsed(stored);
  }, []);

  const toggleList = () => {
    const next = !listCollapsed;
    setListCollapsed(next);
    writePersistedState(HOME_LIST_COLLAPSED_KEY, HOME_LIST_COLLAPSED_VERSION, next);
  };

  // Home's chat is one permanent conversation (founder call, 2026-10-10): on
  // arrival it is what is on screen, whatever a resume would otherwise have
  // put there. Runs once history knows who this is.
  useEffect(() => {
    if (!HISTORY_ENABLED || !homeChatId) return;
    void showHomeChat();
  }, [homeChatId]);

  // "Ask UrgAns" from the search bar puts the question in the box and asks for
  // the cursor (lib/ask-urgans.ts).
  useEffect(() => {
    const focus = () => {
      void showHomeChat();
      setFocusRequest((count) => count + 1);
    };
    window.addEventListener(COMPOSER_FOCUS_EVENT, focus);
    return () => window.removeEventListener(COMPOSER_FOCUS_EVENT, focus);
  }, []);

  return (
    <div className="home-split-height flex">
      {/* Folded by the handle: its width glides to zero, and it is inert and
          hidden from assistive tech, but kept mounted so nothing in it reloads
          when it comes back. */}
      <div
        id="home-list-column"
        aria-hidden={listCollapsed || undefined}
        inert={listCollapsed || undefined}
        className={`home-scene-container shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none ${
          listCollapsed ? 'w-0' : 'w-[26rem] xl:w-[28rem]'
        }`}
      >
        <div className="h-full w-[26rem] overflow-y-auto overscroll-contain pb-2 pr-1 xl:w-[28rem]">
          {children}
        </div>
      </div>

      {/* The divider and its handle. */}
      <div className="relative flex w-8 shrink-0 items-center justify-center xl:w-10">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-stroke-subtle" aria-hidden="true" />
        <button
          type="button"
          onClick={toggleList}
          aria-expanded={!listCollapsed}
          aria-controls="home-list-column"
          aria-label={listCollapsed ? 'Show Home' : 'Hide Home'}
          title={listCollapsed ? 'Show Home' : 'Hide Home'}
          className="motion-focus motion-press relative grid h-6 w-6 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary shadow-sm transition-colors hover:text-content-primary"
        >
          {listCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      <section aria-label="UrgAns" data-tour="nav-urgans" className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0">
          <InviteTeamBanner />
        </div>

        <div className="min-h-0 flex-1">
          {/* Fenced so a broken conversation (a stored message it cannot draw)
              costs the chat side, not the whole of Home. */}
          <ErrorBoundary name="home-conversation" onError={reportBoundaryError} fallback={<ConversationFallback />}>
            <ChappiConversation
              onNewRelease={onNewRelease}
              headingLevel="h2"
              focusRequest={focusRequest}
            />
          </ErrorBoundary>
        </div>
      </section>
    </div>
  );
}

/** What the chat side shows if the conversation itself fails to draw. */
function ConversationFallback() {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center">
      <p className="max-w-xs text-sm text-content-secondary">
        The chat could not load here. Open UrgAns from the menu to keep going.
      </p>
    </div>
  );
}
