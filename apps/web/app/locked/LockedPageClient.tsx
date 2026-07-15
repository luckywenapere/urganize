'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Logo } from '@urganize/ui';
import {
  DEFAULT_PRICING_CURRENCY,
  SALES_CONTACT_EMAIL,
  SUPPORTED_CURRENCIES,
  formatPlanCyclePrice,
  getPlan,
  type BillingPlanId,
  type PricingCurrencyCode,
} from '@urganize/pricing';
import { Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH } from '@/lib/home-path';
import { supabase } from '@/lib/supabase/client';
import { type AccountStatus } from '@/lib/subscription-access';
import { errorMessage } from '@/lib/errors';
import { isAllowlistedEmail } from '@/lib/paywall-allowlist';

// Recurring billing /locked page.
//
// Flow:
//   1. User picks Monthly or Annual (radio).
//   2. User picks NGN or USD (currency toggle — default NGN, sticky per
//      session via local state; future enhancement could geo-detect).
//   3. Click "Subscribe" → POST /api/billing/start-checkout with plan +
//      currency → server returns Paystack authorization_url → redirect.
//   4. On the Paystack hosted checkout, customer pays. Paystack creates a
//      subscription tied to OUR user_id via metadata. Webhook credits.
//   5. Customer is redirected to /payment/callback?reference=... which can
//      verify state via GET /api/payments/verify if the user lands there
//      before the webhook fires (race window). The webhook is authoritative.
//
// The 28-day no-card trial is preserved verbatim — it's a separate path
// that doesn't touch Paystack.

type AccessSnapshot = {
  accountStatus: AccountStatus;
  hasAccess: boolean;
  trialUsed: boolean;
  trialEndsAt: string | null;
  trialDaysLeft: number;
};

const REASON_COPY: Record<string, string> = {
  unpaid: 'Your account does not have an active subscription or trial.',
  expired: 'Your subscription has expired.',
  trial_expired: 'Your 28-day free trial has ended.',
};

