'use client';

import { SkeletonBlock } from './SkeletonBlock';

// Mirrors ChappiPageClient's own flag read — keep both in sync (CLAUDE.md's
// loading-skeleton rule). The mobile nav bar's WhatsApp footer row is a flex
// child of the SAME shrink-to-fit column this skeleton already renders as
// aria-hidden filler; it doesn't change this skeleton's own shape.
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';

/**
 * Chappi page loading state, rendered inline by `ChappiPageClient` while
 * auth/the command-center fetch are in flight (same inline-swap rationale
 * as `WorkspaceSkeleton` — no route-segment `loading.tsx` file).
 *
 * Mirrors the CURRENT Chappi home: the PostHog-style vertically centered
 * empty state (eyebrow → greeting → input bar → quick-action chips) inside
 * the SAME definite-height wrapper ChappiPageClient uses, so the resolved
 * page lands exactly where the skeleton stood. The conversation store is
 * ephemeral (a reload always starts empty), so the empty state is
 * effectively the only shape a fresh load resolves to. Re-synced 2026-08-06
 * (URG-232): the real component's subline was removed at some point after
 * this file was last touched (#214) and the skeleton kept reserving a
 * phantom two-line block for it, pushing the input down and causing a jump
 * on resolve — deleted here to match.
 *
 * Reserves the collapse-button row too (desktop only, `hidden lg:flex` —
 * matching the real page's row exactly): unlike the invite banner below,
 * that row is unconditional at lg+, so its absence would leave the
 * centered empty state sitting slightly lower than where the real content
 * settles once ChappiConversation's own centered empty state mounts under
 * it.
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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2">
        {/* Eyebrow row: "UrgAns" + the Beta badge pill. */}
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-2.5 w-14" />
          <SkeletonBlock className="h-4 w-9" />
        </div>
        <SkeletonBlock className="mt-3 h-8 w-64 sm:w-80" />

        {/* Input bar — same width cap as the real form (max-w-2xl). */}
        <div className="mt-6 h-11 w-full max-w-2xl border border-stroke-default bg-bg-surface" />

        {/* Quick-action chips row. */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={`chappi-chip-${index}`} className="h-7 w-24" />
          ))}
        </div>
      </div>
    </div>
  );
}
