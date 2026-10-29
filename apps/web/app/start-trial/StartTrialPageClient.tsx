'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Logo } from '@urganize/ui';
import { formatPlanCyclePrice, getPlan } from '@urganize/pricing';
import { AlertTriangle, CheckCircle2 } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { CURATOR_HOME_PATH, HOME_PATH } from '@/lib/home-path';
import { supabase } from '@/lib/supabase/client';
import { type AccountStatus } from '@/lib/subscription-access';
import { formatBillingDate } from '@/lib/billing-summary';
import { errorMessage } from '@/lib/errors';
import { isIOSApp, isNativePlatform } from '@/lib/platform';
import { openExternalUrl } from '@/lib/external-link';
import {
  TRIAL_CARD_VERIFICATION_DISPLAY_NGN,
  TRIAL_DAYS,
  computeTrialEnd,
  isCardTrialEnabled,
  type CardTrialPlanId,
} from '@/lib/trial-card';

// /start-trial — the card-before-trial page (NEXT_PUBLIC_FEATURE_CARD_TRIAL).
//
// ⚠️ RETIRED 2026-09-10 (founder call), flag off in production. DO NOT flip it
// back on: the two getPlan()/formatPlanCyclePrice calls below read the frozen
// legacy BILLING_PLANS table, so this page quotes ₦80,000/mo and ₦800,000/yr —
// against a product that has sold PRICING_TIERS annual-only since 2026-09-08
// (Solo ₦5,000, Manager ₦22,000, Label ₦50,000 a year). It also charges the
// legacy Paystack Plans rather than the tier ones. Rewiring to
// purchasableTiers() at SELLING_INTERVAL is the precondition for reviving
// this; see the header of lib/trial-card.ts and the CLAUDE.md working note
// "The card trial is retired".
//
// Onboarding lands new signups here (finishToDashboard) and the login-time
// bounce in auth-store sends escapees back. The user picks Monthly or Annual,
// sees exactly what will happen (₦0 due today, a refunded ₦100 card check,
// first charge at trial end unless they cancel), and the Start button routes
// through /api/trial/start-checkout to Paystack's hosted card page. When the
// webhook finishes setup, /payment/callback confirms and the dashboard opens.
//
// Redirect rules (deliberately narrow):
//   - flag off            → HOME_PATH (three-guard pattern: effect + fetch
//                           skip + render null)
//   - not signed in       → /auth?next=/start-trial
//   - curator-only        → /curator (team billing never applies to them)
//   - hasAccess           → HOME_PATH (also fires when the webhook lands
//                           while this page is open — see visibilitychange)
//   - trial already used  → /locked (that page owns the paid-plans story)
// It does NOT key on subscription-status's cardTrialRequired: that field
// drives only the login-time bounce. Gating the page on it too would make a
// flag-on / cutoff-unset deploy bounce brand-new signups straight back to the
// dashboard — silently no-opping the whole feature.

const CARD_TRIAL_ENABLED = isCardTrialEnabled();

type AccessSnapshot = {
  accountStatus: AccountStatus;
  hasAccess: boolean;
  trialUsed: boolean;
};

const VALUE_BULLETS = [
  'A full rollout plan for your rollout, built from a proven playbook.',
  'Every activity, file and teammate for the rollout in one place.',
  'You will not be charged during the trial. Cancel anytime in Settings.',
];

