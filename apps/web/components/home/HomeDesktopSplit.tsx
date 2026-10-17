'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { ArrowUp, MessageCircle } from '@/components/icons';
import { SEND_ARROW_CLASS, SEND_BUTTON_CLASS } from '@/components/chappi/send-button';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { ChappiHistoryList } from '@/components/chappi/ChappiHistoryList';
import { InviteTeamBanner } from '@/components/chappi/InviteTeamBanner';
import { ChappiConversationSkeleton } from '@/components/loading/ChappiConversationSkeleton';
import { isChappiHistoryEnabled } from '@/lib/chappi/history-flag';
import { COMPOSER_FOCUS_EVENT } from '@/lib/composer-focus';
import { useChappiStore } from '@/stores/useChappiStore';
import { showHomeChat, useChappiHistoryStore } from '@/stores/useChappiHistoryStore';
import { useHomeChatStore } from '@/stores/useHomeChatStore';
import { reportBoundaryError } from '@/lib/report-boundary-error';

// The conversation is heavy and a phone never shows it on Home, so it is its
// own chunk, asked for only by this desktop layout.
const ChappiConversation = dynamic(
  () => import('@/components/chappi/ChappiConversation').then((m) => m.ChappiConversation),
  { ssr: false, loading: () => <ChappiConversationSkeleton /> }
);

const HISTORY_ENABLED = isChappiHistoryEnabled();

// How many of these layouts are on screen. React's development double mount
// unmounts and mounts again at once, so the switch is only put back to the
// conversation once the count has stayed at zero, which only a real leave does.
let liveSplits = 0;

/** The conversation's column (ChappiConversation's page variant): centred,
 *  46rem at most, 0.25rem in from each side. The Chat | Sessions switch sits
 *  in it so it lines up with the chat beneath. */
const CHAT_COLUMN = 'mx-auto w-full max-w-[46rem] px-1';

const switchButtonClass = (active: boolean) =>
  `motion-focus motion-press inline-flex h-8 items-center rounded-full px-3.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-bg-surface text-content-primary shadow-sm ring-1 ring-stroke-default'
      : 'text-content-secondary hover:text-content-primary'
  }`;

