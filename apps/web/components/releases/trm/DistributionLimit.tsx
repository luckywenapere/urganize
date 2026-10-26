'use client';

import { formatNaira } from '@/lib/money';
import type { DistributionLimitView } from '@/lib/distribution-limits';
import { MONO, OUTLINE, PRIMARY } from './TrmParts';

// The plan's distribution allowance on the Distribute step (founder, 2026-10-26,
// mocks docs/mocks/distribution-limits): how much is used this month, and, when
// a release is past it, the choice to pay for that one release.

const LABEL_MAILTO = 'mailto:contact@urganize.app?subject=Label%20plan';

function resetDay(iso: string): string {
  // resetsAt is midnight Lagos on the 1st; read it in Lagos so it says "Nov 1".
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(iso));
}

function artistsLine(limit: DistributionLimitView): string {
  if (limit.planArtists.length === 0) {
    return limit.artistsLimit === 1
      ? 'The first artist you send becomes your plan’s artist'
      : `The first ${limit.artistsLimit} artists you send become your plan’s artists`;
  }
  if (limit.artistsLimit === 1) return `Your plan’s artist: ${limit.planArtists[0]}`;
  return `Your plan’s artists: ${limit.planArtists.join(', ')} (${limit.planArtists.length} of ${limit.artistsLimit})`;
}

/** Inside the "Distribution included" card: the month's count and the artists. */
export function DistributionUsage({ limit }: { limit: DistributionLimitView }) {
  const share = Math.min(100, Math.round((limit.used / Math.max(1, limit.releasesLimit)) * 100));
  return (
    <div className="mt-1">
      <p className="text-sm text-content-secondary">
        {limit.used} of {limit.releasesLimit} releases used this month. Resets {resetDay(limit.resetsAt)}.
      </p>
      <div className="mt-3 h-1.5 bg-stroke-default" aria-hidden="true">
        <div className="h-1.5 bg-brand" style={{ width: `${share}%` }} />
      </div>
      <p className={`mt-2.5 ${MONO}`}>{artistsLine(limit)}</p>
    </div>
  );
}

/** In place of Send to TRM when this release is past the plan. */
export function DistributionLimitBlock({
  limit,
  paying,
  error,
  onPay,
}: {
  limit: DistributionLimitView;
  paying: boolean;
  error: string;
  onPay: () => void;
}) {
  const price = formatNaira(limit.extraPriceKobo);
  const artistCase = limit.verdict === 'artist';
  const title = artistCase
    ? `Distribution on your plan covers ${limit.artistsLimit === 1 ? '1 artist' : `${limit.artistsLimit} artists`}`
    : `You’ve used your ${limit.releasesLimit} releases this month`;
  const detail = artistCase
    ? limit.tier === 'manager'
      ? `That’s ${limit.planArtists[0] ?? 'your first artist'}. To send for another artist, pay for this release or move to Label for up to 5 artists.`
      : `That’s ${limit.planArtists.join(', ')}. To send for another artist, pay for this release or talk to us.`
    : `This one is ${price}. Your ${limit.releasesLimit} come back on ${resetDay(limit.resetsAt)}.`;
  return (
    <div className="border border-stroke-default bg-bg-surface p-4 sm:p-5">
      <p className="text-[15px] font-semibold text-content-primary">{title}</p>
      <p className="mt-1 text-sm text-content-secondary">{detail}</p>
      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <button type="button" disabled={paying} onClick={onPay} className={PRIMARY}>
          {paying ? 'Opening payment…' : `Pay ${price} and send`}
        </button>
        {artistCase ? (
          <a href={LABEL_MAILTO} className={OUTLINE}>
            {limit.tier === 'manager' ? 'Talk to us about Label' : 'Talk to us'}
          </a>
        ) : null}
      </div>
      {!artistCase ? <p className={`mt-3 ${MONO}`}>Or wait until {resetDay(limit.resetsAt)}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