export default function LockedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason') || '';
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const checkAuth = useAuthStore((state) => state.checkAuth);

  const [snapshot, setSnapshot] = useState<AccessSnapshot | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(true);
  const [isStartingTrial, setIsStartingTrial] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanId>('annual');
  const [selectedCurrency, setSelectedCurrency] = useState<PricingCurrencyCode>(DEFAULT_PRICING_CURRENCY);

  // Allowlisted emails never see this page. Bounce them out before render
  // can flash any locked UI.
  useEffect(() => {
    if (isAuthenticated && isAllowlistedEmail(user?.email)) {
      console.log(`[paywall-allowlist] locked-page bypass: ${user?.email}`);
      router.replace(HOME_PATH);
    }
  }, [isAuthenticated, user?.email, router]);

  // Pull the live access snapshot from the server so the trial button's
  // disabled state reflects the authoritative trial_used flag.
  useEffect(() => {
    let cancelled = false;

    const loadSnapshot = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          if (!cancelled) setIsLoadingSnapshot(false);
          return;
        }

        const response = await fetch('/api/subscription-status', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as Partial<AccessSnapshot>;

        if (!cancelled && response.ok) {
          setSnapshot({
            accountStatus: (payload.accountStatus as AccountStatus) || 'unpaid',
            hasAccess: Boolean(payload.hasAccess),
            trialUsed: Boolean(payload.trialUsed),
            trialEndsAt: typeof payload.trialEndsAt === 'string' ? payload.trialEndsAt : null,
            trialDaysLeft: Number(payload.trialDaysLeft) || 0,
          });
        }
      } catch {
        // Fail open with no snapshot — the buttons still render.
      } finally {
        if (!cancelled) setIsLoadingSnapshot(false);
      }
    };

    loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, []);

  // If access flips to true while the user is on /locked (e.g., webhook
  // credited them in the background), bounce them back to the app.
  useEffect(() => {
    if (snapshot?.hasAccess) {
      router.replace(HOME_PATH);
    }
  }, [snapshot?.hasAccess, router]);

  const handleStartTrial = useCallback(async () => {
    setTrialError(null);
    setIsStartingTrial(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sign in again and retry.');

      const response = await fetch('/api/trial/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not start trial.');
      }

      await checkAuth();
      router.replace(HOME_PATH);
    } catch (error) {
      setTrialError(errorMessage(error, 'Could not start trial.'));
      setIsStartingTrial(false);
    }
  }, [checkAuth, router]);

  const handleSubscribe = useCallback(async () => {
    // Defensive: sales-led tiers have no self-serve checkout (the UI renders
    // a mailto instead of the Subscribe button for them). Never POST a
    // contactSales plan to start-checkout — it would 500.
    if (getPlan(selectedPlan).contactSales) return;
    setCheckoutError(null);
    setIsStartingCheckout(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sign in again and retry.');

      const response = await fetch('/api/billing/start-checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: selectedPlan, currency: selectedCurrency }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        authorizationUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.authorizationUrl) {
        throw new Error(payload.error || 'Could not start checkout.');
      }

      if (typeof window !== 'undefined') {
        window.location.href = payload.authorizationUrl;
      }
    } catch (error) {
      setCheckoutError(errorMessage(error, 'Could not start checkout.'));
      setIsStartingCheckout(false);
    }
  }, [selectedPlan, selectedCurrency]);

  const trialUsed = Boolean(snapshot?.trialUsed);
  const reasonCopy = REASON_COPY[reason] || REASON_COPY.unpaid;

  const headline = useMemo(() => {
    if (!isAuthenticated) return 'Sign in to continue';
    return 'Your access is locked';
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4 py-12">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <Logo />

        <Card padding="lg" className="w-full flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-status-warning/10 text-status-warning flex items-center justify-center">
              <Lock className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-content-primary">{headline}</h1>
              {isAuthenticated ? (
                <p className="text-sm text-content-secondary">{reasonCopy}</p>
              ) : (
                <p className="text-sm text-content-secondary">
                  Sign in to your account, then pick a way to unlock the app.
                </p>
              )}
            </div>
          </div>

          {isAuthenticated ? (
            <>
              <div className="flex flex-col gap-4">
                {/* Currency toggle — small affordance up top so the plan
                    cards below reflect the right number on first paint. */}
                <div className="flex items-center justify-between text-xs text-content-tertiary">
                  <span className="uppercase tracking-[0.16em]">Currency</span>
                  <div className="inline-flex overflow-hidden rounded-full border border-stroke-default">
                    {SUPPORTED_CURRENCIES.map((currency) => {
                      const isActive = selectedCurrency === currency;
                      return (
                        <button
                          key={currency}
                          type="button"
                          onClick={() => setSelectedCurrency(currency)}
                          className={`px-3 py-1 text-xs font-semibold transition-colors ${
                            isActive
                              ? 'bg-brand text-content-inverse'
                              : 'bg-transparent text-content-secondary hover:text-content-primary'
                          }`}
                          aria-pressed={isActive}
                        >
                          {currency}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Plan radio cards. Annual first (recommended), monthly
                    second, label (roster tier) last. Each card is a real
                    <button role="radio"> bound to a fieldset so screen
                    readers + keyboard selection work the same as a native
                    radio group. */}
                <div role="radiogroup" aria-label="Choose a plan" className="flex flex-col gap-2">
                  {(['annual', 'monthly', 'label'] as const).map((planId) => {
                    const plan = getPlan(planId);
                    const isActive = selectedPlan === planId;
                    return (
                      <button
                        key={planId}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => setSelectedPlan(planId)}
                        className={`flex items-start justify-between gap-3 rounded-lg border p-4 text-left transition-colors ${
                          isActive
                            ? 'border-brand bg-brand/5'
                            : 'border-stroke-default bg-bg-elevated hover:border-stroke-strong'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-content-primary">{plan.label}</p>
                          <p className="mt-1 text-xs text-content-secondary">{plan.description}</p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-content-primary">
                          {plan.contactSales
                            ? 'Contact us'
                            : formatPlanCyclePrice(planId, selectedCurrency)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {getPlan(selectedPlan).contactSales ? (
                  // Sales-led tier (Label): no self-serve checkout — that
                  // path was never wired and 500s. Send the roster buyer to
                  // the founders instead of a Subscribe button.
                  <a
                    href={`mailto:${SALES_CONTACT_EMAIL}?subject=${encodeURIComponent('Urganize Label plan enquiry')}`}
                    className="inline-flex w-full items-center justify-center rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
                  >
                    Contact us about {getPlan(selectedPlan).label}
                  </a>
                ) : (
                  <Button
                    variant="primary"
                    className="w-full"
                    disabled={isStartingCheckout}
                    onClick={handleSubscribe}
                  >
                    {isStartingCheckout
                      ? 'Redirecting to checkout…'
                      : `Subscribe ${formatPlanCyclePrice(selectedPlan, selectedCurrency)}`}
                  </Button>
                )}

                {trialUsed ? (
                  <div className="flex items-center gap-2 text-sm text-content-secondary px-3 py-2 rounded-md bg-bg-elevated">
                    <CheckCircle2 className="size-4 text-content-tertiary" />
                    <span>Trial already used</span>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={isStartingTrial || isLoadingSnapshot}
                    onClick={handleStartTrial}
                  >
                    {isStartingTrial ? 'Starting trial…' : 'Start 28-day free trial'}
                  </Button>
                )}

                <button
                  type="button"
                  onClick={() => router.push('/redeem')}
                  className="text-center text-xs text-content-tertiary hover:text-content-secondary"
                >
                  Have a promo code?
                </button>
              </div>

              {checkoutError ? (
                <div className="flex items-start gap-2 text-sm text-status-error">
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                  <span>{checkoutError}</span>
                </div>
              ) : null}

              {trialError ? (
                <div className="flex items-start gap-2 text-sm text-status-error">
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                  <span>{trialError}</span>
                </div>
              ) : null}

              {user?.email ? (
                <p className="text-xs text-content-tertiary">
                  Signed in as <span className="text-content-secondary">{user.email}</span>. Paystack
                  will charge the card you enter at checkout — your subscription is bound to this
                  account automatically.
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <Button
                variant="primary"
                className="w-full"
                onClick={() => router.push('/auth?next=/locked')}
              >
                Sign in
              </Button>
            </div>
          )}
        </Card>

        <p className="text-xs text-content-tertiary text-center">
          Need help?{' '}
          <a
            className="underline text-content-secondary"
            href="mailto:contact@urganize.app"
          >
            contact@urganize.app
          </a>
        </p>
      </div>
    </div>
  );
}
