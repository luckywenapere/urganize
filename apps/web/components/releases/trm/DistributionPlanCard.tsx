'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getTier, INTERVAL_WORD, type BillingInterval } from '@urganize/pricing';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { openExternalUrl } from '@/lib/external-link';
import { formatNaira } from '@/lib/money';
import { isNativePlatform } from '@/lib/platform';
import { READ_ONLY_REACTIVATE_HREF } from '@/lib/team-billing';
import { distributionAuthHeaders } from '../useDistributionStatus';
import { MONO, OUTLINE, PRIMARY, QUIET_LINK } from './TrmParts';
import { TrmShell } from './TrmSendSheet';
import type { DistributionPlan } from './useDistributionPlan';

/**
 * The plan line at the top of the Distribute step (pricing v3, mock c).
 *
 * Manager and Label include distribution; Solo does not. With
 * DISTRIBUTION_REQUIRES_PREPAY on, a monthly team sees "Switch to 6 months",
 * which opens the confirm sheet (mock b): the price, the unused days of this
 * month taken off, and one Pay button. The team is registered on TRM only once
 * that payment has gone through (the webhook does it), never here.
 *
 * The Switch button is an outline, not green: the step keeps at most one
 * green action (Send to TRM), and the green Pay lives in the sheet.
 *
 * It never blocks the step: sending with the artist's own TRM plan stays
 * below it in every state, exactly as before.
 */

const ACQUISITION_PATH = 'distribute';

const formatLongDay = (iso: string | null): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
};

const periodName = (interval: BillingInterval): string => (interval === 'annual' ? 'yearly' : '6 months');

