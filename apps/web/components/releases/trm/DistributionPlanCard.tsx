'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { formatNaira } from '@/lib/money';
import { READ_ONLY_REACTIVATE_HREF } from '@/lib/team-billing';
import { MONO, OUTLINE, QUIET_LINK } from './TrmParts';
import type { DistributionLimitView } from '@/lib/distribution-limits';
import { DistributionUsage } from './DistributionLimit';
import type { DistributionPlan } from './useDistributionPlan';

/**
 * The plan line at the top of the Distribute step (pricing v3, mock c).
 *
 * Manager and Label include distribution; Solo does not. With
 * DISTRIBUTION_REQUIRES_PREPAY on (default off), a monthly team is told
 * distribution comes with 6-month and yearly plans. A team paying by transfer
 * goes to /checkout for the 6 months; a card team cannot change period there
 * (self-serve checkout keeps a card plan's period), so it asks us and the
 * founder swaps the Paystack plan by hand. The team is registered on TRM, and
 * we owe TRM, only once it sends a release (recordTrmFeeForSend).
 *
 * Buttons are outlines, not green: the step keeps at most one green action
 * (Send to TRM).
 *
 * It never blocks the step: sending with the artist's own TRM plan stays
 * below it in every state, exactly as before.
 */

const formatLongDay = (iso: string | null): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
};

const SWITCH_MAILTO = 'mailto:contact@urganize.app?subject=Switch%20to%206%20months';

export function DistributionPlanCard({
  plan,
  limit = null,
  ownPlan = false,
}: {
  plan: DistributionPlan | null;
  limit?: DistributionLimitView | null;
  /** The team chose to send with the artist's own TRM account this visit. */
  ownPlan?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (!plan || plan.state !== 'needs_prepay' || shownRef.current) return;
    shownRef.current = true;
    captureAnalyticsEvent({
      name: 'prepay_upsell_shown',
      properties: { plan: plan.tier, period: 'monthly', method: plan.paymentMethod, source: 'distribute' },
    });
  }, [plan]);

  if (!plan || dismissed) return null;

  // Solo and Manager (#1112): the artist's Distribution add-on, or paying per
  // single. The pay block above the fold already says what to do.
  if (limit && limit.mode === 'addon') {
    return (
      <div className="border border-stroke-default bg-bg-surface px-4 py-3.5">
        <p className="text-[15px] font-semibold text-content-primary">Distribution for {limit.artistName || 'this artist'}</p>
        <DistributionUsage limit={limit} />
      </div>
    );
  }
  if (limit && limit.mode === 'per_single') {
    return ownPlan ? (
      <p className="text-sm text-content-secondary">Sending with the artist’s own TRM plan.</p>
    ) : null;
  }

  if (plan.state === 'included') {
    const until = formatLongDay(plan.until);
    return (
      <div className="border border-stroke-default bg-bg-surface px-4 py-3.5">
        <p className="text-[15px] font-semibold text-content-primary">Distribution included</p>
        {limit ? <DistributionUsage limit={limit} /> : null}
        {until && !limit ? <p className={`mt-1 ${MONO}`}>On your plan until {until}.</p> : null}
      </div>
    );
  }

  if (plan.state === 'needs_prepay') {
    const six = plan.offers.find((offer) => offer.interval === 'semiannual');
    const byTransfer = plan.paymentMethod === 'transfer' || plan.paymentMethod === 'direct_transfer';
    const accept = () =>
      captureAnalyticsEvent({
        name: 'prepay_upsell_accepted',
        properties: { plan: plan.tier, period: 'semiannual', method: plan.paymentMethod, source: 'distribute' },
      });
    return (
      <div className="border border-stroke-default bg-bg-surface p-4 sm:p-5">
        <p className="text-[15px] font-semibold text-content-primary">Distribution comes with 6-month and yearly plans</p>
        {plan.canSwitch && six ? (
          <>
            <div className="mt-4">
              {byTransfer ? (
                <Link
                  href={`/checkout?plan=${plan.tier}&period=semiannual&method=transfer`}
                  className={OUTLINE}
                  onClick={accept}
                >
                  Pay for 6 months
                </Link>
              ) : (
                <a href={SWITCH_MAILTO} className={OUTLINE} onClick={accept}>
                  Ask us to switch you
                </a>
              )}
            </div>
            <p className={`mt-3 ${MONO}`}>
              {formatNaira(six.priceKobo)} for 6 months. You save {formatNaira(six.savingNaira * 100)}.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-content-secondary">
            Ask {plan.ownerName || 'the team owner'} to switch to 6 months.
          </p>
        )}
      </div>
    );
  }

  if (plan.reason === 'lapsed') {
    return (
      <div className="border border-stroke-default bg-bg-surface p-4 sm:p-5">
        <p className="text-[15px] font-semibold text-content-primary">Your plan ended, so distribution is off</p>
        <p className="mt-1 text-sm text-content-secondary">Releases already out stay out.</p>
        {plan.canSwitch ? (
          <div className="mt-4">
            <Link href={READ_ONLY_REACTIVATE_HREF} className={OUTLINE}>
              Update payment
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border border-stroke-default bg-bg-surface p-4 sm:p-5">
      <p className="text-[15px] font-semibold text-content-primary">Distribution comes with Pro and Label</p>
      <p className="mt-1 text-sm text-content-secondary">Or send it with your own TRM plan.</p>
      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        {plan.canSwitch ? (
          <Link href="/locked?intent=upgrade" className={OUTLINE}>
            See plans
          </Link>
        ) : null}
        <button type="button" className={QUIET_LINK} onClick={() => setDismissed(true)}>
          Use my own TRM plan
        </button>
      </div>
    </div>
  );
}
