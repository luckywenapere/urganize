'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { SkeletonBlock } from './SkeletonBlock';
import { useKnownResumableChat } from './known-counts';
import { ChappiConversationSkeleton } from './ChappiConversationSkeleton';
import { isChappiHistoryEnabled } from '@/lib/chappi/conversation-history';

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
 * A folded stack, drawn the way HomeStack draws one: the chip on the top edge,
 * the top card (p-4 pt-6), and two card edges peeking out behind it (the reserve
 * below is pb-4, the edges sit at the same insets as the real ones).
 */
function StackBlock({ height }: { height: string }) {
  return (
    <div className="relative pt-3.5">
      <div className="relative pb-4">
        <SkeletonBlock className={`relative z-10 w-full rounded-2xl ${height}`} />
        <div
          aria-hidden="true"
          className="absolute inset-x-3 bottom-2 top-4 rounded-2xl border border-stroke-default bg-bg-elevated"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-6 bottom-0 top-6 rounded-2xl border border-stroke-default bg-bg-elevated opacity-60"
        />
      </div>
      <SkeletonBlock className="absolute left-3 top-0 z-20 h-7 w-24 rounded-full" />
    </div>
  );
}

/**
 * The left column's reading order, as ManagerMidReleaseView lays it out: the
 * date and greeting, then the stacks, with the same space-y-5 between them.
 * The top card is the task to do first (a big title), the rest are one line.
 */
function HomeColumnBlocks() {
  return (
    <div className="space-y-5">
      <div>
        {/* 11px caps line, then the greeting (text-2xl, sm:text-3xl) 4px below. */}
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="mt-1 h-8 w-64 sm:h-9" />
      </div>
      <StackBlock height="h-[7.5rem]" />
      <StackBlock height="h-[5.5rem]" />
      <StackBlock height="h-[5.5rem]" />
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
              <div className="flex shrink-0 justify-end">
                {/* The Chat | Sessions switch: two h-8 buttons inside p-1. */}
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
