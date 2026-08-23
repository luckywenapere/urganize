'use client';

import { SkeletonBlock } from './SkeletonBlock';
import { useKnownReleaseCount, useKnownTeammateCount } from './known-counts';
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TABS,
  type SettingsTab,
} from '@/components/settings/useSettingsTab';

// Same one-liners the real sections read at module scope — build-time env
// constants, synchronously knowable, never wrong.
const WORKSPACE_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

// URG-214: the "Workspace identity" section (name + logo) only renders when
// both flags are on, same gate as the identity card itself.
const IDENTITY_PANEL_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_IDENTITY_PANEL === 'true' && WORKSPACE_FEATURE_ENABLED;
const DATA_EXPORT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DATA_EXPORT === 'true';

// The "After tasks" check-in row, same gate the real row reads.
const TASK_OUTCOMES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TASK_OUTCOMES === 'true';

type SettingsPageSkeletonProps = {
  /** Which tab's shape to reserve. SettingsPageClient knows this even while
   * auth is unresolved (it's derived from the URL, not from the user), so the
   * inline skeleton is always right. `app/settings/loading.tsx` cannot read
   * search params from a server component and so falls back to Account — the
   * same class of acceptable guess the role props below make. */
  tab?: SettingsTab;
  /** Best-effort role hints derived from whatever `user` the auth store has
   * on hand right now — usually already correct. Zustand's `persist`
   * middleware rehydrates `user` from localStorage before `checkAuth()`'s
   * network round trip resolves (isLoading boots true and is NOT persisted —
   * see auth-store.ts), so for a returning user these are the real values,
   * not a guess. Both default false for a genuinely first-ever session
   * (nothing persisted yet) — a strictly safer failure mode than assuming
   * manager+flag-on, since it only OMITS a block rather than showing one
   * that then has to disappear. */
  isManagerAccount?: boolean;
  isArtistAccount?: boolean;
};

type Slot = { key: string; height: string; show: boolean };

/** Per-label pill widths, so the placeholder row is the same size as the real
 * one and nothing shifts when the labels arrive. Two values each: the tighter
 * below-`sm` padding first, `px-3` from `sm` up. */
const TAB_PILL_SKELETON_WIDTH: Record<SettingsTab, string> = {
  account: 'w-[66px] sm:w-[70px]',
  workspace: 'w-[79px] sm:w-[83px]',
  team: 'w-[49px] sm:w-[53px]',
  notifications: 'w-[89px] sm:w-[93px]',
};

/**
 * Settings loading state. Rendered inline by `SettingsPageClient` while
 * auth/profile data are in flight, AND by `app/settings/loading.tsx` as the
 * route-segment Suspense fallback — the same component on both sides of the
 * handoff, so a slow navigation never flashes between two loading UIs.
 *
 * Reserves the settings frame (outer chrome + 760px inner column + the title
 * row and tab pills) and then one tab's worth of hairline-divided section
 * slots, gated to that tab's real conditionals. Each slot is a dim kicker line
 * plus one dim block rather than mocked inputs and labels — same convention as
 * the release scene skeletons. Shimmer respects `prefers-reduced-motion` via
 * the global rule in `globals.css`.
 *
 * Reworked for tabs 2026-08-13. Before that it reserved all twelve sections of
 * the flat page in one column — and had drifted: it never gained a slot for the
 * Motivation toggle added 2026-08-10, and its docstring claimed no
 * `app/settings/loading.tsx` existed when that file has been there all along.
 */