/**
 * Home on a computer is the UrgAns chat (2026-10-07, founder call, from the
 * Hark reference): Home's own column on the left, the live conversation on the
 * right, both on screen. The page itself never scrolls: each side scrolls on
 * its own and the message box stays at the bottom of the right side.
 *
 * - The Home chat is one permanent conversation (lib/chappi/home-chat.ts); the
 *   "Chat" tab always returns to it. The Sessions box makes separate chats
 *   that collect under Sessions. (The "+ New session" button under the stacks
 *   was removed 2026-10-14, founder call.)
 * - With session history on, a "Chat | Sessions" switch at the top of the right
 *   side swaps the conversation for the list of past sessions, the way the
 *   reference swaps to its projects. The conversation stays mounted, only
 *   hidden, while the list shows: its upload and recap cards, and any reply
 *   still on its way, live in it.
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
  const pane = useHomeChatStore((state) => state.pane);
  const setPane = useHomeChatStore((state) => state.setPane);
  const mode = useHomeChatStore((state) => state.mode);
  const homeChatId = useChappiHistoryStore((state) => state.homeChatId);
  const [focusRequest, setFocusRequest] = useState(0);
  const showSessions = HISTORY_ENABLED && pane === 'sessions';
  const onHome = !showSessions && mode === 'home';

  // Home's chat is one permanent conversation (founder call, 2026-10-10): on
  // arrival it is what is on screen, whatever a resume would otherwise have
  // put there. Runs once history knows who this is.
  useEffect(() => {
    if (!HISTORY_ENABLED || !homeChatId) return;
    if (useHomeChatStore.getState().mode === 'home') void showHomeChat();
  }, [homeChatId]);
  const listCollapsed = useHomeChatStore((state) => state.listCollapsed);

  // Put the switch back on the conversation when Home is left.
  useEffect(() => {
    liveSplits += 1;
    return () => {
      liveSplits -= 1;
      window.setTimeout(() => {
        if (liveSplits === 0) {
          useHomeChatStore.getState().setPane('chat');
          useHomeChatStore.getState().setMode('home');
          useHomeChatStore.getState().setListCollapsed(false);
        }
      }, 0);
    };
  }, []);

  // "Ask UrgAns" from the search bar puts the question in the box and asks for
  // the cursor (lib/ask-urgans.ts).
  useEffect(() => {
    const focus = () => {
      useHomeChatStore.getState().setPane('chat');
      useHomeChatStore.getState().setMode('home');
      void showHomeChat();
      setFocusRequest((count) => count + 1);
    };
    window.addEventListener(COMPOSER_FOCUS_EVENT, focus);
    return () => window.removeEventListener(COMPOSER_FOCUS_EVENT, focus);
  }, []);

  return (
    <div className="home-split-height flex gap-6 xl:gap-8">
      {/* Folded by the Home pill in the top bar: hidden and inert, but kept
          mounted so nothing in it reloads when it comes back. */}
      <div
        id="home-list-column"
        aria-hidden={listCollapsed || undefined}
        inert={listCollapsed || undefined}
        className={`home-scene-container w-[26rem] shrink-0 overflow-y-auto overscroll-contain pb-2 pr-1 xl:w-[28rem] ${
          listCollapsed ? 'hidden' : ''
        }`}
      >
        {children}
      </div>

      <section
        aria-label="UrgAns"
        data-tour="nav-urgans"
        className={`flex min-w-0 flex-1 flex-col ${
          listCollapsed ? '' : 'border-l border-stroke-subtle pl-6 xl:pl-8'
        }`}
      >
        {HISTORY_ENABLED ? (
          // Lined up with the conversation's own column (ChappiConversation:
          // `mx-auto max-w-[46rem] px-1`), not the section's edge, so the
          // switch's right edge meets the composer's at any width: before,
          // it hung ~30px past the chat at 1440 and far further with the Home
          // column folded (UrgAns full width).
          <div className={`flex shrink-0 justify-end ${CHAT_COLUMN}`}>
            <div role="group" aria-label="Show" className="inline-flex rounded-full bg-bg-elevated p-1">
              <button
                type="button"
                aria-pressed={onHome}
                onClick={() => {
                  useHomeChatStore.getState().setMode('home');
                  setPane('chat');
                  void showHomeChat();
                }}
                className={switchButtonClass(onHome)}
              >
                <MessageCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Chat
              </button>
              <button
                type="button"
                aria-pressed={!onHome}
                onClick={() => setPane('sessions')}
                className={switchButtonClass(!onHome)}
              >
                Sessions
              </button>
            </div>
          </div>
        ) : null}
        <div className="shrink-0">
          <InviteTeamBanner />
        </div>

        {showSessions ? (
          <div className={`flex min-h-0 flex-1 flex-col pt-3 ${CHAT_COLUMN}`}>
            <NewSessionBox
              onStarted={() => {
                useHomeChatStore.getState().setMode('session');
                setPane('chat');
              }}
            />
            <div className="mt-4 min-h-0 flex-1">
              <ChappiHistoryList
                variant="panel"
                onDone={() => {
                  useHomeChatStore.getState().setMode('session');
                  setPane('chat');
                }}
              />
            </div>
          </div>
        ) : null}
        <div className={`min-h-0 flex-1 ${showSessions ? 'hidden' : ''}`}>
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

/**
 * The box at the top of the Sessions list: type the first message of a new
 * session and it starts. The conversation (mounted, only hidden) picks the
 * message up and sends it once the switch is back on Chat.
 */
function NewSessionBox({ onStarted }: { onStarted: () => void }) {
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;
    const store = useChappiStore.getState();
    store.reset();
    store.setInput(text.trim());
    store.setSendInputOnOpen(true);
    setText('');
    onStarted();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex shrink-0 items-center gap-1 rounded-full border border-stroke-control bg-bg-surface p-1.5 transition-colors focus-within:border-brand/70"
    >
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Start a new session..."
        aria-label="Start a new session"
        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Start session"
        disabled={!canSend}
        className={SEND_BUTTON_CLASS}
      >
        <ArrowUp className={SEND_ARROW_CLASS} aria-hidden="true" />
      </button>
    </form>
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
