'use client';

import { useId, type ReactNode } from 'react';
import Link from 'next/link';
import { useBetweenReleases } from './useBetweenReleases';

/**
 * The Home card for the between-releases state (URG-253). The "Next song" card
 * that started a pre-production rollout was removed 2026-11-04 (#1074): it was
 * mounted nowhere, and Start the next one makes a project now. It reads
 * useBetweenReleases and render nothing when they have nothing to say,
 * so the Home redesign can place them above OpportunitiesCard (URG-266)
 * without conditions of its own. Same floating-label card as Opportunities.
 */

function HomeCard({ label, dot = false, children }: { label: string; dot?: boolean; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="relative pt-3.5">
      <h2 className="absolute left-3 top-0 z-20">
        <span
          id={headingId}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-base px-2.5 text-[11px] font-semibold text-content-secondary"
        >
          {dot ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" /> : null}
          {label}
        </span>
      </h2>
      <div className="relative z-10 flex items-center justify-between gap-3 rounded-2xl border border-stroke-default bg-bg-surface px-4 pb-4 pt-6">
        {children}
      </div>
    </section>
  );
}

/** "Review ready": the newest finished rollout whose review is open. */
export function ReleaseReviewCard() {
  const { reviewDue } = useBetweenReleases();
  if (!reviewDue) return null;
  const { numbers, thin } = reviewDue;
  const detail = thin ? 'Tell AI what happened' : `${numbers.done} of ${numbers.total} done · ${numbers.late} late`;
  return (
    <HomeCard label="Review ready" dot>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-content-primary">How did {reviewDue.title} go?</p>
        <p className="mt-0.5 truncate text-[13px] text-content-tertiary">{detail}</p>
      </div>
      <Link
        href={`/dashboard?release=${reviewDue.releaseId}`}
        className="motion-focus motion-press inline-flex h-10 shrink-0 items-center rounded-full border border-stroke-default px-4 text-sm font-semibold text-content-primary hover:border-stroke-strong"
      >
        Open
      </Link>
    </HomeCard>
  );
}
