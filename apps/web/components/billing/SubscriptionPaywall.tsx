'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { trackEvent } from '@/lib/analytics';
import {
  ANNUAL_PLAN_MONTHLY_EQUIVALENT,
  ANNUAL_PLAN_PRICE,
  ANNUAL_TRIAL_DAYS,
  DEFAULT_INDIVIDUAL_PLAN_ID,
  MONTHLY_PLAN_PRICE,
  type IndividualPlanId,
} from '@/lib/billing';
import {
  buildAnnualTrialMetadata,
  prepareAnnualTrialCheckout,
  type PreparedTrialCheckout,
  TRIAL_TOKENIZATION_PLAN,
} from '@/lib/trial-checkout';
import { formatCurrencyAmount } from '@/lib/pricing';

const PaystackButton = dynamic(
  () => import('@/components/PaystackButton').then((mod) => mod.PaystackButton),
  { ssr: false }
);

type SubscriptionPaywallProps = {
  title?: string;
  description?: string;
  compact?: boolean;
};

const FEATURE_LIST = [
  'Unlimited releases',
  'Full task management and playbook',
  'Credits and metadata tools',
  'Track uploads and private share links',
  'Pre-save campaigns',
  'Team collaboration',
] as const;

function PlanCard({
  title,
  price,
  subline,
  helper,
  badge,
  selected,
  subordinate = false,
  compact = false,
  onSelect,
}: {
  title: string;
  price: string;
  subline: string;
  helper?: string;
  badge?: string;
  selected: boolean;
  subordinate?: boolean;
  compact?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full rounded-[28px] border px-5 py-5 text-left transition active:scale-[0.99] ${
        compact ? 'sm:rounded-[24px] sm:px-4 sm:py-4' : ''
      } ${
        selected
          ? 'border-brand/45 bg-brand-muted shadow-[0_24px_80px_-56px_rgba(62,207,142,0.9)]'
          : subordinate
            ? 'border-stroke-subtle bg-bg-elevated/65 text-content-secondary'
            : 'border-stroke-default bg-bg-elevated/85'
      }`}
    >
      {badge ? (
        <span className="inline-flex rounded-full border border-brand/20 bg-bg-surface/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
          {badge}
        </span>
      ) : (
        <span className="inline-flex h-7" />
      )}
      <p className={`mt-4 text-sm font-semibold uppercase tracking-[0.14em] ${selected ? 'text-brand' : 'text-content-tertiary'}`}>
        {title}
      </p>
      <p className={`mt-3 text-[clamp(2rem,5vw,3rem)] tracking-tight ${selected ? 'text-content-primary' : 'text-content-primary/92'}`}>
        {price}
      </p>
      <p className="mt-2 text-sm text-content-secondary">{subline}</p>
      {helper ? <p className="mt-3 text-sm font-medium text-content-primary">{helper}</p> : null}
    </button>
  );
}

export function SubscriptionPaywall({
  title = 'Start free. Ship better.',
  description = 'Choose annual to begin with a 3-day free trial, or subscribe monthly right away.',
  compact = false,
}: SubscriptionPaywallProps) {
  const user = useAuthStore((state) => state.user);

  const [selectedPlan, setSelectedPlan] = useState<IndividualPlanId>(DEFAULT_INDIVIDUAL_PLAN_ID);
  const [isPreparingTrial, setIsPreparingTrial] = useState(false);
  const [preparedCheckout, setPreparedCheckout] = useState<PreparedTrialCheckout | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPreparedCheckout(null);
    setMessage('');
    setError('');
  }, [selectedPlan]);

  const prepareTrialCheckout = async () => {
    if (selectedPlan !== 'annual') return;
    if (!user?.email) {
      setError('Please sign in before starting your trial.');
      return;
    }

    setError('');
    setMessage('');
    setIsPreparingTrial(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Session expired. Sign in again and retry.');
      }

      const checkout = await prepareAnnualTrialCheckout(session.access_token);

      setPreparedCheckout(checkout);
      trackEvent('trial_started', {
        userId: user?.id || null,
        payload: {
          selectedPlan: 'annual',
          trialDays: checkout.trialDays,
          tokenizationAmount: checkout.tokenizationAmount,
          source: 'subscription-paywall',
        },
      });
      setMessage('Secure checkout is ready. Complete card authorization to begin your trial.');
    } catch (prepareError: any) {
      setError(prepareError?.message || 'Could not prepare trial checkout');
    } finally {
      setIsPreparingTrial(false);
    }
  };

  const trialCheckoutMetadata = useMemo(() => {
    if (!preparedCheckout) return {};
    return buildAnnualTrialMetadata(preparedCheckout);
  }, [preparedCheckout]);

  const ctaLabel = selectedPlan === 'annual' ? 'Start Free Trial ->' : 'Subscribe Now ->';
  const finePrint =
    selectedPlan === 'annual'
      ? `${ANNUAL_TRIAL_DAYS}-day free trial, then ${formatCurrencyAmount(ANNUAL_PLAN_PRICE, 'NGN')}/year. Cancel anytime.`
      : `${formatCurrencyAmount(MONTHLY_PLAN_PRICE, 'NGN')}/month. Cancel anytime.`;
  const containerClass = compact
    ? ''
    : 'relative overflow-hidden rounded-[30px] border border-stroke-default bg-bg-surface/96 p-5 shadow-[0_24px_80px_-46px_rgba(0,0,0,0.72)] sm:p-7';

  return (
    <section className={containerClass}>
      {!compact ? (
        <>
          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-brand/16 blur-[80px]" />
          <div className="pointer-events-none absolute -left-14 bottom-0 h-48 w-48 rounded-full bg-status-info/12 blur-[72px]" />
        </>
      ) : null}

      <div className={compact ? '' : 'relative'}>
        <div className={compact ? '' : 'text-center'}>
          <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Pricing</p>
          <h2 className="mt-2 text-[clamp(2rem,4.8vw,3.4rem)] tracking-tight text-content-primary">{title}</h2>
          <p className={`mt-3 text-sm text-content-secondary ${compact ? '' : 'mx-auto max-w-2xl sm:text-base'}`}>
            {description}
          </p>
        </div>

        <div className={`mt-6 grid gap-4 ${compact ? '' : 'md:grid-cols-2'}`}>
          <PlanCard
            title="Annual"
            price={`${formatCurrencyAmount(ANNUAL_PLAN_PRICE, 'NGN')}/year`}
            subline={`~${formatCurrencyAmount(ANNUAL_PLAN_MONTHLY_EQUIVALENT, 'NGN')}/month, billed annually`}
            helper={`Starts with a ${ANNUAL_TRIAL_DAYS}-day free trial`}
            badge="Most Popular"
            selected={selectedPlan === 'annual'}
            compact={compact}
            onSelect={() => setSelectedPlan('annual')}
          />
          <PlanCard
            title="Monthly"
            price={`${formatCurrencyAmount(MONTHLY_PLAN_PRICE, 'NGN')}/month`}
            subline="Billed monthly"
            selected={selectedPlan === 'monthly'}
            subordinate
            compact={compact}
            onSelect={() => setSelectedPlan('monthly')}
          />
        </div>

        <div className="mt-6 space-y-3">
          {FEATURE_LIST.map((feature) => (
            <div
              key={feature}
              className={`rounded-[22px] border border-stroke-default bg-bg-elevated/85 px-4 py-4 ${
                compact ? 'sm:rounded-[18px] sm:px-3.5 sm:py-3' : ''
              }`}
            >
              <p className="flex items-start gap-3 text-sm font-medium text-content-primary">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-content-inverse">
                  ✓
                </span>
                <span>{feature}</span>
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {selectedPlan === 'annual' ? (
            preparedCheckout ? (
              <PaystackButton
                email={user?.email || ''}
                amount={preparedCheckout.tokenizationAmount}
                plan={TRIAL_TOKENIZATION_PLAN}
                metadata={trialCheckoutMetadata}
                className="min-h-12 w-full rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:opacity-60"
              >
                {ctaLabel}
              </PaystackButton>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void prepareTrialCheckout();
                }}
                disabled={isPreparingTrial}
                className="min-h-12 w-full rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:opacity-60"
              >
                {isPreparingTrial ? 'Preparing secure checkout...' : ctaLabel}
              </button>
            )
          ) : (
            <PaystackButton
              email={user?.email || ''}
              amount={MONTHLY_PLAN_PRICE}
              plan="monthly"
              className="min-h-12 w-full rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:opacity-60"
            >
              {ctaLabel}
            </PaystackButton>
          )}

          <p className="text-center text-sm text-content-secondary">{finePrint}</p>

          {message ? <p className="text-center text-sm text-status-info">{message}</p> : null}
          {error ? <p className="text-center text-sm text-status-error">{error}</p> : null}

          {!compact ? (
            <div className="pt-1 text-center">
              <Link
                href="/settings#billing"
                className="text-sm font-medium text-content-secondary underline-offset-4 transition hover:text-content-primary hover:underline"
              >
                Review billing settings
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
