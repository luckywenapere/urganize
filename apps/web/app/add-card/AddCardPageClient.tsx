'use client';

// Card trial for customers abroad (2026-11-14, #1266; mock
// docs/mocks/card-trial-abroad). Three things on one address:
//
//   the offer     "Try Solo Plus free for 3 days": the plan, $0 today, the day
//                 of the first charge, and the button to Bachs's card page.
//   coming back   ?reference=... after the card page: asks the server until
//                 Bachs says the trial has started.
//   started       "You have 3 days free", and into the app.
//
// AddCardGate sends people here; nobody is sent here in Nigeria, in the iPhone
// app, or before Bachs has card trials on for us. If the server says the card
// trial is not available after all, the person goes straight into the app on
// the trial that needs no card.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PRICING_TIERS, getTierPriceUsd } from '@urganize/pricing';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { HOME_PATH } from '@/lib/home-path';
import { isIOSApp } from '@/lib/platform';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { TEAM_TRIAL_DAYS } from '@/lib/team-billing';
import { CHECKOUT_PLANS, isCheckoutPlan, type CheckoutPlan } from '@/lib/self-serve';
import { clearOnboardingLanding, readOnboardingLanding, trialSheetTier } from '@/lib/onboarding-landing';
import { CARD_FEE_NOTE, cardTrialOfferCopy, formatChargeDay, formatUsd, pricePerPeriod, type CardTrialPeriod } from '@/lib/bachs-trial';
import {
  Heading,
  Lede,
  OnboardingFrame,
  Spinner,
  errorTextClass,
  primaryButtonClass,
  surfaceClass,
  textLinkClass,
} from '@/components/onboarding/OnboardingFrame';

type TrialSummary = {
  status: string;
  plan: string;
  period: CardTrialPeriod;
  amountUsd: number;
  trialEnd: string | null;
};

const POLL_MS = 2500;
const POLL_TRIES = 24;

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[15px]">
      <span className="text-content-secondary">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

