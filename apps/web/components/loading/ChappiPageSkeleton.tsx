'use client';

import { SkeletonBlock } from './SkeletonBlock';
import { useKnownResumableChat } from './known-counts';
import { ChappiConversationSkeleton } from './ChappiConversationSkeleton';
import { isChappiHistoryEnabled } from '@/lib/chappi/history-flag';

// Mirrors ChappiPageClient's own flag reads — keep them in sync (CLAUDE.md's
// loading-skeleton rule).
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';
const HISTORY_ENABLED = isChappiHistoryEnabled();

/**
 * The Assistant page's loading state, rendered inline by `ChappiPageClient`
 * while auth and the command-center fetch are in flight.
 *
 * On a phone it mirrors the one-chat layout (#1207): a "What I did" pill over
 * the chat. On a computer (#1218) it mirrors UrgansSessionsLayout: the chats
 * column (Ask about everything, then rollout chats) and the open chat with its
 * thin header. Switched by CSS so the server markup is right at every width.
 *
 * Deliberately NOT reserved: the invite-teammates banner, which is
 * manager-gated and dismissal-persisted, so the skeleton cannot know whether
 * it will render; a banner popping in beats one vanishing.
 */
export function ChappiPageSkeleton() {
  const resumableMessages = useKnownResumableChat();
  const shellClass = `${MOBILE_NAV_ENABLED ? 'chappi-shell-height-nav' : 'chappi-shell-height'} flex flex-col lg:hidden`;
  const messages = HISTORY_ENABLED ? resumableMessages : 0;

  return (
    <>
      <div className={shellClass} aria-hidden="true">
        <div className="flex shrink-0 items-center justify-end">
          <SkeletonBlock className="mr-2 h-9 w-24 rounded-full" />
        </div>
        <div className="min-h-0 flex-1">
          <ChappiConversationSkeleton resumableMessages={messages} />
        </div>
      </div>
      <div
        className="home-split-height mx-auto hidden w-full max-w-[1280px] grid-cols-[288px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-stroke-subtle lg:grid"
        aria-hidden="true"
      >
        <div className="flex min-h-0 flex-col gap-1 border-r border-stroke-subtle bg-bg-surface p-4">
          <SkeletonRow />
          <SkeletonBlock className="mx-2 mb-1.5 mt-3.5 h-3 w-24" />
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonRow key={index} />
          ))}
        </div>
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex min-h-[52px] shrink-0 items-center justify-between gap-3 border-b border-stroke-subtle px-6 py-3">
            <SkeletonBlock className="h-4 w-72" />
            <SkeletonBlock className="h-4 w-28" />
          </div>
          <div className="min-h-0 min-w-0 flex-1 px-6 pb-4 pt-3">
            <ChappiConversationSkeleton resumableMessages={messages} />
          </div>
        </div>
      </div>
    </>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2.5 p-2">
      <SkeletonBlock className="h-8 w-8 shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <SkeletonBlock className="h-3.5 w-32" />
        <SkeletonBlock className="h-3 w-44" />
      </div>
    </div>
  );
}