export default function StartTrialPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [snapshot, setSnapshot] = useState<AccessSnapshot | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<CardTrialPlanId>('annual');
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  // Apple IAP policy: no external-payment links for a digital subscription
  // inside a reviewed iOS app. Defaults false so SSR and the pre-hydration
  // render match; flips post-mount (the LockedPageClient pattern).
  const [isIOSNativeApp, setIsIOSNativeApp] = useState(false);

  useEffect(() => {
    setIsIOSNativeApp(isIOSApp());
  }, []);

  // Flag off → this page is not a real page.
  useEffect(() => {
    if (!CARD_TRIAL_ENABLED) {
      router.replace(HOME_PATH);
    }
  }, [router]);

  // Auth + curator guards.
  useEffect(() => {
    if (!CARD_TRIAL_ENABLED || isAuthLoading) return;
    if (!isAuthenticated) {
      router.replace('/auth?next=/start-trial');
      return;
    }
    if (String(user?.role || '').toLowerCase() === 'curator') {
      router.replace(CURATOR_HOME_PATH);
    }
  }, [isAuthLoading, isAuthenticated, router, user?.role]);

  const loadSnapshot = useCallback(async () => {
    if (!CARD_TRIAL_ENABLED) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setIsLoadingSnapshot(false);
        return;
      }
      const response = await fetch('/api/subscription-status', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<AccessSnapshot>;
      if (response.ok) {
        setSnapshot({
          accountStatus: (payload.accountStatus as AccountStatus) || 'unpaid',
          hasAccess: Boolean(payload.hasAccess),
          trialUsed: Boolean(payload.trialUsed),
        });
      }
    } catch {
      // Fail open with no snapshot — the page still renders.
    } finally {
      setIsLoadingSnapshot(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  // Returning from the Paystack page (Android system browser, or the iOS
  // "finish on the web" hop) re-focuses this tab — re-check access so the
  // hasAccess redirect below fires once the webhook has landed.
  useEffect(() => {
    if (!CARD_TRIAL_ENABLED) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadSnapshot();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadSnapshot]);

  useEffect(() => {
    if (snapshot?.hasAccess) {
      router.replace(HOME_PATH);
      return;
    }
    if (snapshot && snapshot.trialUsed && !snapshot.hasAccess) {
      router.replace('/locked');
    }
  }, [snapshot, router]);

  const handleStartTrial = useCallback(async () => {
    setCheckoutError(null);
    setIsStartingCheckout(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sign in again and retry.');

      const response = await fetch('/api/trial/start-checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        authorizationUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.authorizationUrl) {
        throw new Error(payload.error || 'Could not start your trial.');
      }

      // Android: a Paystack checkout shouldn't take over the app's own
      // webview — system browser instead (the /locked handleSubscribe branch).
      // iOS never reaches this: the Start button doesn't render there.
      if (isNativePlatform()) {
        await openExternalUrl(payload.authorizationUrl);
        setIsStartingCheckout(false);
      } else if (typeof window !== 'undefined') {
        window.location.href = payload.authorizationUrl;
      }
    } catch (error) {
      setCheckoutError(errorMessage(error, 'Could not start your trial.'));
      setIsStartingCheckout(false);
    }
  }, [selectedPlan]);

  const trialEndDate = useMemo(
    () => formatBillingDate(computeTrialEnd(new Date()).toISOString()),
    []
  );

  if (!CARD_TRIAL_ENABLED) return null;

  return (
    <div className="min-h-screen px-4 py-12">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <Logo />

        <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-start">
          {/* Left: the value framing (the Intercom-checkout shape). */}
          <div className="flex flex-col gap-5">
            <h1 className="font-display text-3xl font-semibold text-content-primary">
              Start your {TRIAL_DAYS}-day free trial.
            </h1>
            <p className="text-sm text-content-secondary">
              Everything you need to run a rollout, from the plan to the tasks to the
              team, is free for {TRIAL_DAYS} days. Add a card to begin. Nothing
              is charged until your trial ends.
            </p>
            <ul className="flex flex-col gap-3">
              {VALUE_BULLETS.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2 text-sm text-content-secondary">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: the plan summary card. */}
          <Card padding="lg" className="flex w-full flex-col gap-5">
            {isIOSNativeApp ? (
              // Apple IAP policy — mirror /locked: no prices, no card CTA,
              // only a pointer to finish on the web + a re-check button.
              <>
                <h2 className="text-lg font-semibold text-content-primary">
                  Finish setting up your trial on the web
                </h2>
                <div className="rounded-lg border border-stroke-default bg-bg-elevated p-4 text-sm text-content-secondary">
                  <p>
                    Trials are set up on the web. Visit{' '}
                    <button
                      type="button"
                      onClick={() => openExternalUrl('https://my.urganize.app/start-trial')}
                      className="underline text-content-primary hover:text-brand"
                    >
                      my.urganize.app
                    </button>{' '}
                    in your browser to add a card and start your {TRIAL_DAYS}-day
                    free trial, then come back here.
                  </p>
                </div>
                <Button variant="secondary" className="w-full" onClick={() => void loadSnapshot()}>
                  Check again
                </Button>
              </>
            ) : (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-content-primary">
                    Pick your plan
                  </h2>
                  <p className="mt-1 text-xs text-content-secondary">
                    Your trial is free either way. This is what starts when it
                    ends.
                  </p>
                </div>

                <div role="radiogroup" aria-label="Choose a plan" className="flex flex-col gap-2">
                  {(['annual', 'monthly'] as const).map((planId) => {
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
                          {formatPlanCyclePrice(planId, 'NGN')}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-2 rounded-lg border border-stroke-default bg-bg-elevated p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-content-secondary">Due today</span>
                    <span className="text-xl font-semibold text-content-primary">₦0</span>
                  </div>
                  <p className="text-xs text-content-tertiary">
                    We place a ₦{TRIAL_CARD_VERIFICATION_DISPLAY_NGN} card check to
                    verify your card. It is refunded immediately.
                  </p>
                  <p className="text-xs text-content-tertiary">
                    Trial ends {trialEndDate}, then{' '}
                    {formatPlanCyclePrice(selectedPlan, 'NGN')} unless you cancel.
                    Cancel anytime in Settings → Billing.
                  </p>
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  disabled={isStartingCheckout || isLoadingSnapshot}
                  onClick={handleStartTrial}
                >
                  {isStartingCheckout
                    ? 'Redirecting to secure checkout…'
                    : `Start your ${TRIAL_DAYS}-day free trial`}
                </Button>

                {checkoutError ? (
                  <div role="alert" className="flex items-start gap-2 text-sm text-status-error">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>{checkoutError}</span>
                  </div>
                ) : null}

                {user?.email ? (
                  <p className="text-xs text-content-tertiary">
                    Signed in as{' '}
                    <span className="text-content-secondary">{user.email}</span>. Card
                    details are entered on Paystack&apos;s secure page. We never see
                    them.
                  </p>
                ) : null}
              </>
            )}
          </Card>
        </div>

        <p className="text-center text-xs text-content-tertiary">
          Need help?{' '}
          <a className="underline text-content-secondary" href="mailto:contact@urganize.app">
            contact@urganize.app
          </a>
        </p>
      </div>
    </div>
  );
}
