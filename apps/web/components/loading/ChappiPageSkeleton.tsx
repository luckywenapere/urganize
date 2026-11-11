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
 * Mirrors the one-chat layout (#1207): on a phone a "What I did" pill over the
 * chat, on a computer a centred column with the page title, the pill and the
 * chat. Switched by CSS so the server markup is right at every width.
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
      <div className="home-split-height mx-auto hidden w-full max-w-3xl flex-col lg:flex" aria-hidden="true">
        <div className="flex shrink-0 items-center justify-between gap-3 pb-2">
          <SkeletonBlock className="h-8 w-32" />
          <SkeletonBlock className="h-10 w-32 rounded-full" />
        </div>
        <div className="min-h-0 min-w-0 flex-1">
          <ChappiConversationSkeleton resumableMessages={messages} />
        </div>
      </div>
    </>
  );
}
