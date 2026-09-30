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
 * `sections` (2026-09-25) covers a page with more than one data section:
 * Growth shows new accounts, then the waitlist, each with its own heading,
 * tiles, chart and table. Each group can carry its own tile count, which a
 * plain repeat count could not.
 *
 * Not rail-aware on purpose: admin pages never mount inside
 * `showWorkspaceChrome` (see `AppShell.tsx` — `/admin/*` matches neither
 * `isDashboardRoute` nor `isSettingsRoute`), so the UrgAns side rail never
 * renders beside them and there is nothing here that needs to react to it.
 */

type SkeletonGroup = {
  /** Stat card count + the real grid className each page already uses (they
   * vary: sm:grid-cols-2 / sm:grid-cols-3 / sm:grid-cols-4) — pass it
   * through verbatim rather than guessing one shared layout. `hint` reserves
   * the small line some cards carry under the number (Growth's "Aug 2026"). */
  statCards?: { count: number; gridClassName: string; hint?: boolean };
  /** Pill/tally rows (role breakdown, contact-state filters, etc.) — each
   * entry is how many pills that row reserves. */
  tallyRows?: number[];
  /** An AdminBarChart card (Growth page): readout line, y-axis gutter,
   * twelve bars and the tick row. */
  chart?: boolean;
  /** Table columns + rows to reserve; omit for pages with no table. */
  table?: { columns: number; rows?: number };
};

type AdminPageSkeletonProps = SkeletonGroup & {
  /** Tailwind width class for the h1 placeholder, e.g. `'w-40'` for "Waitlist". */
  titleWidth: string;
  /** Number of description lines under the title (most pages: 1; a couple: 2). */
  descriptionLines?: 1 | 2;
  /** The admin hub's own link grid, in place of a table. A number is how many
   *  cards to reserve; the hub passes its real card count so the two cannot
   *  drift (they had: 8 placeholders for 9 cards, 2026-09-30). */
  hubGrid?: boolean | number;
  /** A stacked form (Broadcast page) instead of a table. */
  formFields?: number;
  /** Headed data sections, rendered after everything above. */
  sections?: SkeletonGroup[];
};

function StatCardsSkeleton({ statCards }: { statCards: NonNullable<SkeletonGroup['statCards']> }) {
  return (
    <div className={`mt-6 grid gap-4 ${statCards.gridClassName}`}>
      {Array.from({ length: statCards.count }).map((_, index) => (
        <div key={`stat-${index}`} className="rounded-lg border border-stroke-default bg-bg-surface p-5">
          <SkeletonBlock className="h-2.5 w-20" />
          <SkeletonBlock className="mt-2 h-7 w-12" />
          {statCards.hint ? (
            <div className="mt-1 flex h-4 items-center">
              <SkeletonBlock className="h-3 w-14" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TallyRowsSkeleton({ tallyRows }: { tallyRows: number[] }) {
  return (
    <>
      {tallyRows.map((pillCount, rowIndex) => (
        <div key={`tally-row-${rowIndex}`} className="mt-6">
          <SkeletonBlock className="h-3 w-24" />
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: pillCount }).map((_, pillIndex) => (
              <SkeletonBlock key={`tally-${rowIndex}-${pillIndex}`} className="h-6 w-24 rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// Mirrors components/admin/AdminBarChart.tsx box for box, so the real chart
// lands without moving anything: a 20px readout line, then a 32px y-axis
// gutter beside a 160px plot of centred bars no wider than 24px, then the
// 12px tick row.
function ChartSkeleton() {
  return (
    <div className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-5">
      <div className="flex h-5 items-center">
        <SkeletonBlock className="h-3.5 w-48" />
      </div>
      <div className="mt-3 flex gap-2">
        <div className="h-40 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex h-40 items-end gap-0.5 border-b border-stroke-strong">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={`bar-${index}`} className="flex h-full min-w-0 flex-1 items-end justify-center">
                <div
                  aria-hidden="true"
                  className="skeleton-shimmer w-full max-w-[24px] rounded-t-sm"
                  style={{ height: `${20 + ((index * 37) % 70)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex h-3 gap-0.5">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={`tick-${index}`} className="flex min-w-0 flex-1 justify-center">
                <SkeletonBlock className="h-2 w-4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TableSkeleton({ table }: { table: NonNullable<SkeletonGroup['table']> }) {
  return (
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
  );
}

function GroupSkeleton({ group }: { group: SkeletonGroup }) {
  return (
    <>
      {group.statCards ? <StatCardsSkeleton statCards={group.statCards} /> : null}
      {group.tallyRows ? <TallyRowsSkeleton tallyRows={group.tallyRows} /> : null}
      {group.chart ? <ChartSkeleton /> : null}
      {group.table ? <TableSkeleton table={group.table} /> : null}
    </>
  );
}

export function AdminPageSkeleton({
  titleWidth,
  descriptionLines = 1,
  statCards,
  tallyRows,
  hubGrid = false,
  chart = false,
  formFields,
  table,
  sections,
}: AdminPageSkeletonProps) {
  return (
    <div aria-hidden="true">
      <SkeletonBlock className="h-2.5 w-14" />
      <SkeletonBlock className={`mt-2 h-8 ${titleWidth}`} />
      <div className="mt-2 max-w-2xl space-y-1.5">
        <SkeletonBlock className="h-3.5 w-full" />
        {descriptionLines === 2 ? <SkeletonBlock className="h-3.5 w-2/3" /> : null}
      </div>

      {statCards ? <StatCardsSkeleton statCards={statCards} /> : null}
      {tallyRows ? <TallyRowsSkeleton tallyRows={tallyRows} /> : null}
      {chart ? <ChartSkeleton /> : null}

      {hubGrid ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: typeof hubGrid === 'number' ? hubGrid : 8 }).map((_, index) => (
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

      {table ? <TableSkeleton table={table} /> : null}

      {sections?.map((group, index) => (
        // The first section sits under the page description (mt-8); later
        // ones start a new block (mt-12). Matches GrowthSections.tsx.
        <div key={`section-${index}`} className={index === 0 ? 'mt-8' : 'mt-12'}>
          <div className="flex h-[22px] items-center">
            <SkeletonBlock className="h-4 w-32" />
          </div>
          <div className="mt-1 max-w-2xl space-y-1.5">
            <SkeletonBlock className="h-3.5 w-full" />
            <SkeletonBlock className="h-3.5 w-1/2" />
          </div>
          <GroupSkeleton group={group} />
        </div>
      ))}
    </div>
  );
}
