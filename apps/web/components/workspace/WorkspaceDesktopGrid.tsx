'use client';

import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { WorkspaceReleaseCard } from './WorkspaceReleaseCard';
import type { ReleaseCardData } from './ReleasesColumn';

type WorkspaceDesktopGridProps = {
  releases: ReleaseCardData[];
  onSelect: (releaseId: string) => void;
  onCreateRelease: () => void;
  /**
   * Replaces the built-in "No releases yet" state when `releases` is empty —
   * see the same prop on ReleasesColumn for why. WorkspaceView passes the same
   * node to both, so the phone and the desktop word a search miss identically.
   */
  emptyState?: ReactNode;
};

/**
 * Desktop-only at-rest workspace surface. With no release selected, the
 * workspace shows ONLY releases — no tasks panel, no files panel. The
 * grid fills the entire main area: 3-up at lg, 4-up at xl. Mobile (< lg)
 * never mounts this; it uses the existing `ReleasesColumn` drill-down
 * pattern in WorkspaceView.
 *
 * The card row reuses `WorkspaceReleaseCard` exactly as the previous
 * layout did — this is purely an arrangement change driven by selection
 * state. Clicking any card writes `?release=<id>` via the parent's
 * `onSelect`, which flips WorkspaceView into the focused 3-column shape.
 */
export function WorkspaceDesktopGrid({
  releases,
  onSelect,
  onCreateRelease,
  emptyState,
}: WorkspaceDesktopGridProps) {
  return (
    // No "Releases" eyebrow (founder call, 2026-07-23): the centered grid
    // IS the page — a left-anchored label over a centered row read as
    // misaligned, and the topbar already orients the user.
    <section className="workspace-mode-enter space-y-4">
      {releases.length === 0 && emptyState ? (
        emptyState
      ) : releases.length === 0 ? (
        <EmptyState
          mascot="resting"
          title="No releases yet"
          description="Create your first release to start planning activities."
          action={
            <button
              type="button"
              onClick={onCreateRelease}
              className="motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 rounded-full border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Create release
            </button>
          }
        />
      ) : (
        // Auto-fit columns, centered as a row (founder call, 2026-07-23):
        // with `repeat(auto-fit, minmax(...))` the browser fits as many
        // columns as the container allows, and `justify-center` centers the
        // row when there are FEWER releases than fit, instead of leaving
        // them left-anchored with dead space to the right.
        //
        // THE TRACK COUNT USES THE MAX BOUND, NOT THE MIN (per the Grid spec:
        // auto-fit repetitions are computed with each track at its max sizing
        // function when that's definite). Every sizing bug in this grid's
        // history has come from forgetting that, so do the arithmetic before
        // changing either number below.
        //
        // THE REAL WIDTH BUDGET (measured on production, 2026-08-05, URG-225).
        // AppShell caps the page at 1440px, and by the time width reaches
        // this grid three things have taken their cut:
        //   1440 − 272 (WorkspaceIdentityPanel: 240 + mr-8)
        //        −  64 (<main>'s lg:px-8)
        //        −  48 (WorkspaceView's wrapper sm:px-6)
        //        = 1056px with the UrgAns rail CLOSED
        //        =  564px with it OPEN (the rail takes a further 492: its
        //           clamp(360px,31vw,460px) plus mr-8)
        //
        // 240px max track (was 260px, URG-225): 4 cards + 3 gap-4 (16px) gaps
        // needs 4*240+48 = 1008px, which fits the 1056px budget with 48px of
        // slack. The previous 260px cap needed 1088px — 32px MORE than the
        // budget — so the grid could only ever reach 3 columns, which is the
        // bug URG-225 fixed (URG-224 shipped a max-w cap sized to that same
        // nonexistent 1088px budget, so it changed nothing). 250px would also
        // fit but leaves only 8px of slack; 240px is the robust choice.
        // Rail-open still resolves to 2 columns (564 budget, URG-216's fix).
        //
        // max-w + mx-auto keep the ceiling STRUCTURAL rather than incidental:
        // 1008px is exactly 4 max-width cards plus their gaps, so no future
        // width change anywhere upstream can produce a 5th column.
        <div className="mx-auto grid max-w-[1008px] justify-center gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,240px))]">
          {releases.map(({ release, tasksDone, tasksTotal, coverArtUrl }) => (
            <WorkspaceReleaseCard
              key={release.id}
              release={release}
              tasksDone={tasksDone}
              tasksTotal={tasksTotal}
              selected={false}
              onSelect={onSelect}
              coverArtUrl={coverArtUrl}
            />
          ))}
        </div>
      )}
    </section>
  );
}
