'use client';

import { SkeletonBlock } from './SkeletonBlock';
import { useKnownResumableChat } from './known-counts';
import { isChappiHistoryEnabled } from '@/lib/chappi/conversation-history';
import { CHATS_MENU_ON } from '@/lib/chats-menu';

// Mirrors ChappiPageClient's own flag reads — keep them in sync (CLAUDE.md's
// loading-skeleton rule).
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';
const HISTORY_ENABLED = isChappiHistoryEnabled();

/**
 * Chappi page loading state, rendered inline by `ChappiPageClient` while
 * auth/the command-center fetch are in flight (same inline-swap rationale
 * as `WorkspaceSkeleton` — no route-segment `loading.tsx` file).
 *
 * Two shapes. With chat history off the conversation is transient, so a fresh
 * load always lands on the empty state: a Gemini-style pair of regions — the
 * question centered in a `flex-1` region, the input bar (plus the lg+ chips
 * row) pinned below it as a `shrink-0` sibling. With history ON a reload can
 * land back in a chat used in the last six hours, and when the browser copy
 * says it will, the skeleton reserves a transcript instead
 * (useKnownResumableChat). Both sit inside the SAME definite-height wrapper
 * ChappiPageClient uses, so the resolved page lands where the skeleton stood.
 * This skeleton only represents the `page` variant — the dock/rail `panel`
 * variant has no loading state of its own.
 *
 * This file hand-copies that markup rather than sharing a component with
 * ChappiConversation, so the two only stay aligned if edited together —
 * if the composer moves there, move it here in the same commit.
 *
 * The header row is reserved to match the real page: desktop-only with
 * history off (the collapse button), every width with history on (it also
 * carries the phone's "Chats" toggle). The chats list itself is NOT reserved
 * here: on a desktop it lives in the left menu (lib/chats-menu.ts), which is
 * chrome and has its own placeholder, and elsewhere it is behind that toggle.
 *
 * Deliberately NOT reserved: the invite-teammates banner — it's
 * manager-gated and dismissal-persisted, so the skeleton can't know whether
 * it will render; a banner popping in beats one vanishing. (Same tradeoff
 * WorkspaceIdentityPanel's own inline skeleton makes for its Admin nav row.)
 */
export function ChappiPageSkeleton() {
  const resumableMessages = useKnownResumableChat();
  const shellClass = `${MOBILE_NAV_ENABLED ? 'chappi-shell-height-nav' : 'chappi-shell-height'} flex flex-col`;

  const emptyState = (layoutClass: string) => (
    <div className={`${layoutClass} flex-col px-2`}>
      {/* The single question line, centered in the space the composer
          leaves — mirrors ChappiConversation's own flex-1 region. */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <SkeletonBlock className="h-6 w-64 sm:w-80" />
      </div>

      <div className="mt-3 shrink-0">
        {/* Input bar — same width cap, radius and height as the real form
            (max-w-2xl, rounded-full, p-1.5 around a 36px send button). */}
        <div className="mx-auto h-12 w-full max-w-2xl rounded-full border border-stroke-default bg-bg-surface" />

        {/* Quick-action chips row — lg+ only, matching the real component. */}
        <div className="mt-4 hidden flex-wrap items-center justify-center gap-2 lg:flex">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={`chappi-chip-${index}`} className="h-7 w-24" />
          ))}
        </div>
      </div>
    </div>
  );

  if (!HISTORY_ENABLED) {
    return (
      <div className={shellClass} aria-hidden="true">
        <div className="hidden h-7 shrink-0 justify-end lg:flex">
          <SkeletonBlock className="h-7 w-7" />
        </div>
        {emptyState('flex min-h-0 flex-1')}
      </div>
    );
  }

  // A resumed chat lands as a transcript: alternating turns in the same
  // narrow column, the composer pinned below.
  const transcript = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-4 px-1 pt-10">
          {Array.from({ length: resumableMessages }).map((_, index) =>
            index % 2 === 0 ? (
              <SkeletonBlock
                key={`chappi-turn-${index}`}
                className="ml-auto h-10 w-3/5 rounded-2xl"
              />
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

  return (
    <div className={shellClass} aria-hidden="true">
      <div className="flex h-7 shrink-0 items-center justify-end">
        <SkeletonBlock
          className={`mr-auto h-6 w-16 rounded-full ${CHATS_MENU_ON ? 'lg:hidden' : ''}`}
        />
        <SkeletonBlock className="hidden h-7 w-7 lg:block" />
      </div>
      <div className="min-h-0 flex-1">
        <div className="flex h-full min-h-0">
          <div className="min-h-0 min-w-0 flex-1">
            {resumableMessages > 0 ? transcript : emptyState('flex h-full min-h-0')}
          </div>
        </div>
      </div>
    </div>
  );
}