export function SettingsPageSkeleton({
  tab = DEFAULT_SETTINGS_TAB,
  isManagerAccount = false,
  isArtistAccount = false,
}: SettingsPageSkeletonProps) {
  // Count-aware slots (founder call, 2026-07-23): the Teammates and Releases
  // sections render THIS user's last-known row counts so the resolved lists
  // land exactly where their placeholders stood.
  const teammateCount = useKnownTeammateCount(2, 6);
  const releaseCount = useKnownReleaseCount(2, 6);

  const slots: Slot[] =
    tab === 'workspace'
      ? [
          // Workspace identity + logo share one two-column row on the real
          // page (2026-08-05) — special-cased in the render below.
          { key: 'workspace-identity-logo', height: 'h-24', show: IDENTITY_PANEL_ENABLED },
          { key: 'workspace-artist', height: 'h-28', show: WORKSPACE_FEATURE_ENABLED },
          // Count-aware release rows, special-cased below.
          { key: 'releases', height: 'h-32', show: true },
        ]
      : tab === 'team'
        ? [{ key: 'teammates', height: 'h-32', show: true }]
        : tab === 'notifications'
          ? [{ key: 'notifications', height: 'h-12', show: true }]
          : [
              // Billing leads the Account tab (2026-08-13). Reserved
              // unconditionally: the section renders for every account — only
              // its copy and CTA vary by plan state — and that state is only
              // knowable from an async fetch, so a skeleton cannot gate on it.
              // h-16 matches the section's own loading block and the resolved
              // flat content (title + one or two lines, no card box).
              { key: 'billing', height: 'h-16', show: true },
              { key: 'profile', height: 'h-40', show: true },
              { key: 'artist-profile', height: 'h-28', show: isArtistAccount },
              // Full width since 2026-08-13 — Appearance used to share a
              // two-column row with the push toggle, which now lives in the
              // Notifications tab.
              { key: 'appearance', height: 'h-24', show: true },
              { key: 'security', height: 'h-40', show: true },
              { key: 'session', height: 'h-20', show: true },
              // Flag-known, so unlike Admin this one CAN be reserved: two
              // lines of copy plus a row of two buttons.
              { key: 'data-export', height: 'h-28', show: DATA_EXPORT_ENABLED },
              { key: 'delete', height: 'h-28', show: true },
            ];

  return (
    <main className="bg-bg-base text-content-primary" aria-hidden="true">
      <div className="relative pb-24 pt-6 sm:px-6">
        <div className="relative mx-auto w-full max-w-[760px]">
          {/* Mirrors the page's header row: the "Settings" h1 (real since
              2026-08-13) and the Back button, on one line. */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <SkeletonBlock className="h-8 w-32" />
            <SkeletonBlock className="h-9 w-24 rounded-full" />
          </div>

          {/* The tab pills. Always four — every tab has at least one section,
              so none of them can resolve to an empty page.
              Widths approximate each real label's rendered pill (~70 / 83 / 53 /
              93px at `px-3`) rather than a uniform `w-24`: four 96px blocks came
              to 408px, so the placeholder row scrolled on a phone where the real
              row does not, and every pill shifted left when the labels arrived.
              Gap classes must track the real row's — see pillClass's note on why
              padding tightens below `sm`. */}
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 sm:gap-2">
            {SETTINGS_TABS.map((name) => (
              <SkeletonBlock
                key={name}
                className={`h-8 shrink-0 rounded-full ${TAB_PILL_SKELETON_WIDTH[name]}`}
              />
            ))}
          </div>

          {/* One tab's sections, divided by hairlines — mirrors the real tab
              bodies: each slot is a dim kicker line + content block, no card
              boxes. */}
          <div className="divide-y divide-stroke-subtle">
            {slots
              .filter((section) => section.show)
              .map((section) =>
                section.key === 'workspace-identity-logo' ? (
                  <div key={section.key} className="grid gap-x-10 py-9 sm:grid-cols-2">
                    <div>
                      <SkeletonBlock className="mb-5 h-3 w-28" />
                      <SkeletonBlock className={`${section.height} w-full`} />
                    </div>
                    <div className="hidden sm:block">
                      <SkeletonBlock className="mb-5 h-3 w-28" />
                      <SkeletonBlock className={`${section.height} w-full`} />
                    </div>
                  </div>
                ) : section.key === 'teammates' ? (
                  <div key={section.key} className="py-9">
                    <SkeletonBlock className="mb-5 h-3 w-28" />
                    {/* Invite controls exist for managers only. */}
                    {isManagerAccount ? <SkeletonBlock className="mb-2 h-10 w-full rounded-lg" /> : null}
                    <div className="space-y-2">
                      {Array.from({ length: teammateCount }).map((_, index) => (
                        <SkeletonBlock
                          key={`teammate-row-${index}`}
                          className="h-12 w-full rounded-lg"
                        />
                      ))}
                    </div>
                  </div>
                ) : section.key === 'releases' ? (
                  <div key={section.key} className="py-9">
                    <SkeletonBlock className="mb-2 h-3 w-28" />
                    <SkeletonBlock className="mb-4 h-3 w-3/4" />
                    <div className="space-y-2">
                      {Array.from({ length: releaseCount }).map((_, index) => (
                        <SkeletonBlock
                          key={`release-row-${index}`}
                          className="h-14 w-full rounded-lg"
                        />
                      ))}
                    </div>
                  </div>
                ) : section.key === 'notifications' ? (
                  <div key={section.key} className="py-9">
                    <SkeletonBlock className="mb-5 h-3 w-28" />
                    <div className="space-y-4">
                      {/* Push is reserved unconditionally: whether this device
                          can do push at all is only knowable from an async
                          probe, so a skeleton cannot gate on it. After tasks
                          follows its build-time flag. Motivation is always
                          there — it has no gate by design. */}
                      <SkeletonBlock className={`${section.height} w-full`} />
                      {TASK_OUTCOMES_ENABLED ? (
                        <SkeletonBlock className={`${section.height} w-full`} />
                      ) : null}
                      <SkeletonBlock className={`${section.height} w-full`} />
                    </div>
                  </div>
                ) : (
                  <div key={section.key} className="py-9">
                    <SkeletonBlock className="mb-5 h-3 w-28" />
                    <SkeletonBlock className={`${section.height} w-full`} />
                  </div>
                )
              )}
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * Used inline by `TeammatesSection` while the teammates list is fetching —
 * this one stays because it's a sub-region loader, not a duplicate of the
 * route-segment fallback.
 */
export function SettingsTeamMembersSectionSkeleton() {
  // Count-aware: renders the last-known number of teammate rows so the
  // resolved list lands where the placeholders stood.
  const teammateCount = useKnownTeammateCount(2, 6);
  return (
    <div className="mt-4 space-y-2">
      {Array.from({ length: teammateCount }).map((_, index) => (
        <div
          key={`team-member-skeleton-${index}`}
          className="h-12 rounded-lg border border-stroke-subtle bg-bg-elevated"
        />
      ))}
    </div>
  );
}
