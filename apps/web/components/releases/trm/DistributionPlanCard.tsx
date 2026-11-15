'use client';

import { usePurchasePromptsAllowed } from '@/lib/use-purchase-prompts';
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
 * distribution comes with yearly plans (the 6-month plan is not on sale,
 * #1264). A team paying by transfer goes to /checkout for the year; a card team cannot change period there
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
  const purchasePromptsAllowed = usePurchasePromptsAllowed();
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
      <div className="border border-stroke-default bg-bg-surface lg:rounded-2xl lg:px-5 px-4 py-3.5">
        <p className="text-[15px] font-semibold text-content-primary lg:font-display lg:text-lg lg:font-bold lg:tracking-[-0.02em]">Distribution for {limit.artistName || 'this artist'}</p>
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
      <div className="border border-stroke-default bg-bg-surface lg:rounded-2xl lg:px-5 px-4 py-3.5">
        <p className="text-[15px] font-semibold text-content-primary lg:font-display lg:text-lg lg:font-bold lg:tracking-[-0.02em]">Distribution included</p>
        {limit ? <DistributionUsage limit={limit} /> : null}
        {until && !limit ? <p className={`mt-1 ${MONO}`}>On your plan until {until}.</p> : null}
      </div>
    );
  }

  if (plan.state === 'needs_prepay') {
    const year = plan.offers.find((offer) => offer.interval === 'annual');
    const byTransfer = plan.paymentMethod === 'transfer' || plan.paymentMethod === 'direct_transfer';
    const accept = () =>
      captureAnalyticsEvent({
        name: 'prepay_upsell_accepted',
        properties: { plan: plan.tier, period: 'annual', method: plan.paymentMethod, source: 'distribute' },
      });
    return (
      <div className="border border-stroke-default bg-bg-surface lg:rounded-2xl lg:px-5 p-4 sm:p-5">
        <p className="text-[15px] font-semibold text-content-primary lg:font-display lg:text-lg lg:font-bold lg:tracking-[-0.02em]">Distribution comes with yearly plans</p>
        {purchasePromptsAllowed && plan.canSwitch && year ? (
          <>
            <div className="mt-4">
              {byTransfer ? (
                <Link
                  href={`/checkout?plan=${plan.tier}&period=annual&method=transfer`}
                  className={OUTLINE}
                  onClick={accept}
                >
                  Pay for a year
                </Link>
              ) : (
                <a href={SWITCH_MAILTO} className={OUTLINE} onClick={accept}>
                  Ask us to switch you
                </a>
              )}
            </div>
            <p className={`mt-3 ${MONO}`}>
              {formatNaira(year.priceKobo)} for a year. You save {formatNaira(year.savingNaira * 100)}.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-content-secondary">
            Ask {plan.ownerName || 'the team owner'} to switch to yearly.
          </p>
        )}
      </div>
    );
  }

  if (plan.reason === 'lapsed') {
    return (
      <div className="border border-stroke-default bg-bg-surface lg:rounded-2xl lg:px-5 p-4 sm:p-5">
        <p className="text-[15px] font-semibold text-content-primary lg:font-display lg:text-lg lg:font-bold lg:tracking-[-0.02em]">Your plan ended, so distribution is off</p>
        <p className="mt-1 text-sm text-content-secondary">Releases already out stay out.</p>
        {purchasePromptsAllowed && plan.canSwitch ? (
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
    <div className="border border-stroke-default bg-bg-surface lg:rounded-2xl lg:px-5 p-4 sm:p-5">
      <p className="text-[15px] font-semibold text-content-primary lg:font-display lg:text-lg lg:font-bold lg:tracking-[-0.02em]">Distribution comes with Solo Plus, Pro Plus and Label</p>
      <p className="mt-1 text-sm text-content-secondary">Or send it with your own TRM plan.</p>
      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        {purchasePromptsAllowed && plan.canSwitch ? (
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
