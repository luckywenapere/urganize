'use client';

import { SkeletonBlock } from './SkeletonBlock';

/**
 * Shared loading shell for every /admin/* page (2026-08-04). Before this,
 * all seven admin client components (`AdminHubClient`, Waitlist, Growth,
 * Interviews, Broadcast, Onboarding, Pricing validation) rendered nothing
 * but a bare centered `Loader2` spinner while `authLoading || !checked` —
 * zero shape reservation, so the whole page popped in at once once its gate
 * fetch resolved. Every one of those pages shares the same skeleton:
 * mono "Admin" eyebrow → h1 title → description line(s) → an optional stat
 * card row → an optional tally/pill row → either a table or the hub's own
 * link-card grid. One flexible component instead of seven near-identical
 * bespoke ones (the EPK/Metadata inline-duplication anti-pattern this audit
 * was checking for elsewhere).
 *
 * Not rail-aware on purpose: admin pages never mount inside
 * `showWorkspaceChrome` (see `AppShell.tsx` — `/admin/*` matches neither
 * `isDashboardRoute` nor `isSettingsRoute`), so the UrgAns side rail never
 * renders beside them and there is nothing here that needs to react to it.
 */

type AdminPageSkeletonProps = {
  /** Tailwind width class for the h1 placeholder, e.g. `'w-40'` for "Waitlist". */
  titleWidth: string;
  /** Number of description lines under the title (most pages: 1; a couple: 2). */
  descriptionLines?: 1 | 2;
  /** Stat card count + the real grid className each page already uses (they
   * vary: sm:grid-cols-2 / sm:grid-cols-3 / sm:grid-cols-4) — pass it
   * through verbatim rather than guessing one shared layout. */
  statCards?: { count: number; gridClassName: string };
  /** Pill/tally rows (role breakdown, contact-state filters, etc.) — each
   * entry is how many pills that row reserves. */
  tallyRows?: number[];
  /** The admin hub's own 6-card link grid, in place of a table. */
  hubGrid?: boolean;
  /** A bar-chart block (Growth page) between the stat cards and the table. */
  chart?: boolean;
  /** A stacked form (Broadcast page) instead of a table. */
  formFields?: number;
  /** Table columns + rows to reserve; omit for pages with no table. */
  table?: { columns: number; rows?: number };
};

export function AdminPageSkeleton({
  titleWidth,
  descriptionLines = 1,
  statCards,
  tallyRows,
  hubGrid = false,
  chart = false,
  formFields,
  table,
}: AdminPageSkeletonProps) {
  return (
    <div aria-hidden="true">
      <SkeletonBlock className="h-2.5 w-14" />
      <SkeletonBlock className={`mt-2 h-8 ${titleWidth}`} />
      <div className="mt-2 max-w-2xl space-y-1.5">
        <SkeletonBlock className="h-3.5 w-full" />
        {descriptionLines === 2 ? <SkeletonBlock className="h-3.5 w-2/3" /> : null}
      </div>

      {statCards ? (
        <div className={`mt-6 grid gap-4 ${statCards.gridClassName}`}>
          {Array.from({ length: statCards.count }).map((_, index) => (
            <div key={`stat-${index}`} className="rounded-lg border border-stroke-default bg-bg-surface p-5">
              <SkeletonBlock className="h-2.5 w-20" />
              <SkeletonBlock className="mt-2 h-7 w-12" />
            </div>
          ))}
        </div>
      ) : null}

      {tallyRows?.map((pillCount, rowIndex) => (
        <div key={`tally-row-${rowIndex}`} className="mt-6">
          <SkeletonBlock className="h-3 w-24" />
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: pillCount }).map((_, pillIndex) => (
              <SkeletonBlock key={`tally-${rowIndex}-${pillIndex}`} className="h-6 w-24 rounded-full" />
            ))}
          </div>
        </div>
      ))}

      {chart ? (
        <div className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-5">
          <div className="flex h-48 items-end gap-1.5 sm:gap-2">
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                key={`bar-${index}`}
                aria-hidden="true"
                className="skeleton-shimmer w-full min-w-0 flex-1 rounded-t"
                style={{ height: `${20 + ((index * 37) % 70)}%` }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {hubGrid ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`hub-card-${index}`}
              className="flex items-start gap-4 rounded-lg border border-stroke-default bg-bg-surface p-5"
            >
              <SkeletonBlock className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-3.5 w-24" />
                <SkeletonBlock className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {formFields ? (
        <div className="mt-8 max-w-[640px] space-y-5">
          {Array.from({ length: formFields }).map((_, index) => (
            <div key={`field-${index}`}>
              <SkeletonBlock className="mb-2 h-3 w-16" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
          ))}
        </div>
      ) : null}

      {table ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-stroke-default">
          <div className="h-10 border-b border-stroke-default bg-bg-elevated" />
          <div className="divide-y divide-stroke-subtle bg-bg-surface">
            {Array.from({ length: table.rows ?? 5 }).map((_, rowIndex) => (
              <div key={`row-${rowIndex}`} className="flex items-center gap-4 px-4 py-3.5">
                {Array.from({ length: table.columns }).map((_, colIndex) => (
                  <SkeletonBlock key={`cell-${rowIndex}-${colIndex}`} className="h-3 w-full max-w-24 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
