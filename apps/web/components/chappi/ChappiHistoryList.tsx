'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from '@/components/icons';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { formatRelativeTime } from '@/lib/relative-time';
import { displayChatTitle, type ChatSummary } from '@/lib/chappi/conversation-history';
import { withoutHomeChat } from '@/lib/chappi/home-chat';
import { useChappiHistoryStore } from '@/stores/useChappiHistoryStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { ChappiDeleteChatDialog } from './ChappiDeleteChatDialog';

type ChappiHistoryListProps = {
  /**
   * - 'menu': inside the left menu, in the space under the nav rows (the
   *   Cursor layout), where a chat is one compact line and nothing needs
   *   handing back.
   * - 'panel': shown IN PLACE of the conversation — the page wherever the
   *   menu cannot carry the list, and the side rail — so `onDone` hands the
   *   space back once a chat is chosen.
   */
  variant: 'menu' | 'panel';
  /** Called after a chat opens or a new one starts. */
  onDone?: () => void;
};

/**
 * The saved UrgAns chats, newest first: open one, start a new one, delete
 * one. Titles come from the first thing the user said (the Apple Notes
 * model, like Notes itself), so there is nothing to name.
 *
 * Reads useChappiHistoryStore and never fetches for itself beyond asking the
 * store to refresh — the store's 15-second freshness window is what keeps
 * mounting this on every toggle free.
 */
export function ChappiHistoryList({ variant, onDone }: ChappiHistoryListProps) {
  const allSummaries = useChappiHistoryStore((state) => state.summaries);
  const homeChatId = useChappiHistoryStore((state) => state.homeChatId);
  // Home's own chat is not a session: it lives on Home and is never listed.
  const summaries = withoutHomeChat(allSummaries, homeChatId);
  const listStatus = useChappiHistoryStore((state) => state.listStatus);
  const nextCursor = useChappiHistoryStore((state) => state.nextCursor);
  const isLoadingMore = useChappiHistoryStore((state) => state.isLoadingMore);
  const openingId = useChappiHistoryStore((state) => state.openingId);
  const loadList = useChappiHistoryStore((state) => state.loadList);
  const loadMore = useChappiHistoryStore((state) => state.loadMore);
  const open = useChappiHistoryStore((state) => state.open);
  const remove = useChappiHistoryStore((state) => state.remove);
  const currentId = useChappiStore((state) => state.conversationId);

  const [pendingDelete, setPendingDelete] = useState<ChatSummary | null>(null);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleOpen = async (id: string) => {
    setOpenError('');
    const opened = await open(id);
    if (opened) onDone?.();
    else setOpenError("Couldn't open that session. Check your connection and try again.");
  };

  const isMenu = variant === 'menu';
  const showSkeleton = allSummaries.length === 0 && (listStatus === 'idle' || listStatus === 'loading');

  return (
    <nav aria-label="Saved sessions" className="flex h-full min-h-0 flex-col">
      <div
        className={`flex shrink-0 items-center justify-between gap-2 ${
          isMenu ? 'px-2.5 pb-1' : 'px-1 pb-2'
        }`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
          Sessions
        </p>
      </div>

      {openError ? (
        <p
          role="alert"
          className={`mb-2 shrink-0 text-xs text-status-error ${isMenu ? 'mx-2.5' : 'mx-3.5'}`}
        >
          {openError}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {showSkeleton ? (
          <div
            className={`py-2 ${isMenu ? 'space-y-2.5 px-2.5' : 'space-y-3 px-3.5'}`}
            aria-hidden="true"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`chat-skeleton-${index}`} className="space-y-1.5">
                <SkeletonBlock className="h-4 w-4/5" />
                {isMenu ? null : <SkeletonBlock className="h-3 w-16" />}
              </div>
            ))}
          </div>
        ) : summaries.length === 0 && listStatus === 'error' ? (
          <div className={`py-3 text-sm text-content-secondary ${isMenu ? 'px-2.5' : 'px-3.5'}`}>
            <p>Couldn&rsquo;t load your sessions.</p>
            <button
              type="button"
              onClick={() => void loadList({ force: true })}
              className="motion-focus mt-2 text-sm font-medium text-brand hover:underline"
            >
              Try again
            </button>
          </div>
        ) : summaries.length === 0 && isMenu ? (
          <p className="px-2.5 py-2 text-xs leading-relaxed text-content-tertiary">
            Your sessions with UrgAns show up here.
          </p>
        ) : summaries.length === 0 ? (
          <div className="px-3.5 py-2">
            <EmptyState
              title="No saved sessions yet"
              description="Your sessions with UrgAns show up here, so you can pick one up again later."
            />
          </div>
        ) : (
          <ul className={isMenu ? 'space-y-0.5 pb-1' : 'pb-2'}>
            {summaries.map((summary) => {
              const title = displayChatTitle(summary.title);
              const isCurrent = summary.id === currentId;
              return (
                <li key={summary.id} className="group relative flex items-center">
                  <button
                    type="button"
                    onClick={() => void handleOpen(summary.id)}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={`motion-focus block min-w-0 flex-1 text-left transition-colors ${
                      isMenu ? 'rounded-lg py-1.5 pl-2.5 pr-8' : 'py-2.5 pl-3.5 pr-10'
                    } ${isCurrent ? 'bg-brand/10' : 'hover:bg-bg-hover'}`}
                  >
                    {isMenu ? (
                      // One line, like the nav rows above it. The age moves
                      // into the tooltip: a column of "8h ago" under every
                      // title is what made the old list read as a second page.
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`truncate text-[13px] ${
                            isCurrent
                              ? 'font-medium text-content-primary'
                              : 'text-content-secondary'
                          }`}
                          title={`${title} · ${formatRelativeTime(summary.lastMessageAt)}`}
                        >
                          {title}
                        </span>
                        {openingId === summary.id ? (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
                        ) : null}
                      </span>
                    ) : (
                      <>
                        <p
                          className="truncate text-sm font-semibold text-content-primary"
                          title={title}
                        >
                          {title}
                        </p>
                        <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-content-tertiary">
                          {formatRelativeTime(summary.lastMessageAt)}
                          {openingId === summary.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : null}
                        </span>
                      </>
                    )}
                  </button>
                  {/* A sibling of the row, never inside it: a button inside a
                      button is invalid and swallows the click. Revealed on
                      hover where there is a mouse; always shown on touch,
                      where there is no hover to reveal it with. */}
                  <button
                    type="button"
                    onClick={() => setPendingDelete(summary)}
                    aria-label={`Delete session: ${title}`}
                    title="Delete session"
                    className={`motion-focus absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-content-tertiary transition-opacity hover:bg-bg-hover hover:text-status-error focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 ${
                      isMenu ? 'right-1 h-6 w-6' : 'right-2 h-7 w-7'
                    }`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {nextCursor ? (
          <div className="px-3.5 pb-3">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={isLoadingMore}
              className="motion-focus inline-flex items-center gap-1.5 text-xs font-medium text-content-secondary hover:text-content-primary disabled:opacity-60"
            >
              {isLoadingMore ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
              Load older sessions
            </button>
          </div>
        ) : null}
      </div>

      <ChappiDeleteChatDialog
        open={pendingDelete !== null}
        chatTitle={displayChatTitle(pendingDelete?.title)}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await remove(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </nav>
  );
}
