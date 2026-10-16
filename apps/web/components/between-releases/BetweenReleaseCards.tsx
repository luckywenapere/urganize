'use client';

import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@urganize/ui';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { StartNextSheet } from './StartNextSheet';
import { useBetweenReleases } from './useBetweenReleases';

/**
 * The two Home cards for the between-releases state (URG-253 + URG-280). They
 * read useBetweenReleases and render nothing when they have nothing to say,
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
  const detail = thin ? 'Tell UrgAns what happened' : `${numbers.done} of ${numbers.total} done · ${numbers.late} late`;
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

/** "Next song": start pre-production, or pick up the one already started. */
export function PreProductionStartCard() {
  const { inPreProduction, between } = useBetweenReleases();
  const [open, setOpen] = useState(false);

  if (inPreProduction) {
    return (
      <HomeCard label="Next song">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-content-primary">{inPreProduction.title}</p>
          <p className="mt-0.5 truncate text-[13px] text-content-tertiary">
            Pre-production · {inPreProduction.done} of {inPreProduction.total} done
          </p>
        </div>
        <Link
          href={`/dashboard?release=${inPreProduction.releaseId}`}
          className="motion-focus motion-press inline-flex h-10 shrink-0 items-center rounded-full border border-stroke-default px-4 text-sm font-semibold text-content-primary hover:border-stroke-strong"
        >
          Open
        </Link>
      </HomeCard>
    );
  }
  if (!between) return null;
  return (
    <HomeCard label="Next song">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-content-primary">Start pre-production</p>
        <p className="mt-0.5 truncate text-[13px] text-content-tertiary">Sessions to final video</p>
      </div>
      <Button
        className="shrink-0"
        onClick={() => {
          captureAnalyticsEvent({ name: 'start_next_opened', properties: { source: 'home' } });
          setOpen(true);
        }}
      >
        Start
      </Button>
      {open ? <StartNextSheet defaultArtistId={null} source="home" onClose={() => setOpen(false)} /> : null}
    </HomeCard>
  );
}
