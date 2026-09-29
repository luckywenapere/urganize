import Link from 'next/link';
import type { HomeReleaseSummary } from '@/lib/home/types';
import { HomeSectionShell } from './HomeSectionShell';
import { EmptyState } from '@/components/shared/EmptyState';

// FLAGGED CONFLICT, recorded per the approved mapping report (section 5):
// this section deliberately says "Releases", not "Rollouts". The house rule
// since v1.37.0 is that the in-app object is a "rollout" — enforced by
// lib/rollout-vocabulary.test.ts, which this file and the rest of
// components/home/ are deliberately NOT added to. The report's own
// recommendation was to keep the screens' wording rather than silently
// rename it, since the reference screens (no longer accessible — see the
// build summary) may have used "Releases" on purpose and renaming without
// checking could be its own kind of drift. Revisit during review: either
// confirm "Releases" is right and add an explicit exemption comment to the
// guard, or rename this (and the sibling "Your release" wording elsewhere in
// components/home/) to "Rollouts" and add these files to GUARDED_FILES.

function daysOutLabel(daysOut: number | null): string {
  if (daysOut === null) return 'No date set';
  if (daysOut === 0) return 'Out today';
  if (daysOut > 0) return `${daysOut} ${daysOut === 1 ? 'day' : 'days'} out`;
  const daysAgo = Math.abs(daysOut);
  return `Out ${daysAgo === 1 ? '1 day' : `${daysAgo} days`} ago`;
}

function ReleaseCard({ release }: { release: HomeReleaseSummary }) {
  const progressPct = release.progress.total > 0 ? Math.round((release.progress.done / release.progress.total) * 100) : 0;

  return (
    <Link
      href={`/dashboard?release=${release.id}`}
      className={`motion-focus motion-lift block rounded-lg border p-4 transition-colors ${
        release.isSoon
          ? 'border-brand/40 bg-brand/5 hover:border-brand'
          : 'border-stroke-default bg-bg-elevated hover:border-stroke-strong'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">
            {release.artistName || 'Unassigned artist'}
          </p>
          <h3 className="mt-1 truncate font-display text-lg font-semibold text-content-primary">{release.title}</h3>
        </div>
        <span className={`shrink-0 text-xs font-medium ${release.isSoon ? 'text-brand' : 'text-content-tertiary'}`}>
          {daysOutLabel(release.daysOut)}
        </span>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          {release.week ? (
            <span className="font-medium text-content-tertiary">
              Week {release.week.current} of {release.week.total}
            </span>
          ) : (
            <span className="font-medium text-content-tertiary">Motion</span>
          )}
          <span className="font-mono font-semibold text-content-primary">
            {release.progress.done} of {release.progress.total} done
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-stroke-strong" aria-hidden="true">
          <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-tertiary">
        {release.slippingCount > 0 ? (
          <span className="font-medium text-status-error">
            {release.slippingCount} {release.slippingCount === 1 ? 'task' : 'tasks'} slipping
          </span>
        ) : (
          <span className="text-status-info">On track</span>
        )}
        {release.yourTotal > 0 ? (
          <span>
            Your part: {release.yourDone} of {release.yourTotal}
          </span>
        ) : null}
        {release.teamSize > 0 ? (
          <span>
            {release.teamSize} {release.teamSize === 1 ? 'person' : 'people'}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function ReleasesSection({ releases }: { releases: readonly HomeReleaseSummary[] }) {
  return (
    <HomeSectionShell title="Releases">
      {releases.length === 0 ? (
        <EmptyState title="Nothing in flight right now." className="py-4" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {releases.map((release) => (
            <ReleaseCard key={release.id} release={release} />
          ))}
        </div>
      )}
    </HomeSectionShell>
  );
}
