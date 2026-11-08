'use client';

import Link from 'next/link';
import { formatNaira } from '@/lib/money';
import type { DistributionLimitView } from '@/lib/distribution-limits';
import { MONO, OUTLINE, PRIMARY, QUIET_LINK } from './TrmParts';

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
  // Paying yearly is TRM's yearly plan: no monthly cap, so no bar to fill.
  if (limit.releasesLimit === null) {
    return (
      <div className="mt-1">
        <p className="text-sm text-content-secondary">
          {limit.used} sent this month. Your yearly plan has no monthly cap.
        </p>
        <p className={`mt-2.5 ${MONO}`}>{artistsLine(limit)}</p>
      </div>
    );
  }
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

const ADDON_HREF = '/dashboard?settings=billing';

/** In place of Send to TRM when this release is past the plan, or (Solo and
 *  Manager, #1112) when a single is paid for one at a time or an EP needs the
 *  Distribution add-on. `onOwnPlan` offers the artist's own TRM account. */
export function DistributionLimitBlock({
  limit,
  paying,
  error,
  onPay,
  onOwnPlan,
}: {
  limit: DistributionLimitView;
  paying: boolean;
  error: string;
  onPay: () => void;
  onOwnPlan?: () => void;
}) {
  const price = formatNaira(limit.extraPriceKobo);
  const artist = limit.artistName || 'this artist';
  const ownPlanLink = onOwnPlan ? (
    <button type="button" className={QUIET_LINK} onClick={onOwnPlan}>
      Use my own TRM plan
    </button>
  ) : null;
  const errorLine = error ? (
    <p role="alert" className="mt-3 text-sm text-status-error">
      {error}
    </p>
  ) : null;

  if (limit.verdict === 'single') {
    return (
      <div className="space-y-3">
        <div className="border border-brand bg-bg-surface p-4 sm:p-5">
          <p className="text-[15px] font-semibold text-content-primary">Send this single for {price}</p>
          <p className="mt-1 text-sm text-content-secondary">
            We send it to Spotify, Apple Music, Audiomack, Boomplay and the rest through TRM.
          </p>
          <div className="mt-4">
            <button type="button" disabled={paying} onClick={onPay} className={PRIMARY}>
              {paying ? 'Opening payment…' : `Pay ${price} and send`}
            </button>
          </div>
          <p className={`mt-3 ${MONO}`}>Paid once. Fixing and resending it later is free.</p>
          {errorLine}
        </div>
        <div className="border border-stroke-default bg-bg-surface p-4 sm:p-5">
          <p className="text-[15px] font-semibold text-content-primary">Send a lot of music?</p>
          <p className="mt-1 text-sm text-content-secondary">
            Add distribution for {artist}: ₦7,100 a month covers 7 releases a month, singles and EPs.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Link href={ADDON_HREF} className={QUIET_LINK}>
              See the add-on
            </Link>
            {ownPlanLink}
          </div>
        </div>
      </div>
    );
  }

  if (limit.verdict === 'needs_addon') {
    return (
      <div className="border border-stroke-default bg-bg-surface p-4 sm:p-5">
        <p className="text-[15px] font-semibold text-content-primary">This needs distribution for {artist}</p>
        <p className="mt-1 text-sm text-content-secondary">
          {limit.mode === 'addon'
            ? 'Albums need the yearly plan: ₦25,500 a year, no monthly limit.'
            : '₦7,100 a month for 7 releases, or ₦25,500 a year with albums too.'}
        </p>
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <Link href={ADDON_HREF} className={PRIMARY}>
            Add distribution
          </Link>
          {ownPlanLink}
        </div>
        {errorLine}
      </div>
    );
  }

  if (!limit.canPay) {
    return (
      <div className="border border-stroke-default bg-bg-surface p-4 sm:p-5">
        <p className="text-[15px] font-semibold text-content-primary">You’ve used your {limit.releasesLimit} releases this month</p>
        <p className="mt-1 text-sm text-content-secondary">They come back on {resetDay(limit.resetsAt)}.</p>
        {ownPlanLink ? <div className="mt-3">{ownPlanLink}</div> : null}
      </div>
    );
  }

  const artistCase = limit.verdict === 'artist';
  const title = artistCase
    ? `Distribution on your plan covers ${limit.artistsLimit === 1 ? '1 artist' : `${limit.artistsLimit} artists`}`
    : `You’ve used your ${limit.releasesLimit} releases this month`;
  const detail = artistCase
    ? limit.tier === 'pro'
      ? `That’s ${limit.planArtists[0] ?? 'your first artist'}. To send a single for another artist, pay for it or talk to us about Label for 5 artists.`
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
            {limit.tier === 'pro' ? 'Talk to us about Label' : 'Talk to us'}
          </a>
        ) : null}
      </div>
      {!artistCase ? <p className={`mt-3 ${MONO}`}>Or wait until {resetDay(limit.resetsAt)}</p> : null}
      {ownPlanLink ? <div className="mt-3">{ownPlanLink}</div> : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
