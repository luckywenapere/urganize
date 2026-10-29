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
 * The UrgAns page's loading state, rendered inline by `ChappiPageClient` while
 * auth and the command-center fetch are in flight.
 *
 * Two shapes, switched by CSS so the server markup is right at every width: a
 * phone opens on the sessions list (one column, 2026-10-26), a computer shows
 * the sessions on the left and the conversation in the middle, like
 * UrgansSessionsLayout. With history off a fresh load is always the empty
 * state, whose header row is empty.
 *
 * Deliberately NOT reserved: the invite-teammates banner, which is
 * manager-gated and dismissal-persisted, so the skeleton cannot know whether
 * it will render; a banner popping in beats one vanishing.
 */
export function ChappiPageSkeleton() {
  const resumableMessages = useKnownResumableChat();
  const shellClass = `${MOBILE_NAV_ENABLED ? 'chappi-shell-height-nav' : 'chappi-shell-height'} flex flex-col lg:hidden`;

  return (
    <>
      <div className={shellClass} aria-hidden="true">
        {HISTORY_ENABLED ? (
          <>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <SkeletonBlock className="h-9 w-24 rounded-full" />
              <SkeletonBlock className="h-9 w-28 rounded-full" />
            </div>
            <SessionRows />
          </>
        ) : (
          <div className="min-h-0 flex-1">
            <ChappiConversationSkeleton resumableMessages={0} />
          </div>
        )}
      </div>
      <div className="home-split-height hidden gap-6 lg:flex xl:gap-8" aria-hidden="true">
        <div className="flex w-72 shrink-0 flex-col xl:w-80">
          <SkeletonBlock className="mb-3 h-10 w-36 rounded-full" />
          <SkeletonBlock className="mb-3 h-10 w-40 rounded-full" />
          <SessionRows />
        </div>
        <div className="min-h-0 min-w-0 flex-1">
          <ChappiConversationSkeleton resumableMessages={HISTORY_ENABLED ? resumableMessages : 0} />
        </div>
      </div>
    </>
  );
}

function SessionRows() {
  return (
    <div className="space-y-4 px-1 py-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={`session-skeleton-${index}`} className="space-y-1.5">
          <SkeletonBlock className="h-4 w-4/5" />
          <SkeletonBlock className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
