'use client';

import Link from 'next/link';
import { HOME_BLOCK_LABELS } from '@/lib/home/sections';
import type { HomeReleaseSummary } from '@/lib/home/types';
import { HomeStack } from './HomeStack';

function daysOutLabel(daysOut: number | null): string {
  if (daysOut === null) return 'No date set';
  if (daysOut === 0) return 'Out today';
  if (daysOut > 0) return `${daysOut} ${daysOut === 1 ? 'day' : 'days'} out`;
  const daysAgo = Math.abs(daysOut);
  return `Out ${daysAgo === 1 ? '1 day' : `${daysAgo} days`} ago`;
}

function RolloutCard({ rollout }: { rollout: HomeReleaseSummary }) {
  const progressPct =
    rollout.progress.total > 0 ? Math.round((rollout.progress.done / rollout.progress.total) * 100) : 0;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">
            {rollout.artistName || 'Unassigned artist'}
          </p>
          <Link
            href={`/dashboard?release=${rollout.id}`}
            className="motion-focus mt-1 block break-words font-display text-lg font-semibold text-content-primary after:absolute after:inset-0 after:rounded-2xl after:content-['']"
          >
            {rollout.title}
          </Link>
        </div>
        <span className={`shrink-0 text-xs font-medium ${rollout.isSoon ? 'text-brand' : 'text-content-tertiary'}`}>
          {daysOutLabel(rollout.daysOut)}
        </span>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-medium text-content-tertiary">
            {rollout.week ? `Week ${rollout.week.current} of ${rollout.week.total}` : 'Motion'}
          </span>
          <span className="font-mono font-semibold text-content-primary">
            {rollout.progress.done} of {rollout.progress.total} done
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-stroke-default" aria-hidden="true">
          <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-tertiary">
        {rollout.slippingCount > 0 ? (
          <span className="font-medium text-status-error">
            {rollout.slippingCount} {rollout.slippingCount === 1 ? 'task' : 'tasks'} slipping
          </span>
        ) : (
          <span className="text-status-info">On track</span>
        )}
        {rollout.yourTotal > 0 ? (
          <span>
            Your part: {rollout.yourDone} of {rollout.yourTotal}
          </span>
        ) : null}
        {rollout.teamSize > 0 ? (
          <span>
            {rollout.teamSize} {rollout.teamSize === 1 ? 'person' : 'people'}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The rollouts in flight, as one stack. A rollout that comes out within two
 * weeks gets the brand tint, so the soonest one stands out even when folded.
 */
export function RolloutsStack({ rollouts }: { rollouts: readonly HomeReleaseSummary[] }) {
  return (
    <HomeStack
      label={HOME_BLOCK_LABELS.rollouts}
      items={rollouts}
      getKey={(rollout) => rollout.id}
      cardTone={(rollout) => (rollout.isSoon ? 'border-brand/40 bg-brand/5' : null)}
      renderItem={(rollout) => <RolloutCard rollout={rollout} />}
    />
  );
}
