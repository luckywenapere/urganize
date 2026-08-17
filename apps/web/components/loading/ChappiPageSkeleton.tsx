'use client';

import { SkeletonBlock } from './SkeletonBlock';

// Mirrors ChappiPageClient's own flag read — keep both in sync (CLAUDE.md's
// loading-skeleton rule).
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';

/**
 * Chappi page loading state, rendered inline by `ChappiPageClient` while
 * auth/the command-center fetch are in flight (same inline-swap rationale
 * as `WorkspaceSkeleton` — no route-segment `loading.tsx` file).
 *
 * Mirrors the CURRENT Chappi home: a Perplexity-style bottom-anchored empty
 * state (one plain question → input bar → quick-action chips, chips shown
 * lg+ only) inside the SAME definite-height wrapper ChappiPageClient uses,
 * so the resolved page lands exactly where the skeleton stood. The
 * conversation store is ephemeral (a reload always starts empty), so the
 * empty state is effectively the only shape a fresh load resolves to.
 *
 * Reserves the collapse-button row too (desktop only, `hidden lg:flex` —
 * matching the real page's row exactly): unlike the invite banner below,
 * that row is unconditional at lg+, so its absence would leave the
 * empty state sitting slightly lower than where the real content settles
 * once ChappiConversation's own empty state mounts under it.
 *
 * Deliberately NOT reserved: the invite-teammates banner — it's
 * manager-gated and dismissal-persisted, so the skeleton can't know whether
 * it will render; a banner popping in beats one vanishing. (Same tradeoff
 * WorkspaceIdentityPanel's own inline skeleton makes for its Admin nav row.)
 */
export function ChappiPageSkeleton() {
  return (
    <div
      className={`${MOBILE_NAV_ENABLED ? 'chappi-shell-height-nav' : 'chappi-shell-height'} flex flex-col`}
      aria-hidden="true"
    >
      <div className="hidden h-7 shrink-0 justify-end lg:flex">
        <SkeletonBlock className="h-7 w-7" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-end px-2 pb-2 pt-4">
        {/* The single question line. */}
        <SkeletonBlock className="h-6 w-64 sm:w-80" />

        {/* Input bar — same width cap, radius and height as the real form
            (max-w-2xl, rounded-full, p-1.5 around a 36px send button). */}
        <div className="mt-4 h-12 w-full max-w-2xl rounded-full border border-stroke-default bg-bg-surface" />

        {/* Quick-action chips row — lg+ only, matching the real component. */}
        <div className="mt-4 hidden flex-wrap items-center justify-center gap-2 lg:flex">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={`chappi-chip-${index}`} className="h-7 w-24" />
          ))}
        </div>
      </div>
    </div>
  );
}
