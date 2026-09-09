'use client';

import type { ReactNode } from 'react';
import { Plus } from '@/components/icons';
import type { Release } from '@/types/releases';
import { EmptyState } from '@/components/shared/EmptyState';
import { WorkspaceReleaseCard } from './WorkspaceReleaseCard';

// MobileNavBar's center "+" (NEXT_PUBLIC_FEATURE_MOBILE_NAV) already opens
// the same create-release flow, so the full-width button this component
// used to render below `sm` was retired to avoid a double CTA — see the
// identical reasoning on AppTopbar's own "New rollout" button.
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';

export type ReleaseCardData = {
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'status' | 'releaseDate'>;
  tasksDone: number;
  tasksTotal: number;
  /** Signed Phase 3 cover-art URL; null/undefined surfaces the neutral
   * placeholder in WorkspaceReleaseCard. */
  coverArtUrl?: string | null;
  /** True when the release carries the `test_release` metadata marker and
   * NEXT_PUBLIC_FEATURE_TEST_RELEASE is on (WorkspaceView folds the flag in
   * when it builds the cards) — renders the small "Test" tag on the card. */
  isTest?: boolean;
};

/**
 * The one-tap test path (NEXT_PUBLIC_FEATURE_TEST_RELEASE). Passed only when
 * the flag is on — the gate lives in WorkspaceView; this component and
 * WorkspaceDesktopGrid stay dumb. `start` creates the canned test release and
 * navigates into it; `error` renders inline under the buttons, because the
 * empty state IS the failure surface for this entry point.
 */
export type TestReleaseEntry = {
  start: () => void;
  isStarting: boolean;
  error: string;
};

type ReleasesColumnProps = {
  releases: ReleaseCardData[];
  scopedReleaseId: string | null;
  onSelect: (releaseId: string) => void;
  /** Opens the create-release modal. Surfaces as a full-width button below
   * sm where the AppTopbar's "New rollout" button is hidden. */
  onCreateRelease: () => void;
  /**
   * Replaces the built-in "No releases yet" state when `releases` is empty.
   *
   * Exists because the catalog's search bar filters this list, and an empty
   * FILTERED list is not an empty catalog — telling someone with nine releases
   * to "create your first release" because they mistyped a search would be a
   * lie. WorkspaceView builds the no-match node once and hands the same one to
   * this component and to WorkspaceDesktopGrid, so the two cannot word it
   * differently.
   */
  emptyState?: ReactNode;
  /** See TestReleaseEntry. Adds a "Try a test release" button to the built-in
   * "No releases yet" state; absent (flag off), that state is untouched. */
  testRelease?: TestReleaseEntry;
};

export function ReleasesColumn({
  releases,
  scopedReleaseId,
  onSelect,
  onCreateRelease,
  emptyState,
  testRelease,
}: ReleasesColumnProps) {
  const createButton = (
    <button
      type="button"
      onClick={onCreateRelease}
      // Disabled while the test release is being set up so the two entry
      // points cannot race a second create; never true when the prop is
      // absent, so the flag-off button is behaviorally unchanged.
      disabled={testRelease?.isStarting}
      className="motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 rounded-full border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Plus className="h-4 w-4" />
      Create release
    </button>
  );

  return (
    <section className="space-y-3">
      {/* Mobile-only full-width "New rollout". AppTopbar's New rollout button
          is `hidden sm:inline-flex`; this fills the gap below 640px. Hidden
          when MobileNavBar is on — its center "+" already covers this. */}
      {!MOBILE_NAV_ENABLED ? (
        <button
          type="button"
          onClick={onCreateRelease}
          className="motion-focus motion-press flex h-11 w-full items-center justify-center gap-2 rounded-full border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover sm:hidden"
        >
          <Plus className="h-4 w-4" />
          New rollout
        </button>
      ) : null}

      {releases.length === 0 && emptyState ? (
        emptyState
      ) : releases.length === 0 ? (
        <EmptyState
          mascot="resting"
          title="No releases yet"
          description="Create your first release to start planning activities."
          action={
            testRelease ? (
              <div className="flex flex-col items-center gap-2.5">
                {createButton}
                <button
                  type="button"
                  onClick={testRelease.start}
                  disabled={testRelease.isStarting}
                  className="motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 rounded-full border border-stroke-default bg-bg-surface px-4 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {testRelease.isStarting ? 'Setting up your test release…' : 'Try a test release'}
                </button>
                {testRelease.error ? (
                  <p className="text-xs text-status-error">{testRelease.error}</p>
                ) : null}
              </div>
            ) : (
              createButton
            )
          }
        />
      ) : (
        // Full-width horizontal ROWS — square art thumbnail beside the meta
        // (the `focused` card variant), one per line at every width this
        // component renders at (it only ever mounts inside WorkspaceView's
        // `lg:hidden` branch).
        //
        // Supersedes the golden-section treatment (founder call, 2026-08-07).
        // History, so this isn't re-litigated: cards originally ran edge to
        // edge as tiles, and the square cover art ballooned into a
        // full-screen banner (founder call, 2026-07-23); the fix capped each
        // tile at 100vw/φ ≈ 61.8vw and centered it. That killed the balloon
        // but left ~38% of a 390px screen empty with only ~1.9 releases
        // visible per screen — filling neither axis.
        //
        // Rows fix both at once: the art is bounded by the row's fixed
        // thumbnail width (w-28/sm:w-36) rather than the viewport, so it
        // physically cannot balloon, while the meta column absorbs the full
        // width. ~4-5 releases per screen. It's also the same card the
        // desktop focused view uses, so phone and desktop speak one language.
        <div className="space-y-3">
          {releases.map(({ release, tasksDone, tasksTotal, coverArtUrl, isTest }) => (
            <WorkspaceReleaseCard
              key={release.id}
              release={release}
              tasksDone={tasksDone}
              tasksTotal={tasksTotal}
              selected={scopedReleaseId === release.id}
              onSelect={onSelect}
              coverArtUrl={coverArtUrl}
              isTest={isTest}
              variant="focused"
            />
          ))}
        </div>
      )}
    </section>
  );
}