function Tick({ children }: { children: string }) {
  return (
    <li className="flex items-start gap-2.5 text-[15px] text-content-secondary">
      <span aria-hidden className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-brand/10 text-xs text-brand">
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function AddCardPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const logout = useAuthStore((state) => state.logout);

  const [reference, setReference] = useState<string | null | undefined>(undefined);
  const [plan, setPlan] = useState<CheckoutPlan>('solo');
  const [period, setPeriod] = useState<CardTrialPeriod>('monthly');
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<TrialSummary | null>(null);
  const [waitedOut, setWaitedOut] = useState(false);
  const [now] = useState(() => Date.now());
  const polls = useRef(0);

  // The address is read after mount: useSearchParams here would turn this
  // statically built page into its loading screen.
  useEffect(() => {
    let found: string | null = null;
    try {
      found = new URLSearchParams(window.location.search).get('reference');
    } catch {
      found = null;
    }
    setReference(found?.trim() || null);
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) router.replace('/auth');
    else if (isIOSApp()) router.replace(HOME_PATH);
  }, [isAuthLoading, isAuthenticated, router]);

  // The plan the sign-up questions pointed at.
  useEffect(() => {
    const landing = readOnboardingLanding(user?.id ?? null);
    const tier = trialSheetTier(landing?.whoFor);
    if (isCheckoutPlan(tier)) setPlan(tier);
  }, [user?.id]);

  const enterApp = useCallback(() => {
    // The no-card "your trial is on" sheet would be untrue now.
    clearOnboardingLanding();
    router.replace(HOME_PATH);
  }, [router]);

  // Back from the card page: ask until Bachs says the trial started.
  useEffect(() => {
    if (!reference || started || waitedOut || !isAuthenticated) return;
    let cancelled = false;
    let timer: number | undefined;
    const ask = async () => {
      polls.current += 1;
      try {
        const token = await accessToken();
        if (token) {
          const response = await fetch(`/api/billing/bachs/trial?reference=${encodeURIComponent(reference)}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          const payload = (await response.json().catch(() => ({}))) as { started?: boolean; trial?: TrialSummary };
          if (cancelled) return;
          if (response.ok && payload.started && payload.trial) {
            clearOnboardingLanding();
            setStarted(payload.trial);
            captureAnalyticsEvent({ name: 'card_trial_started', properties: { plan: payload.trial.plan, period: payload.trial.period } });
            return;
          }
          if (response.status === 404) {
            setWaitedOut(true);
            return;
          }
        }
      } catch {
        // Try again on the next turn.
      }
      if (cancelled) return;
      if (polls.current >= POLL_TRIES) setWaitedOut(true);
      else timer = window.setTimeout(ask, POLL_MS);
    };
    void ask();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [reference, started, waitedOut, isAuthenticated]);

  const price = useMemo(() => getTierPriceUsd(plan, period), [plan, period]);
  const copy = useMemo(
    () =>
      cardTrialOfferCopy({
        planName: PRICING_TIERS[plan].label,
        amountUsd: price?.amount ?? 0,
        period,
        trialDays: TEAM_TRIAL_DAYS,
        now,
      }),
    [plan, period, price, now]
  );

  const addCard = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await accessToken();
      if (!token) {
        router.replace('/auth');
        return;
      }
      captureAnalyticsEvent({ name: 'card_trial_card_page_opened', properties: { plan, period } });
      const response = await fetch('/api/billing/bachs/trial', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, period }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        checkoutUrl?: string;
        unavailable?: boolean;
        error?: string;
      };
      if (payload.unavailable) {
        enterApp();
        return;
      }
      if (response.status === 409) {
        enterApp();
        return;
      }
      if (!response.ok || !payload.checkoutUrl) {
        setError(payload.error || 'Could not open the card page. Try again.');
        return;
      }
      // The card page takes over this tab and brings them back here.
      window.location.href = payload.checkoutUrl;
    } catch {
      setError('Could not open the card page. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (isAuthLoading || !isAuthenticated || reference === undefined) {
    return (
      <OnboardingFrame narrow>
        <div className="flex justify-center py-16" role="status" aria-label="Loading">
          <Spinner />
        </div>
      </OnboardingFrame>
    );
  }

  if (started) {
    const day = formatChargeDay(started.trialEnd);
    return (
      <OnboardingFrame name={user?.name} narrow>
        <p className="inline-flex rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">Trial on</p>
        <div className="mt-3">
          <Heading>You have {TEAM_TRIAL_DAYS} days free</Heading>
        </div>
        <Lede>
          {day
            ? `Your first ${formatUsd(started.amountUsd)} is on ${day}. We will remind you the day before.`
            : `Your first ${formatUsd(started.amountUsd)} comes after your free days. We will remind you the day before.`}
        </Lede>
        <p className="mt-2 text-[15px] text-content-secondary">You can cancel any time in Settings.</p>
        <p className="mt-2 text-[15px] text-content-secondary">{CARD_FEE_NOTE}</p>
        <button type="button" onClick={enterApp} className={`${primaryButtonClass} mt-8`}>
          Start my first rollout
        </button>
      </OnboardingFrame>
    );
  }

  if (reference && !waitedOut) {
    return (
      <OnboardingFrame name={user?.name} narrow>
        <Heading>Starting your trial</Heading>
        <Lede>This takes a few seconds. Keep this page open.</Lede>
        <div className="flex justify-center py-12" role="status" aria-label="Starting your trial">
          <Spinner />
        </div>
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame name={user?.name} narrow>
      <Heading>{copy.title}</Heading>
      <Lede>{copy.lede}</Lede>

      {waitedOut ? (
        <p role="alert" className={`${errorTextClass} mt-4`}>
          We could not see a card yet. If the card did not go through, try another card.
        </p>
      ) : null}

      <div className={`${surfaceClass} mt-5 flex flex-col gap-2.5 p-4`}>
        <Row label="Plan" value={PRICING_TIERS[plan].label} />
        <Row label="Today" value={copy.today} />
        <Row label={copy.thenLabel} value={copy.thenValue} />
        <ul className="mt-1 flex flex-col gap-2 border-t border-stroke-default pt-3">
          <Tick>We email you a day before we charge.</Tick>
          <Tick>Cancel any time in Settings, in two taps.</Tick>
          <Tick>{copy.feeNote}</Tick>
        </ul>
      </div>

      {choosing ? (
        <fieldset className="mt-4">
          <legend className="text-[13.5px] font-semibold">Pick a plan</legend>
          <div className="mt-2 flex flex-col gap-2">
            {CHECKOUT_PLANS.map((id) => {
              const monthly = getTierPriceUsd(id, 'monthly');
              if (!monthly) return null;
              return (
                <label
                  key={id}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 ${
                    plan === id ? 'border-brand bg-brand/10' : 'border-stroke-control'
                  }`}
                >
                  <input type="radio" name="plan" checked={plan === id} onChange={() => setPlan(id)} className="accent-brand" />
                  <span className="flex-1 text-[15px] font-semibold">{PRICING_TIERS[id].label}</span>
                  <span className="text-sm text-content-secondary">{pricePerPeriod(monthly.amount, 'monthly')}</span>
                </label>
              );
            })}
          </div>
          <p id="add-card-period" className="mt-4 text-[13.5px] font-semibold">Pay each</p>
          <div role="radiogroup" aria-labelledby="add-card-period" className="mt-2 flex gap-2">
            {(['monthly', 'annual'] as const).map((id) => (
              <label
                key={id}
                className={`flex min-h-12 flex-1 cursor-pointer items-center gap-3 rounded-xl border px-3.5 ${
                  period === id ? 'border-brand bg-brand/10' : 'border-stroke-control'
                }`}
              >
                <input type="radio" name="period" checked={period === id} onChange={() => setPeriod(id)} className="accent-brand" />
                <span className="text-[15px] font-semibold">{id === 'annual' ? 'Year' : 'Month'}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="mt-4 text-sm">
          <button type="button" onClick={() => setChoosing(true)} className={textLinkClass}>
            Change plan
          </button>
        </p>
      )}

      {error ? (
        <p role="alert" className={`${errorTextClass} mt-4`}>
          {error}
        </p>
      ) : null}

      <button type="button" onClick={addCard} disabled={busy || !price} aria-busy={busy} className={`${primaryButtonClass} mt-8`}>
        {busy ? <Spinner /> : null}
        Add card and start free
      </button>
      <p className="mt-2.5 text-center text-[13px] text-content-tertiary">
        Your card is handled by Bachs, our payment partner. We never see the number.
      </p>
      <p className="mt-6 text-center text-sm">
        <button
          type="button"
          onClick={() => {
            void logout().then(() => router.replace('/auth'));
          }}
          className={textLinkClass}
        >
          Log out
        </button>
      </p>
    </OnboardingFrame>
  );
}
