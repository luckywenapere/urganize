'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { History, Maximize2, MessageCircle, RotateCcw, X } from '@/components/icons';
import { useChappiStore } from '@/stores/useChappiStore';
import { URGANS_HREF } from '@/lib/shell-nav';
import { isChappiHistoryEnabled } from '@/lib/chappi/history-flag';
import { ChappiConversation } from './ChappiConversation';
import { ChappiHistoryList } from './ChappiHistoryList';

// Saved sessions: a header button swaps the card's body to the sessions list.
const HISTORY_ENABLED = isChappiHistoryEnabled();

type ChappiSidePanelProps = {
  /** Whether the chat is open. Decided by RightRail (the assistant flag AND the
   *  stored open state) and passed down so the column and this card can never
   *  disagree about it. */
  open: boolean;
  /** Opens the CreateReleaseModal owned by AppShell (the same instance
   * the topbar's "New rollout" button and the dock use). */
  onNewRelease: () => void;
};

/**
 * The UrgAns chat CARD — the lower half of the right-hand column that
 * RightRail (components/app/RightRail.tsx) mounts beside `<main>` on every
 * chrome page at lg+. It was the whole rail until 2026-09-30: it owned the
 * column's sizing, its drag handle and its viewport measurement, which moved to
 * RightRail when the rollout menu joined the column above it. What is left is
 * only the card: header controls and the conversation.
 *
 * The assistant travels with the user wherever they navigate (URG-210; it was
 * previously scoped to the catalog only, driven by a `?chat=1` URL param — a
 * param can't survive navigation, so open state moved to the store). It shares
 * the SAME global `useChappiStore` conversation as the dock and the full
 * `/dashboard/urgans` page — closing this card does NOT lose the conversation
 * (module-scope store, proven by the dock's existing expand-to-page behavior).
 *
 * Open state is `useChappiStore.railOpen`: persisted on write, hydrated once
 * by AppShell, auto-opened once per session after the user lands on the
 * assistant page (AppShell's arming effect). The card is ALWAYS MOUNTED while
 * the assistant is enabled, even when closed: it is made `invisible` and
 * `inert`, never `display: none` and never unmounted, because the transcript's
 * scroll position, its upload and recap cards and any reply still on its way
 * live in it. The column around it does the animating.
 *
 * Header is a deliberate near-duplicate of ChappiDock's (see that file) —
 * the two surfaces are expected to diverge over time (this one is the
 * natural home for a future scope indicator), so copying beats a shared
 * abstraction here. Cross-reference: ChappiDock.tsx.
 *
 * Deliberately NO Escape-to-close, same reason as the dock: the assistant
 * opens modals (task quick-create, create-release) that close on Escape
 * themselves — a card handler would double-fire and close both.
 *
 * No z-index: this is a layout-flow card, not an overlay. No body-scroll
 * lock, no InviteTeamBanner — matches the dock, not the full page.
 */
export function ChappiSidePanel({ open, onNewRelease }: ChappiSidePanelProps) {
  const router = useRouter();
  const setRailOpen = useChappiStore((state) => state.setRailOpen);
  const messages = useChappiStore((state) => state.messages);
  const reset = useChappiStore((state) => state.reset);

  // The chats list is showing in place of the conversation.
  const [showChats, setShowChats] = useState(false);

  return (
    <section
      aria-label="UrgAns assistant"
      aria-hidden={!open}
      inert={!open}
      // `min-h-[22rem]` is what the menu card above is capped against
      // (RightRail's slot leaves the chat this much), so the two numbers must
      // move together. The visibility transition makes the card stay visible
      // while the column slides shut around it, then hide at the end — without
      // it a closing chat would vanish the instant the button was pressed and
      // leave an empty column sliding away.
      className={`relative flex min-h-[22rem] flex-1 flex-col overflow-hidden urg-cartouche rounded-2xl border border-stroke-default bg-bg-surface transition-[visibility] duration-slow ease-standard ${
        open ? 'visible' : 'invisible'
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stroke-subtle px-3 py-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          UrgAns
        </p>
        <div className="flex items-center gap-1">
          {HISTORY_ENABLED ? (
            <button
              type="button"
              onClick={() => setShowChats((current) => !current)}
              aria-label={showChats ? 'Back to the session' : 'Your sessions'}
              title={showChats ? 'Back to the session' : 'Sessions'}
              className={`motion-focus motion-press grid h-7 w-7 place-items-center transition-colors hover:bg-bg-hover hover:text-content-primary ${
                showChats ? 'text-brand' : 'text-content-tertiary'
              }`}
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                reset();
                // A new session is a conversation to type into, not the list.
                setShowChats(false);
              }}
              aria-label="New session"
              title="New session"
              className="motion-focus motion-press grid h-7 w-7 place-items-center text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              // On a computer the full chat is the UrgAns page (2026-10-27:
              // Home no longer carries it). The page and this card share one
              // conversation, so expanding is a pure navigation and the
              // transcript follows. The drawer is closed first, or it would pop
              // open again on the next page.
              setRailOpen(false);
              router.push(URGANS_HREF);
            }}
            aria-label="Open UrgAns full page"
            title="Open full page"
            className="motion-focus motion-press grid h-7 w-7 place-items-center text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setRailOpen(false)}
            aria-label="Close UrgAns"
            title="Close"
            className="motion-focus motion-press grid h-7 w-7 place-items-center text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {showChats ? (
        <div className="min-h-0 flex-1 px-2 pb-3 pt-2">
          <ChappiHistoryList variant="panel" onDone={() => setShowChats(false)} />
        </div>
      ) : null}
      {/* Hidden, never unmounted, while the list shows: its cards and any
          reply still on its way live in it. */}
      <div className={`min-h-0 flex-1 px-3 pb-3 pt-2 ${showChats ? 'hidden' : ''}`}>
        <ChappiConversation variant="panel" onNewRelease={onNewRelease} />
      </div>
    </section>
  );
}