export function DistributionPlanCard({ plan }: { plan: DistributionPlan | null }) {
  const [dismissed, setDismissed] = useState(false);
  const [switchTo, setSwitchTo] = useState<BillingInterval | null>(null);
  const shownRef = useRef(false);

  useEffect(() => {
    if (!plan || plan.state !== 'needs_prepay' || shownRef.current) return;
    shownRef.current = true;
    captureAnalyticsEvent({
      name: 'prepay_upsell_shown',
      properties: { plan: plan.tier, acquisition_path: ACQUISITION_PATH },
    });
  }, [plan]);

  if (!plan || dismissed) return null;

  if (plan.state === 'included') {
    const until = formatLongDay(plan.until);
    return (
      <div className="border border-stroke-default bg-bg-surface px-4 py-3.5">
        <p className="text-[15px] font-semibold text-content-primary">Distribution included</p>
        {until ? <p className={`mt-1 ${MONO}`}>On your plan until {until}.</p> : null}
      </div>
    );
  }

  if (plan.state === 'needs_prepay') {
    const six = plan.offers.find((offer) => offer.interval === 'six_month');
    const year = plan.offers.find((offer) => offer.interval === 'annual');
    const first = six ?? year;
    return (
      <div className="border border-stroke-default bg-bg-surface p-4 sm:p-5">
        <p className="text-[15px] font-semibold text-content-primary">Distribution comes with 6-month and yearly plans</p>
        {plan.canSwitch && first ? (
          <>
            <div className="mt-4">
              <button type="button" className={OUTLINE} onClick={() => setSwitchTo(first.interval)}>
                Switch to {periodName(first.interval)}
              </button>
            </div>
            <p className={`mt-3 ${MONO}`}>
              {formatNaira(first.priceKobo)} every {INTERVAL_WORD[first.interval]}. You save {formatNaira(first.savingNaira * 100)}.
            </p>
            {six && year ? (
              <button type="button" className={`mt-3 ${QUIET_LINK}`} onClick={() => setSwitchTo('annual')}>
                Pay yearly instead · save {formatNaira(year.savingNaira * 100)}
              </button>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm text-content-secondary">
            Ask {plan.ownerName || 'the team owner'} to switch to 6 months.
          </p>
        )}
        {switchTo ? <PrepaySwitchSheet tier={plan.tier} interval={switchTo} onClose={() => setSwitchTo(null)} /> : null}
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
      <p className="text-[15px] font-semibold text-content-primary">Distribution comes with Manager and Label</p>
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

type SwitchQuote = {
  kind: 'prepay_switch';
  tier: string;
  interval: BillingInterval;
  fullPriceMinorUnit: number;
  creditMinorUnit: number;
  amountMinorUnit: number;
  daysRemaining: number;
  renewsAt: string;
};

/** Mock b: what the switch costs today, and one Pay button. The quote comes
 *  from the server (change-plan with preview), so the sheet and the charge
 *  are the same numbers. */
function PrepaySwitchSheet({
  tier,
  interval,
  onClose,
}: {
  tier: string;
  interval: BillingInterval;
  onClose: () => void;
}) {
  const [quote, setQuote] = useState<SwitchQuote | null>(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const headers = await distributionAuthHeaders();
        if (!headers) throw new Error('Sign in again and retry.');
        const response = await fetch('/api/billing/change-plan', {
          method: 'POST',
          headers,
          body: JSON.stringify({ plan: tier, interval, preview: true, acquisitionPath: ACQUISITION_PATH }),
        });
        const body = (await response.json().catch(() => ({}))) as Partial<SwitchQuote> & { error?: string };
        if (!alive) return;
        if (!response.ok || body.kind !== 'prepay_switch') {
          setError(body.error || 'We could not work out the price. Try again.');
          return;
        }
        setQuote(body as SwitchQuote);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Try again.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [tier, interval]);

  const pay = async () => {
    if (!quote) return;
    setPaying(true);
    setError('');
    try {
      const headers = await distributionAuthHeaders();
      if (!headers) throw new Error('Sign in again and retry.');
      const response = await fetch('/api/billing/change-plan', {
        method: 'POST',
        headers,
        body: JSON.stringify({ plan: tier, interval, acquisitionPath: ACQUISITION_PATH }),
      });
      const body = (await response.json().catch(() => ({}))) as { authorizationUrl?: string; error?: string };
      if (!response.ok || !body.authorizationUrl) throw new Error(body.error || 'Could not start the payment.');
      captureAnalyticsEvent({
        name: 'prepay_upsell_accepted',
        properties: {
          plan: tier,
          period: interval,
          price_kobo: quote.amountMinorUnit,
          acquisition_path: ACQUISITION_PATH,
        },
      });
      if (isNativePlatform()) {
        await openExternalUrl(body.authorizationUrl);
        setPaying(false);
      } else {
        window.location.href = body.authorizationUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
      setPaying(false);
    }
  };

  const tierLabel = getTier(tier as Parameters<typeof getTier>[0])?.label ?? tier;
  const periodLabel = interval === 'annual' ? 'yearly' : '6 months';

  return (
    <TrmShell label={`Switch to ${periodLabel}`} onClose={onClose} locked={paying}>
      <h3 className="pr-8 font-display text-[26px] leading-tight tracking-[-0.02em] text-content-primary">
        {tierLabel}, {periodLabel}
      </h3>
      {quote ? (
        <>
          <dl className="mt-5 border border-stroke-default bg-bg-surface text-[15px]">
            <div className="flex items-center justify-between gap-3 border-b border-stroke-default px-4 py-3">
              <dt className="text-content-secondary">
                {tierLabel}, {periodLabel}
              </dt>
              <dd className="text-content-primary">{formatNaira(quote.fullPriceMinorUnit)}</dd>
            </div>
            {quote.creditMinorUnit > 0 ? (
              <div className="flex items-center justify-between gap-3 border-b border-stroke-default px-4 py-3">
                <dt className="text-content-secondary">
                  Days left on this month ({quote.daysRemaining} of 30)
                </dt>
                <dd className="text-content-primary">−{formatNaira(quote.creditMinorUnit)}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="font-semibold text-content-primary">You pay today</dt>
              <dd className="font-semibold text-content-primary">{formatNaira(quote.amountMinorUnit)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-content-secondary">
            Your {periodLabel === 'yearly' ? 'year' : '6 months'} start{periodLabel === 'yearly' ? 's' : ''} today and renew{periodLabel === 'yearly' ? 's' : ''} on{' '}
            {formatLongDay(quote.renewsAt)} at {formatNaira(quote.fullPriceMinorUnit)}. Distribution unlocks once the payment goes
            through.
          </p>
        </>
      ) : !error ? (
        <div className="mt-5 h-36 animate-pulse border border-stroke-default bg-bg-surface" aria-busy="true" />
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-status-error">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <button type="button" className={PRIMARY} disabled={!quote || paying} onClick={() => void pay()}>
          {quote ? `Pay ${formatNaira(quote.amountMinorUnit)}` : 'Pay'}
        </button>
        <button type="button" className={OUTLINE} disabled={paying} onClick={onClose}>
          Not now
        </button>
      </div>
    </TrmShell>
  );
}
