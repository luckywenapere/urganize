'use client';

import { SkeletonBlock } from './SkeletonBlock';
import { useKnownResumableChat } from './known-counts';
import { ChappiConversationSkeleton } from './ChappiConversationSkeleton';
import { isChappiHistoryEnabled } from '@/lib/chappi/conversation-history';

// Mirrors ChappiPageClient's own flag reads — keep them in sync (CLAUDE.md's
// loading-skeleton rule).
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';
const HISTORY_ENABLED = isChappiHistoryEnabled();

/**
 * The UrgAns page's loading state, rendered inline by `ChappiPageClient` while
 * auth and the command-center fetch are in flight.
 *
 * A phone's shape only. Since 2026-10-07 a desktop never stays on this page: it
 * opens Home, where the conversation sits beside Home's own column, and
 * ChappiPageClient shows Home's skeleton while it moves there.
 *
 * The header row is reserved only when it will have something in it: with
 * session history on it carries the "Sessions" toggle, plus "New session" when a
 * recent session is coming back. With history off a fresh load is always the
 * empty state, whose header row is empty.
 *
 * Deliberately NOT reserved: the invite-teammates banner, which is
 * manager-gated and dismissal-persisted, so the skeleton cannot know whether
 * it will render; a banner popping in beats one vanishing.
 */
export function ChappiPageSkeleton() {
  const resumableMessages = useKnownResumableChat();
  const shellClass = `${MOBILE_NAV_ENABLED ? 'chappi-shell-height-nav' : 'chappi-shell-height'} flex flex-col`;

  return (
    <div className={shellClass} aria-hidden="true">
      {HISTORY_ENABLED ? (
        <div className="flex shrink-0 items-center justify-end gap-2">
          <SkeletonBlock className="h-7 w-24 rounded-full" />
          {resumableMessages > 0 ? <SkeletonBlock className="h-9 w-28 rounded-full" /> : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ChappiConversationSkeleton resumableMessages={HISTORY_ENABLED ? resumableMessages : 0} />
      </div>
    </div>
  );
}
