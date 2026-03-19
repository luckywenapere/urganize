'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { trackEvent } from '@/lib/analytics';
import {
  INDIVIDUAL_PLAN_OPTIONS,
  MIN_GROUP_TEAM_SIZE,
  MAX_GROUP_TEAM_SIZE,
  buildGroupPaymentMetadata,
  calculateGroupPlanPricing,
  clampTeamSize,
  type GroupBillingCycle,
  type GroupPaymentMode,
  type IndividualPlanId,
} from '@/lib/billing';

const PaystackButton = dynamic(
  () => import('@/components/PaystackButton').then((mod) => mod.PaystackButton),
  { ssr: false }
);

type SubscriptionPaywallProps = {
  title?: string;
  description?: string;
  compact?: boolean;
  showTrialCta?: boolean;
};

type PreparedCheckout = {
  trialDays: number;
  tokenizationAmount: number;
  eligibilityToken: string;
  preparedAt: number;
};

const TRIAL_DEVICE_ID_KEY = 'urganize.trial.device_id';

const getOrCreateTrialDeviceId = (): string => {
  if (typeof window === 'undefined') return '';
  const existing = localStorage.getItem(TRIAL_DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `trial_${Date.now()}_${Math.random().toString(16).slice(2, 12)}`;
  localStorage.setItem(TRIAL_DEVICE_ID_KEY, generated);
  return generated;
};

const hashSha256Hex = async (value: string): Promise<string> => {
  if (!value) return '';
  if (typeof window === 'undefined' || !window.crypto?.subtle) return value;
  const encoded = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export function SubscriptionPaywall({
  title = 'Unlock Urganize with a 30-day trial',
  description = 'Choose a plan, authorize your card, and get full access instantly. You will only be billed when the trial ends.',
  compact = false,
  showTrialCta = true,
}: SubscriptionPaywallProps) {
  const user = useAuthStore((state) => state.user);

  const [billingMode, setBillingMode] = useState<'individual' | 'group'>('individual');
  const [selectedIndividualPlan, setSelectedIndividualPlan] = useState<IndividualPlanId>('monthly');
  const [groupBillingCycle, setGroupBillingCycle] = useState<GroupBillingCycle>('monthly');
  const [groupTeamSize, setGroupTeamSize] = useState(MIN_GROUP_TEAM_SIZE);
  const [groupPaymentMode, setGroupPaymentMode] = useState<GroupPaymentMode>('full');
  const [groupSeatsToPayNow, setGroupSeatsToPayNow] = useState(1);

  const [consentChecked, setConsentChecked] = useState(false);
  const [isPreparingTrial, setIsPreparingTrial] = useState(false);
  const [preparedCheckout, setPreparedCheckout] = useState<PreparedCheckout | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const individualPlanMeta = useMemo(
    () => INDIVIDUAL_PLAN_OPTIONS.find((option) => option.id === selectedIndividualPlan) || INDIVIDUAL_PLAN_OPTIONS[0],
    [selectedIndividualPlan]
  );

  const groupPricing = useMemo(
    () =>
      calculateGroupPlanPricing({
        billingCycle: groupBillingCycle,
        paymentMode: groupPaymentMode,
        teamSize: groupTeamSize,
        seatsPaidNow: groupSeatsToPayNow,
      }),
    [groupBillingCycle, groupPaymentMode, groupSeatsToPayNow, groupTeamSize]
  );

  const selectedPlan = billingMode === 'individual'
    ? selectedIndividualPlan
    : groupBillingCycle === 'yearly'
      ? 'group_yearly'
      : 'group_monthly';

  const postTrialAmount = billingMode === 'individual' ? individualPlanMeta.amount : groupPricing.amountDueNow;

  const checkoutMetadata = useMemo<Record<string, string | number | boolean>>(
    () =>
      billingMode === 'individual'
        ? {}
        : buildGroupPaymentMetadata({
            billingCycle: groupBillingCycle,
            paymentMode: groupPaymentMode,
            teamSize: groupPricing.teamSize,
            seatsPaidNow: groupPricing.seatsPaidNow,
          }),
    [billingMode, groupBillingCycle, groupPaymentMode, groupPricing.seatsPaidNow, groupPricing.teamSize]
  );

  useEffect(() => {
    setPreparedCheckout(null);
    setMessage('');
    setError('');
  }, [selectedPlan, groupTeamSize, groupPaymentMode, groupSeatsToPayNow]);

  const prepareTrialCheckout = async () => {
    if (!showTrialCta) return;
    if (!consentChecked) {
      setError('You must accept trial billing consent before continuing.');
      return;
    }
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

      const rawDeviceId = getOrCreateTrialDeviceId();
      const trialDeviceIdHash = await hashSha256Hex(rawDeviceId);

      const response = await fetch('/api/trial/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan: selectedPlan,
          trial_device_id_hash: trialDeviceIdHash,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Could not prepare trial checkout');
      }

      const trialDays = Number(payload?.trial_days || 30);
      const tokenizationAmount = Number(payload?.tokenization_amount_ngn || 0);
      const eligibilityToken = String(payload?.eligibility_token || '');

      if (!eligibilityToken || !Number.isFinite(tokenizationAmount) || tokenizationAmount <= 0) {
        throw new Error('Invalid trial preparation response. Please retry.');
      }

      setPreparedCheckout({
        trialDays,
        tokenizationAmount,
        eligibilityToken,
        preparedAt: Date.now(),
      });
      trackEvent('trial_started', {
        userId: user?.id || null,
        payload: {
          selectedPlan,
          trialDays,
          tokenizationAmount,
          source: 'subscription-paywall',
        },
      });
      setMessage('Card authorization is ready. Complete checkout to activate your trial.');
    } catch (prepareError: any) {
      setError(prepareError?.message || 'Could not prepare trial checkout');
    } finally {
      setIsPreparingTrial(false);
    }
  };

  const trialCheckoutMetadata = useMemo(() => {
    if (!preparedCheckout) return {};
    return {
      purpose: 'trial_tokenization',
      selected_plan: selectedPlan,
      eligibility_token: preparedCheckout.eligibilityToken,
      ...checkoutMetadata,
    };
  }, [checkoutMetadata, preparedCheckout, selectedPlan]);

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-stroke-default bg-bg-surface p-5 sm:p-7 lg:p-8">
      <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-brand/20 blur-[80px]" />
      <div className="pointer-events-none absolute -left-14 bottom-0 h-48 w-48 rounded-full bg-status-info/15 blur-[72px]" />

      <div className="relative">
        <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">30-Day Free Trial</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-content-primary sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-content-secondary sm:text-base">{description}</p>

        <div className="mt-6 grid grid-cols-1 gap-2 text-sm text-content-secondary sm:grid-cols-3">
          <div className="rounded-xl border border-stroke-subtle bg-bg-elevated px-3 py-2">Card required to start</div>
          <div className="rounded-xl border border-stroke-subtle bg-bg-elevated px-3 py-2">Cancel anytime before renewal</div>
          <div className="rounded-xl border border-stroke-subtle bg-bg-elevated px-3 py-2">Full access during trial</div>
        </div>

        <div className="mt-7 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBillingMode('individual')}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              billingMode === 'individual'
                ? 'border-brand/50 bg-brand-muted text-content-primary'
                : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover'
            }`}
          >
            Individual
          </button>
          <button
            type="button"
            onClick={() => setBillingMode('group')}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              billingMode === 'group'
                ? 'border-brand/50 bg-brand-muted text-content-primary'
                : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover'
            }`}
          >
            Group
          </button>
        </div>

        {billingMode === 'individual' ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {INDIVIDUAL_PLAN_OPTIONS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedIndividualPlan(plan.id)}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  selectedIndividualPlan === plan.id
                    ? 'border-brand/45 bg-brand-muted'
                    : 'border-stroke-subtle bg-bg-elevated hover:border-stroke-default hover:bg-bg-hover'
                }`}
              >
                <p className="text-sm font-semibold text-content-primary">{plan.label}</p>
                <p className="mt-1 text-xs text-content-secondary">{plan.description}</p>
                <p className="mt-3 text-sm text-content-primary">NGN {plan.amount.toLocaleString()}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-4 rounded-xl border border-stroke-subtle bg-bg-elevated p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGroupBillingCycle('monthly')}
                className={`rounded-full border px-3 py-1 text-sm ${
                  groupBillingCycle === 'monthly'
                    ? 'border-brand/50 bg-brand-muted text-content-primary'
                    : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setGroupBillingCycle('yearly')}
                className={`rounded-full border px-3 py-1 text-sm ${
                  groupBillingCycle === 'yearly'
                    ? 'border-brand/50 bg-brand-muted text-content-primary'
                    : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
                }`}
              >
                Yearly
              </button>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-content-tertiary">
                Team Size ({MIN_GROUP_TEAM_SIZE}-{MAX_GROUP_TEAM_SIZE})
              </span>
              <input
                type="number"
                min={MIN_GROUP_TEAM_SIZE}
                max={MAX_GROUP_TEAM_SIZE}
                value={groupTeamSize}
                onChange={(event) => setGroupTeamSize(clampTeamSize(event.target.value))}
                className="w-full rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-content-primary outline-none focus:border-brand"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGroupPaymentMode('full')}
                className={`rounded-full border px-3 py-1 text-sm ${
                  groupPaymentMode === 'full'
                    ? 'border-brand/50 bg-brand-muted text-content-primary'
                    : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
                }`}
              >
                One payer
              </button>
              <button
                type="button"
                onClick={() => setGroupPaymentMode('split')}
                className={`rounded-full border px-3 py-1 text-sm ${
                  groupPaymentMode === 'split'
                    ? 'border-brand/50 bg-brand-muted text-content-primary'
                    : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
                }`}
              >
                Split contribution
              </button>
            </div>

            {groupPaymentMode === 'split' && (
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wide text-content-tertiary">
                  Seats Paid Now
                </span>
                <input
                  type="number"
                  min={1}
                  max={groupPricing.teamSize}
                  value={groupSeatsToPayNow}
                  onChange={(event) => {
                    const parsed = Number(event.target.value || 1);
                    setGroupSeatsToPayNow(Math.max(1, Math.min(groupPricing.teamSize, Math.round(parsed))));
                  }}
                  className="w-full rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-content-primary outline-none focus:border-brand"
                />
              </label>
            )}

            <div className="rounded-lg border border-stroke-default bg-bg-surface p-3 text-sm text-content-secondary">
              <p>Total team amount: <span className="font-semibold text-content-primary">NGN {groupPricing.totalAmount.toLocaleString()}</span></p>
              <p>Per seat: <span className="font-semibold text-content-primary">NGN {groupPricing.perSeatAmount.toLocaleString()}</span></p>
              <p>Post-trial charge: <span className="font-semibold text-content-primary">NGN {groupPricing.amountDueNow.toLocaleString()}</span></p>
            </div>
          </div>
        )}

        <div className="mt-6 rounded-xl border border-brand/30 bg-brand-muted p-4">
          <p className="text-sm font-semibold text-content-primary">Selected Plan: {selectedPlan.replace('_', ' ')}</p>
          <p className="mt-1 text-sm text-content-secondary">
            Trial starts now. If not canceled, you will be billed <span className="font-semibold text-content-primary">NGN {postTrialAmount.toLocaleString()}</span> after 30 days.
          </p>
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-lg border border-stroke-subtle bg-bg-elevated p-3">
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(event) => setConsentChecked(event.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm text-content-secondary">
            I authorize Urganize to securely save my card and charge my selected plan after my 30-day trial unless I cancel before renewal.
          </span>
        </label>

        {showTrialCta && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            {!preparedCheckout ? (
              <button
                type="button"
                onClick={prepareTrialCheckout}
                disabled={isPreparingTrial || !consentChecked}
                className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
              >
                {isPreparingTrial ? 'Preparing secure checkout...' : 'Continue to Card Authorization'}
              </button>
            ) : (
              <PaystackButton
                email={user?.email || ''}
                amount={preparedCheckout.tokenizationAmount}
                plan="trial_tokenization"
                metadata={trialCheckoutMetadata}
                className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
              >
                Authorize Card & Start 30-Day Trial
              </PaystackButton>
            )}
            <Link
              href="/settings"
              className="rounded-xl border border-stroke-default bg-bg-elevated px-5 py-3 text-sm text-content-primary hover:bg-bg-hover"
            >
              Review Billing Settings
            </Link>
          </div>
        )}

        {preparedCheckout && (
          <p className="mt-3 text-sm text-content-secondary">
            Card authorization now: NGN {preparedCheckout.tokenizationAmount.toLocaleString()}.
            Trial length: {preparedCheckout.trialDays} days.
          </p>
        )}

        {message && <p className="mt-3 text-sm text-status-info">{message}</p>}
        {error && <p className="mt-3 text-sm text-status-error">{error}</p>}

        {!compact && (
          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-stroke-subtle bg-bg-elevated p-4">
              <p className="text-sm font-semibold text-content-primary">What you get in trial</p>
              <ul className="mt-2 space-y-1 text-sm text-content-secondary">
                <li>Create releases with the full professional checklist workflow</li>
                <li>Track progress across planning, release week, and post-release</li>
                <li>Individual or group billing model preserved at renewal</li>
              </ul>
            </div>
            <div className="rounded-xl border border-stroke-subtle bg-bg-elevated p-4">
              <p className="text-sm font-semibold text-content-primary">Trust and control</p>
              <ul className="mt-2 space-y-1 text-sm text-content-secondary">
                <li>Secure card processing by Paystack</li>
                <li>Clear renewal amount shown before checkout</li>
                <li>Cancel anytime before trial end</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
