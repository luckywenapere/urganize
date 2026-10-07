'use client';

import { SkeletonBlock } from './SkeletonBlock';
import { useKnownResumableChat } from './known-counts';
import { ChappiConversationSkeleton } from './ChappiConversationSkeleton';
import { isChappiHistoryEnabled } from '@/lib/chappi/conversation-history';

const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';
const HISTORY_ENABLED = isChappiHistoryEnabled();

/** A folded stack: the chip on its top edge, the top card, the edges behind it. */
function StackBlock({ height }: { height: string }) {
  return (
    <div className="relative pb-3 pt-3.5">
      <div className="absolute inset-x-3 bottom-0 top-6 rounded-2xl border border-stroke-subtle" />
      <SkeletonBlock className={`relative w-full rounded-2xl ${height}`} />
      <SkeletonBlock className="absolute left-3 top-0 h-7 w-24 rounded-full" />
    </div>
  );
}

/** The left column's reading order: the date and greeting, then the stacks. */
function HomeColumnBlocks() {
  return (
    <div className="space-y-5">
      <div>
        <SkeletonBlock className="h-3 w-28" />
        <SkeletonBlock className="mt-2 h-8 w-64 sm:h-9" />
      </div>
      <StackBlock height="h-40" />
      <StackBlock height="h-[4.5rem]" />
      <StackBlock height="h-[4.5rem]" />
    </div>
  );
}

/**
 * Home's own loading shape, in the order the page reads (2026-10-07): the
 * greeting, then folded stacks. Used by app/dashboard/home/loading.tsx and by
 * HomePageClient while useHomeStore is still loading. Keep in step with
 * HomeBlocks and HomeDesktopSplit.
 *
 * Two shapes, switched by CSS rather than by reading the viewport, so the
 * server's markup is right at every width with nothing to correct after load:
 *  - below lg, one column; the UrgAns box is pinned to the screen and is not
 *    part of the page, so it is not reserved here;
 *  - at lg and up (with UrgAns on), Home's column on the left and the
 *    conversation on the right, with the Chat | Sessions switch above it.
 */
export function HomeSkeleton() {
  const resumableMessages = useKnownResumableChat();

  return (
    <div aria-hidden="true">
      <div className={`home-scene-container ${CHAPPI_ENABLED ? 'lg:hidden' : ''}`}>
        <HomeColumnBlocks />
      </div>
      {CHAPPI_ENABLED ? (
        <div className="home-split-height hidden gap-6 lg:flex xl:gap-8">
          <div className="w-[26rem] shrink-0 overflow-hidden xl:w-[28rem]">
            <HomeColumnBlocks />
          </div>
          <div className="flex min-w-0 flex-1 flex-col border-l border-stroke-subtle pl-6 xl:pl-8">
            {HISTORY_ENABLED ? (
              <div className="flex shrink-0 justify-end">
                <SkeletonBlock className="h-8 w-44 rounded-full" />
              </div>
            ) : null}
            <div className="min-h-0 flex-1">
              <ChappiConversationSkeleton resumableMessages={HISTORY_ENABLED ? resumableMessages : 0} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
