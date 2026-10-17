'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { SkeletonBlock } from './SkeletonBlock';
import { useKnownResumableChat } from './known-counts';
import { ChappiConversationSkeleton } from './ChappiConversationSkeleton';
import { isChappiHistoryEnabled } from '@/lib/chappi/history-flag';

const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';
const HISTORY_ENABLED = isChappiHistoryEnabled();

// False on the server and in the hydration render, so the portal below never
// makes the two disagree (the same trick HomeAskBar uses).
const subscribeNever = () => () => undefined;
const useInBrowser = () =>
  useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );

/**
 * The Opportunities card at the top of Home (OpportunitiesCard): the chip on
 * the top edge, then three rows (a title over a one-line meta) and the See all
 * row under a divider. Exported so the card draws this same shape while its own
 * data loads, and Home does not change height when it lands.
 */
export function OpportunitiesBlockSkeleton() {
  return (
    <div aria-hidden="true" className="relative pt-3.5">
      <div className="relative z-10 rounded-2xl border border-stroke-default bg-bg-surface px-4 pb-2 pt-6">
        <div className="divide-y divide-stroke-subtle">
          {['w-3/4', 'w-2/3', 'w-4/5'].map((width) => (
            <div key={width} className="flex min-h-11 items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <SkeletonBlock className={`h-4 rounded-md ${width}`} />
                <SkeletonBlock className="mt-2 h-3 w-1/2 rounded-md" />
              </div>
              <SkeletonBlock className="h-4 w-4 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
        <div className="flex min-h-11 items-center justify-end border-t border-stroke-subtle pt-1">
          <SkeletonBlock className="h-4 w-16 rounded-md" />
        </div>
      </div>
      <SkeletonBlock className="absolute left-3 top-0 z-20 h-7 w-28 rounded-full" />
    </div>
  );
}

/**
 * The left column's reading order since URG-320: the release header (artist
 * line, title, days to go, the three-part phase line), the One Thing card,
 * then the Waiting row. Same heights as the real blocks, so nothing jumps.
 */
function HomeColumnBlocks() {
  return (
    <div className="flex flex-col">
      <SkeletonBlock className="h-3 w-32 rounded-md" />
      <SkeletonBlock className="mt-3 h-8 w-56 rounded-lg" />
      <SkeletonBlock className="mt-2.5 h-4 w-40 rounded-md" />
      <div className="mt-4 flex gap-1.5">
        <SkeletonBlock className="h-1 flex-1 rounded-full" />
        <SkeletonBlock className="h-1 flex-1 rounded-full" />
        <SkeletonBlock className="h-1 flex-1 rounded-full" />
      </div>
      <SkeletonBlock className="mt-8 h-[13rem] w-full rounded-[20px]" />
      <SkeletonBlock className="mt-8 h-14 w-full rounded-[20px]" />
    </div>
  );
}

/**
 * The UrgAns box a phone's Home pins above the bottom bar (HomeAskBar). It is
 * portalled to <body> for the same reason the real one is: the page carries a
 * transform, which would pin a fixed box to the page instead of the screen.
 */
function PinnedAskBoxPlaceholder() {
  const inBrowser = useInBrowser();
  if (!CHAPPI_ENABLED || !inBrowser) return null;
  return createPortal(
    <div aria-hidden="true" className="home-dock pointer-events-none fixed inset-x-3 z-40 lg:hidden">
      <div className="flex h-[3.5rem] items-center gap-1 rounded-full border border-stroke-control bg-bg-surface p-1.5">
        <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
        <div className="flex-1" />
        <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
      </div>
    </div>,
    document.body
  );
}

/**
 * Home's own loading shape, in the order the page reads (2026-10-07): the
 * greeting, then folded stacks. Used by app/dashboard/home/loading.tsx and by
 * HomePageClient while useHomeStore is still loading. Keep in step with
 * HomeBlocks, HomeStack and HomeDesktopSplit.
 *
 * Two shapes, switched by CSS rather than by reading the viewport, so the
 * server's markup is right at every width with nothing to correct after load:
 *  - below lg, one column, with a placeholder for the UrgAns box that is pinned
 *    above the bottom bar (only drawn in the browser, since it is portalled);
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
      <PinnedAskBoxPlaceholder />
      {CHAPPI_ENABLED ? (
        <div className="home-split-height hidden gap-6 lg:flex xl:gap-8">
          {/* Same box as the real column: padding included in the width. */}
          <div className="home-scene-container w-[26rem] shrink-0 overflow-hidden pb-2 pr-1 xl:w-[28rem]">
            <HomeColumnBlocks />
          </div>
          <div className="flex min-w-0 flex-1 flex-col border-l border-stroke-subtle pl-6 xl:pl-8">
            {HISTORY_ENABLED ? (
              <div className="mx-auto flex w-full max-w-[46rem] shrink-0 justify-end px-1">
                {/* The Chat | Sessions switch: two h-8 buttons inside p-1,
                    lined up with the chat column as in HomeDesktopSplit. */}
                <SkeletonBlock className="h-10 w-40 rounded-full" />
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
