'use client';

import { SkeletonBlock } from './SkeletonBlock';

/**
 * The UrgAns conversation's loading shape, page variant: the empty state (the
 * question centered, the box and the desktop chips below it) or, when the
 * browser copy says a recent session will come back, a transcript with the box
 * pinned below. Used by the chat page's skeleton and by desktop Home's right
 * column, so both land where the real conversation will stand.
 *
 * Hand-copied from ChappiConversation's markup, so the two stay aligned only if
 * edited together: if the box moves there, move it here in the same commit.
 */
export function ChappiConversationSkeleton({ resumableMessages = 0 }: { resumableMessages?: number }) {
  if (resumableMessages > 0) {
    return (
      <div className="flex h-full min-h-0 flex-col" aria-hidden="true">
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-4 px-1 pt-10">
            {Array.from({ length: resumableMessages }).map((_, index) =>
              index % 2 === 0 ? (
                <SkeletonBlock key={`chappi-turn-${index}`} className="ml-auto h-10 w-3/5 rounded-2xl" />
              ) : (
                <div key={`chappi-turn-${index}`} className="space-y-2">
                  <SkeletonBlock className="h-4 w-full" />
                  <SkeletonBlock className="h-4 w-4/5" />
                </div>
              )
            )}
          </div>
        </div>
        <div className="mt-3 shrink-0">
          <div className="mx-auto h-12 w-full max-w-[46rem] rounded-full border border-stroke-default bg-bg-surface" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-2 lg:justify-center" aria-hidden="true">
      {/* The question, centered in the space the box leaves; at lg+ the pair
          centers as one group, as ChappiConversation's empty state does. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 lg:flex-none">
        <SkeletonBlock className="h-24 w-24 rounded-full" />
        <SkeletonBlock className="h-6 w-64 sm:w-80" />
      </div>
      <div className="mt-3 shrink-0 lg:mt-6">
        <div className="mx-auto h-12 w-full max-w-2xl rounded-full border border-stroke-default bg-bg-surface" />
        <div className="mt-4 hidden flex-wrap items-center justify-center gap-2 lg:flex">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={`chappi-chip-${index}`} className="h-7 w-24" />
          ))}
        </div>
      </div>
    </div>
  );
}
