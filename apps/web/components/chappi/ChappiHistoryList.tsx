'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from '@/components/icons';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { formatRelativeTime } from '@/lib/relative-time';
import { CHAT_TITLE_FALLBACK, type ChatSummary } from '@/lib/chappi/conversation-history';
import { useChappiHistoryStore } from '@/stores/useChappiHistoryStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { ChappiDeleteChatDialog } from './ChappiDeleteChatDialog';

type ChappiHistoryListProps = {
  /**
   * - 'column': the xl+ column beside the conversation on the UrgAns page.
   * - 'panel': shown IN PLACE of the conversation — the page below xl and
   *   the side rail — so `onDone` hands the space back once a chat is chosen.
   */
  variant: 'column' | 'panel';
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
  const summaries = useChappiHistoryStore((state) => state.summaries);
  const listStatus = useChappiHistoryStore((state) => state.listStatus);
  const nextCursor = useChappiHistoryStore((state) => state.nextCursor);
  const isLoadingMore = useChappiHistoryStore((state) => state.isLoadingMore);
  const openingId = useChappiHistoryStore((state) => state.openingId);
  const loadList = useChappiHistoryStore((state) => state.loadList);
  const loadMore = useChappiHistoryStore((state) => state.loadMore);
  const open = useChappiHistoryStore((state) => state.open);
  const remove = useChappiHistoryStore((state) => state.remove);
  const currentId = useChappiStore((state) => state.conversationId);
  const reset = useChappiStore((state) => state.reset);

  const [pendingDelete, setPendingDelete] = useState<ChatSummary | null>(null);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleOpen = async (id: string) => {
    setOpenError('');
    const opened = await open(id);
    if (opened) onDone?.();
    else setOpenError("Couldn't open that chat. Check your connection and try again.");
  };

  const handleNewChat = () => {
    setOpenError('');
    reset();
    onDone?.();
  };

  const isColumn = variant === 'column';
  const showSkeleton = summaries.length === 0 && (listStatus === 'idle' || listStatus === 'loading');

  return (
    <nav aria-label="Saved chats" className="flex h-full min-h-0 flex-col">
      <div
        className={`flex shrink-0 items-center justify-between gap-2 ${
          isColumn ? 'px-3.5 pb-2 pt-3' : 'px-1 pb-2'
        }`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
          Chats
        </p>
        <button
          type="button"
          onClick={handleNewChat}
          className="motion-focus motion-press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New chat
        </button>
      </div>

      {openError ? (
        <p role="alert" className="mx-3.5 mb-2 shrink-0 text-xs text-status-error">
          {openError}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {showSkeleton ? (
          <div className="space-y-3 px-3.5 py-2" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`chat-skeleton-${index}`} className="space-y-1.5">
                <SkeletonBlock className="h-4 w-4/5" />
                <SkeletonBlock className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : summaries.length === 0 && listStatus === 'error' ? (
          <div className="px-3.5 py-3 text-sm text-content-secondary">
            <p>Couldn&rsquo;t load your chats.</p>
            <button
              type="button"
              onClick={() => void loadList({ force: true })}
              className="motion-focus mt-2 text-sm font-medium text-brand hover:underline"
            >
              Try again
            </button>
          </div>
        ) : summaries.length === 0 ? (
          <div className="px-3.5 py-2">
            <EmptyState
              title="No saved chats yet"
              description="Your chats with UrgAns show up here, so you can pick one up again later."
            />
          </div>
        ) : (
          <ul className="pb-2">
            {summaries.map((summary) => {
              const title = summary.title || CHAT_TITLE_FALLBACK;
              const isCurrent = summary.id === currentId;
              return (
                <li key={summary.id} className="group relative flex items-center">
                  <button
                    type="button"
                    onClick={() => void handleOpen(summary.id)}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={`motion-focus block min-w-0 flex-1 py-2.5 pl-3.5 pr-10 text-left transition-colors ${
                      isCurrent ? 'bg-brand/10' : 'hover:bg-bg-hover'
                    }`}
                  >
                    <p className="truncate text-sm font-semibold text-content-primary" title={title}>
                      {title}
                    </p>
                    <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-content-tertiary">
                      {formatRelativeTime(summary.lastMessageAt)}
                      {openingId === summary.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      ) : null}
                    </span>
                  </button>
                  {/* A sibling of the row, never inside it: a button inside a
                      button is invalid and swallows the click. Revealed on
                      hover where there is a mouse; always shown on touch,
                      where there is no hover to reveal it with. */}
                  <button
                    type="button"
                    onClick={() => setPendingDelete(summary)}
                    aria-label={`Delete chat: ${title}`}
                    title="Delete chat"
                    className="motion-focus absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-content-tertiary transition-opacity hover:bg-bg-hover hover:text-status-error focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
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
              Load older chats
            </button>
          </div>
        ) : null}
      </div>

      <ChappiDeleteChatDialog
        open={pendingDelete !== null}
        chatTitle={pendingDelete?.title || CHAT_TITLE_FALLBACK}
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
