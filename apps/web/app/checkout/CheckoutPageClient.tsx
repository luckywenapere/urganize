'use client';

// Self-serve checkout (2026-10-22). Amount first: the plan, how often, what you
// get, card or bank transfer, an optional code, then one button with the
// total on it. Signed out, it asks for an account first and keeps the plan.
//
// Nothing on this page lets anyone in. A verified Paystack payment does, in
// the webhook. Card and bank transfer get equal weight.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DISTRIBUTION_REQUIRES_PREPAY,
  INTRO_MONTHS,
  PRICING_TIERS,
  distributionIncluded,
  type BillingInterval,
} from '@urganize/pricing';
import { Logo, LoadingMark } from '@urganize/ui';
import { useAuthStore } from '@/lib/auth-store';
import { BOOK_CALL_LABEL, needsOnboardingCall } from '@/lib/call-led';
import { supabase } from '@/lib/supabase/client';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { MIN_PASSWORD_LENGTH, isPasswordLongEnough } from '@/lib/password-rules';
import {
  CHECKOUT_PLANS,
  PENDING_CHECKOUT_METADATA_KEY,
  SELF_SERVE_COPY,
  checkoutPath,
  formatNaira,
  formatPrice,
  parseCheckoutIntent,
  partPaidCopy,
  periodAmount,
  periodHeadline,
  periodLabel,
  periodSaving,
  introSubline,
  periodsForMethod,
  planName,
  setupCallUrl,
  youGet,
  type CheckoutIntent,
  type CheckoutPlan,
  type PaymentMethodChoice,
} from '@/lib/self-serve';
import { useVisitorCurrency } from '@/lib/visitor-currency';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { SetupSteps } from '@/components/onboarding/SetupSteps';
import { planRowLine, planTiles, showsIntervalChoice } from '@/lib/checkout-plan-rows';

/** What Bachs takes (docs.bachs.io, 2026-11-01). Its own page shows the
 *  amount in the payer's money. */
const BACHS_WAYS_TO_PAY = [
  'Bank transfer (₦)',
  'Naira card',
  'Mobile money (GH₵, KSh and more)',
  'Dollar card',
  'USDT or USDC',
] as const;

/** Outside Nigeria the checkout is priced in US dollars (#1120). Mobile money
 *  is left off until we have seen Bachs offer it on a dollar checkout. */
const BACHS_WAYS_TO_PAY_USD = ['Visa or Mastercard', 'USDT or USDC'] as const;

type Options = {
  /** Call-led plans this person may pay for now, as "plan:period": a payment link from the founder, or a renewal. */
  callLedAllowed: string[];
  cardPeriods: Record<CheckoutPlan, BillingInterval[]>;
  /** Starting-price months left (2026-10-26). */
  introMonthsLeft?: number;
  transferAccounts: boolean;
  /** Bachs (2026-11-01): one Pay button, any currency or way to pay. */
  payWithBachs?: boolean;
  /** Dollars outside Nigeria (#1120), Naira in it. */
  currency?: 'NGN' | 'USD';
  distributionOn: boolean;
  approved: boolean;
  openInvoice: {
    id: string;
    plan: CheckoutPlan;
    period: BillingInterval;
    amountKobo: number;
    creditKobo: number;
    paidKobo: number;
  } | null;
  /** The plan this person already pays for, if any. */
  current: { plan: CheckoutPlan; period: BillingInterval; card: boolean } | null;
};

const PLAN_RANK: Record<CheckoutPlan, number> = { solo: 0, solo_plus: 1, manager: 2, pro: 3, label: 4 };

type TransferInvoice = {
  id: string;
  plan: CheckoutPlan;
  period: BillingInterval;
  status: 'open' | 'paid' | 'cancelled';
  amountKobo: number;
  creditKobo: number;
  paidKobo: number;
  remainingKobo: number;
};

type TransferAccount = { bankName: string; accountNumber: string; accountName: string };

const primaryButton =
  'flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-base font-semibold text-content-inverse transition-colors duration-fast hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';
const outlineButton =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-stroke-control bg-bg-surface px-5 text-base font-semibold text-content-primary transition-colors duration-fast hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60';
const fieldClass =
  'mt-1.5 block w-full rounded-xl border border-stroke-control bg-bg-surface px-4 py-3 text-lg text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none';
const POLL_MS = 5_000;

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function track(
  name:
    | 'checkout_started'
    | 'checkout_failed'
    | 'payment_method_selected'
    | 'promo_applied'
    | 'promo_rejected'
    | 'upgrade_to_manager_clicked'
    | 'signup_started_paid'
    | 'dva_copied',
  props: { plan?: string; period?: string; method?: 'card' | 'transfer' | null; reason?: string; source?: string; kind?: string },
  userId?: string | null
) {
  captureAnalyticsEvent(createPostHogEvent(name, { path: 'self_serve', ...props }), { userId: userId ?? null });
}

function spacedAccountNumber(value: string): string {
  const digits = value.replace(/\s+/g, '');
  return digits.length === 10 ? `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}` : digits;
}

/** Label and every 6-month or yearly plan start with a call; nobody pays before it. */
function CallStep({
  intent,
  onPickMonthly,
}: {
  intent: CheckoutIntent;
  onPickMonthly: (plan: CheckoutPlan) => void;
}) {
  const url = setupCallUrl();
  const name = planName(intent.plan);
  const monthlyPlan: CheckoutPlan = intent.plan === 'label' ? 'pro' : intent.plan;
  const steps = [
    'Pick a time. It takes 15 minutes.',
    'We talk through your team and your releases.',
    'After the call, we email you a payment link.',
  ];
  return (
    <main className="min-h-screen px-5 pb-16 pt-6 lg:px-10 lg:pt-10">
      <div className="mx-auto max-w-lg">
        <Mark />
        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
          {name} · {periodLabel(intent.period)}
        </p>
        <h1 className="mt-2 font-display text-[34px] leading-tight text-content-primary">
          Book your onboarding call
        </h1>
        <p className="mt-3 text-content-secondary">
          {intent.plan === 'label'
            ? 'Every Label team starts with a call.'
            : `Every ${periodLabel(intent.period).toLowerCase()} plan starts with a call.`}{' '}
          Nothing to pay today.
        </p>
        <ol className="mt-6 space-y-3">
          {steps.map((line, index) => (
            <li key={line} className="flex gap-3 text-content-primary">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand text-sm font-semibold text-black">
                {index + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={`mt-8 ${primaryButton}`}>
            {BOOK_CALL_LABEL}
          </a>
        ) : (
          <a href="mailto:contact@urganize.app?subject=Onboarding%20call" className={`mt-8 ${primaryButton}`}>
            Email us to book a call
          </a>
        )}
        <button
          type="button"
          onClick={() => onPickMonthly(monthlyPlan)}
          className="mt-4 text-sm text-content-secondary underline underline-offset-4"
        >
          Prefer to start now? Pay for {planName(monthlyPlan)} monthly.
        </button>
      </div>
    </main>
  );
}

function Mark() {
  return (
    <Link href="/" aria-label="Urganize" className="inline-flex">
      <Logo />
    </Link>
  );
}

export default function CheckoutPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const checkAuth = useAuthStore((state) => state.checkAuth);

  const [intent, setIntent] = useState<CheckoutIntent>(() =>
    parseCheckoutIntent({
      plan: searchParams.get('plan'),
      period: searchParams.get('period'),
      promo: searchParams.get('promo'),
    })
  );
  const [method, setMethod] = useState<PaymentMethodChoice>(
    searchParams.get('method') === 'transfer' ? 'transfer' : 'card'
  );
  const [pickingPlan, setPickingPlan] = useState(searchParams.get('change') === '1');

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  if (isLoading && !isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingMark />
      </main>
    );
  }

  const monthlyFallback = (plan: CheckoutPlan) =>
    setIntent((current) => ({ ...current, plan, period: 'monthly' }));

  // A payment link from the founder opens /checkout with cleared=1. That only
  // shows the sign-up; the payment routes still check the real clearance.
  if ((!isAuthenticated || !user) && needsOnboardingCall(intent.plan, intent.period) && searchParams.get('cleared') !== '1') {
    return <CallStep intent={intent} onPickMonthly={monthlyFallback} />;
  }

  if (!isAuthenticated || !user) {
    return (
      <SignupStep
        intent={intent}
        onChangePlan={(plan) => setIntent((current) => ({ ...current, plan }))}
        pickingPlan={pickingPlan}
        setPickingPlan={setPickingPlan}
      />
    );
  }

  return (
    <CheckoutStep
      intent={intent}
      setIntent={setIntent}
      method={method}
      setMethod={setMethod}
      pickingPlan={pickingPlan}
      setPickingPlan={setPickingPlan}
      userId={user.id}
      userEmail={user.email ?? ''}
      onPickMonthly={monthlyFallback}
      onPaid={() => router.replace('/checkout/welcome')}
    />
  );
}

// ---------------------------------------------------------------- plan picker

function PlanChip({
  plan,
  onChange,
  open,
  setOpen,
  suffix,
  introMonthsLeft = 0,
  currency = 'NGN',
}: {
  plan: CheckoutPlan;
  onChange: (plan: CheckoutPlan) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  suffix?: string;
  introMonthsLeft?: number;
  currency?: 'NGN' | 'USD';
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-brand/15 px-3 py-1 font-mono text-xs uppercase tracking-[0.12em] text-brand">
          {planName(plan)}
          {suffix ? ` · ${suffix}` : ''}
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="min-h-11 text-sm text-content-secondary underline underline-offset-4 hover:text-content-primary"
        >
          Change plan
        </button>
      </div>
      {open ? (
        <div role="radiogroup" aria-label="Plan" className="mt-3 flex flex-wrap gap-2">
          {CHECKOUT_PLANS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === plan}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
                option === plan
                  ? 'border-brand bg-brand/10 text-content-primary'
                  : 'border-stroke-control text-content-secondary hover:bg-bg-hover'
              }`}
            >
              {planName(option)} · {formatPrice(periodAmount(option, 'monthly', introMonthsLeft, currency) ?? 0, currency)}/month
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- signed out

function SignupStep({
  intent,
  onChangePlan,
  pickingPlan,
  setPickingPlan,
}: {
  intent: CheckoutIntent;
  onChangePlan: (plan: CheckoutPlan) => void;
  pickingPlan: boolean;
  setPickingPlan: (open: boolean) => void;
}) {
  const signup = useAuthStore((state) => state.signup);
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const currency = useVisitorCurrency();

  const here = checkoutPath(intent);

  const handleGoogle = async () => {
    setError(null);
    track('signup_started_paid', { plan: intent.plan, period: intent.period, reason: 'google' });
    try {
      await loginWithGoogle(here);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Google sign-in did not start.');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Add your name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Add your email.');
    if (!isPasswordLongEnough(password)) return setError(`Use ${MIN_PASSWORD_LENGTH} characters or more.`);
    setBusy(true);
    track('signup_started_paid', { plan: intent.plan, period: intent.period, reason: 'email' });
    try {
      const result = await signup(email, password, name, 'artist-manager', undefined, {
        metadata: { [PENDING_CHECKOUT_METADATA_KEY]: intent },
      });
      if (result.status === 'confirmation_sent') setSentTo(result.email);
      // signed_in: the auth store flips and the checkout draws.
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (!sentTo) return;
    await supabase.auth
      .resend({ type: 'signup', email: sentTo, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
      .catch(() => undefined);
    setResent(true);
  };

  if (sentTo) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-stroke-default bg-bg-surface text-2xl" aria-hidden="true">
            ✉
          </div>
          <h1 className="mt-6 font-display text-2xl text-content-primary">Check your email.</h1>
          <p className="mt-3 text-base text-content-secondary">
            We sent a link to {sentTo}. Open it on any device and you&apos;ll come straight back to pay for{' '}
            {planName(intent.plan)}.
          </p>
          <p className="mt-8 text-sm text-content-secondary">
            {resent ? (
              'Sent again.'
            ) : (
              <>
                No email after a minute?{' '}
                <button type="button" onClick={() => void handleResend()} className="min-h-11 underline underline-offset-4">
                  Send it again
                </button>
              </>
            )}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <Mark />
        <div className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">Your plan</div>
            <div className="mt-0.5 font-semibold text-content-primary">
              {planName(intent.plan)} · {periodHeadline(intent.plan, intent.period, INTRO_MONTHS, currency)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPickingPlan(!pickingPlan)}
            aria-expanded={pickingPlan}
            className="min-h-11 text-sm text-content-secondary underline underline-offset-4"
          >
            Change
          </button>
        </div>
        {pickingPlan ? (
          <div role="radiogroup" aria-label="Plan" className="mt-3 flex flex-wrap gap-2">
            {CHECKOUT_PLANS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === intent.plan}
                onClick={() => {
                  onChangePlan(option);
                  setPickingPlan(false);
                }}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
                  option === intent.plan ? 'border-brand bg-brand/10' : 'border-stroke-control text-content-secondary'
                }`}
              >
                {planName(option)}
              </button>
            ))}
          </div>
        ) : null}

        <h1 className="mt-8 font-display text-2xl text-content-primary">{SELF_SERVE_COPY.signupTitle}</h1>

        <button type="button" onClick={() => void handleGoogle()} className={`mt-6 ${outlineButton}`}>
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-content-tertiary">
          <span className="h-px flex-1 bg-stroke-default" />
          or with email
          <span className="h-px flex-1 bg-stroke-default" />
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
          <label className="block text-sm text-content-secondary">
            Your name
            <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
          </label>
          <label className="block text-sm text-content-secondary">
            Email
            <input
              className={fieldClass}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="block text-sm text-content-secondary">
            Password
            <input
              className={fieldClass}
              type="password"
              value={password}
              minLength={MIN_PASSWORD_LENGTH}
              placeholder={`${MIN_PASSWORD_LENGTH} characters or more`}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-status-error">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? 'Creating your account…' : 'Continue'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-content-secondary">
          Already have an account?{' '}
          <Link href={`/auth?next=${encodeURIComponent(here)}`} className="underline underline-offset-4">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- signed in

function CheckoutStep({
  intent,
  setIntent,
  method,
  setMethod,
  pickingPlan,
  setPickingPlan,
  userId,
  userEmail,
  onPickMonthly,
  onPaid,
}: {
  intent: CheckoutIntent;
  setIntent: (update: (current: CheckoutIntent) => CheckoutIntent) => void;
  method: PaymentMethodChoice;
  setMethod: (method: PaymentMethodChoice) => void;
  pickingPlan: boolean;
  setPickingPlan: (open: boolean) => void;
  userId: string;
  userEmail: string;
  onPickMonthly: (plan: CheckoutPlan) => void;
  onPaid: () => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(Boolean(intent.promo));
  const [codeInput, setCodeInput] = useState(intent.promo ?? '');
  const [codeApplied, setCodeApplied] = useState<{ code: string; line: string } | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<{ invoice: TransferInvoice; account: TransferAccount } | null>(null);
  // A computer gets the plan list beside the payment card (#1229); a phone
  // keeps the layout below. One branch is mounted, never both.
  const isDesktop = useIsDesktopViewport();
  const logout = useAuthStore((state) => state.logout);
  const signOut = async () => {
    await logout().catch(() => undefined);
  };

  const load = useCallback(async () => {
    setLoadError(null);
    const token = await accessToken();
    if (!token) return setLoadError('Sign in again to pay.');
    const response = await fetch('/api/billing/self-serve', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) return setLoadError('We could not load checkout. Try again.');
    setOptions((await response.json()) as Options);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyCode = useCallback(
    async (raw: string) => {
      setCodeError(null);
      const token = await accessToken();
      if (!token) return;
      const response = await fetch('/api/billing/self-serve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ promo: raw }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; code?: string; line?: string; message?: string };
      if (payload.ok && payload.code) {
        setCodeApplied({ code: payload.code, line: payload.line ?? '' });
        setIntent((current) => ({ ...current, promo: payload.code ?? null }));
        track('promo_applied', { plan: intent.plan }, userId);
      } else {
        setCodeApplied(null);
        setCodeError(payload.message || "That code isn't valid.");
        setIntent((current) => ({ ...current, promo: null }));
        track('promo_rejected', { plan: intent.plan }, userId);
      }
    },
    [intent.plan, setIntent, userId]
  );

  // A code in the link is checked once on arrival.
  const checkedLinkCode = useRef(false);
  useEffect(() => {
    if (checkedLinkCode.current || !intent.promo) return;
    checkedLinkCode.current = true;
    void applyCode(intent.promo);
  }, [applyCode, intent.promo]);

  // Already paying for a plan: a different plan is a change (prorated by the
  // existing plan-change code, period kept), the same plan paid by card needs
  // nothing, and the same plan paid by transfer is a renewal (normal checkout).
  const current = options?.current ?? null;
  const changing = Boolean(current && current.plan !== intent.plan);
  const alreadyOnIt = Boolean(current && current.plan === intent.plan && current.card);
  const upgrading = Boolean(current && changing && PLAN_RANK[intent.plan] > PLAN_RANK[current.plan]);

  const cardPeriods = options?.cardPeriods[intent.plan] ?? [];
  const cardAvailable = cardPeriods.length > 0;
  const bachs = options?.payWithBachs === true;
  const currency = options?.currency === 'USD' ? 'USD' : 'NGN';
  // Bachs offers every period whatever they pay with, as transfer does here.
  const effectiveMethod: PaymentMethodChoice =
    bachs || (method === 'card' && options && !cardAvailable) ? 'transfer' : method;
  const periods = useMemo(() => {
    if (changing && current) return [current.period];
    const offered = periodsForMethod(effectiveMethod, cardPeriods);
    // A team renewing a period no longer sold (6 months) still sees it.
    return current && current.plan === intent.plan && !offered.includes(current.period)
      ? [...offered, current.period]
      : offered;
  }, [changing, current, effectiveMethod, cardPeriods, intent.plan]);
  const period = periods.includes(intent.period) ? intent.period : (periods[0] ?? 'monthly');
  const introMonthsLeft = options?.introMonthsLeft ?? 0;
  const amount = periodAmount(intent.plan, period, introMonthsLeft, currency) ?? 0;
  const saving = introSubline(intent.plan, period, introMonthsLeft, currency) ?? periodSaving(period);

  const pickMethod = (next: PaymentMethodChoice) => {
    setMethod(next);
    track('payment_method_selected', { plan: intent.plan, period, method: next }, userId);
  };

  const [changeNote, setChangeNote] = useState<string | null>(null);

  const changePlan = async () => {
    if (!current) return;
    setError(null);
    setBusy(true);
    if ((current.plan === 'solo' && intent.plan === 'manager') || (current.plan === 'manager' && intent.plan === 'pro')) {
      track('upgrade_to_manager_clicked', { plan: intent.plan, period: current.period, source: 'checkout' }, userId);
    }
    track('checkout_started', { plan: intent.plan, period: current.period, method: 'card', kind: 'change' }, userId);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sign in again to pay.');
      const response = await fetch('/api/billing/change-plan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: intent.plan, interval: current.period }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        kind?: string;
        authorizationUrl?: string;
        effectiveAt?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'Could not change the plan.');
      if (payload.kind === 'upgrade_checkout' && payload.authorizationUrl) {
        window.location.assign(payload.authorizationUrl);
        return;
      }
      if (payload.kind === 'upgrade_applied') {
        window.location.assign('/dashboard');
        return;
      }
      if (payload.kind === 'downgrade' && payload.effectiveAt) {
        const when = new Date(payload.effectiveAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
        setChangeNote(`Your plan changes to ${planName(intent.plan)} on ${when}. Nothing to pay now.`);
        setBusy(false);
        return;
      }
      throw new Error('Could not change the plan.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not change the plan.');
      track('checkout_failed', { plan: intent.plan, period: current.period, method: 'card', reason: 'change' }, userId);
      setBusy(false);
    }
  };

  const pay = async () => {
    if (changing) return changePlan();
    setError(null);
    setBusy(true);
    track('checkout_started', { plan: intent.plan, period, method: effectiveMethod }, userId);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sign in again to pay.');
      if (bachs) {
        const response = await fetch('/api/billing/bachs', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: intent.plan, period }),
        });
        const payload = (await response.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string };
        if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error || 'Could not start the payment.');
        window.location.assign(payload.checkoutUrl);
        return;
      }
      if (effectiveMethod === 'card') {
        const response = await fetch('/api/billing/start-checkout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: intent.plan, currency: 'NGN', interval: period, promo: intent.promo, selfServe: true }),
        });
        const payload = (await response.json().catch(() => ({}))) as { authorizationUrl?: string; error?: string };
        if (!response.ok || !payload.authorizationUrl) throw new Error(payload.error || 'Could not start the payment.');
        window.location.assign(payload.authorizationUrl);
        return;
      }
      const response = await fetch('/api/billing/transfer', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: intent.plan, period, promo: intent.promo }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        mode?: 'account' | 'checkout' | 'paid';
        invoice?: TransferInvoice;
        account?: TransferAccount;
        authorizationUrl?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'Could not start the transfer.');
      if (payload.mode === 'paid') return onPaid();
      if (payload.mode === 'checkout' && payload.authorizationUrl) {
        window.location.assign(payload.authorizationUrl);
        return;
      }
      if (payload.mode === 'account' && payload.invoice && payload.account) {
        setTransfer({ invoice: payload.invoice, account: payload.account });
        setBusy(false);
        return;
      }
      throw new Error('Could not start the transfer.');
    } catch (problem) {
      const message = problem instanceof Error ? problem.message : 'Could not start the payment.';
      setError(message);
      track('checkout_failed', { plan: intent.plan, period, method: effectiveMethod, reason: 'start' }, userId);
      setBusy(false);
    }
  };

  if (transfer) {
    return (
      <TransferWaiting
        invoice={transfer.invoice}
        account={transfer.account}
        userId={userId}
        onPaid={onPaid}
      />
    );
  }

  if (!options) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        {loadError ? (
          <>
            <p role="alert" className="text-content-secondary">{loadError}</p>
            <button type="button" onClick={() => void load()} className={`max-w-xs ${outlineButton}`}>
              Try again
            </button>
          </>
        ) : (
          <LoadingMark />
        )}
      </main>
    );
  }

  if (
    needsOnboardingCall(intent.plan, period) &&
    !options.callLedAllowed.includes(`${intent.plan}:${period}`)
  ) {
    return <CallStep intent={{ ...intent, period }} onPickMonthly={onPickMonthly} />;
  }

  const payLabel = changing
    ? busy
      ? 'One moment…'
      : upgrading
        ? `Upgrade to ${planName(intent.plan)}`
        : `Switch to ${planName(intent.plan)}`
    : busy
    ? bachs
      ? 'Opening the payment page…'
      : effectiveMethod === 'card'
      ? 'Opening Paystack…'
      : 'Getting your account number…'
    : bachs || effectiveMethod === 'card'
      ? `Pay ${formatPrice(amount, currency)}`
      : 'Get my account number';
  const fineprint = changing
    ? upgrading && current
      ? `The days left on ${planName(current.plan)} come off the price.`
      : 'The change starts when your current period ends.'
    : bachs
      ? currency === 'USD'
        ? 'Prices are in US dollars. Each payment covers the time you pick, and we remind you before it ends.'
        : 'You see the amount in your own money on the next page. Each payment covers the time you pick, and we remind you before it ends.'
      : effectiveMethod === 'card'
      ? SELF_SERVE_COPY.cardFine
      : SELF_SERVE_COPY.transferFine;

  if (isDesktop) {
    // Choose a plan on a computer (#1229, mock docs/mocks/signin-onboarding-desktop,
    // screen 3). Every plan checkout sells is a row with its price in the
    // payer's currency, the picked plan's limits are three tiles, and the card
    // on the right pays. All figures are the ones `pay()` charges: the same
    // periodAmount, period and currency as the phone layout below.
    const listed: CheckoutPlan[] = CHECKOUT_PLANS.includes(intent.plan)
      ? [...CHECKOUT_PLANS]
      : [...CHECKOUT_PLANS, intent.plan];
    const showSteps = !current;
    const intervalChoice = !changing && showsIntervalChoice(periods);
    const cardLine = !cardAvailable
      ? 'Not available yet'
      : period === 'annual'
        ? 'Renews by itself every year'
        : period === 'semiannual'
          ? 'Renews by itself every 6 months'
          : 'Renews by itself every month';
    const radio = (checked: boolean) =>
      `grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${
        checked ? 'border-[5px] border-brand' : 'border-[1.5px] border-stroke-control'
      }`;
    const deskPrimary =
      'flex h-12 w-full items-center justify-center rounded-full bg-content-primary px-5 text-[14px] font-semibold text-bg-base transition-colors duration-fast hover:bg-content-primary/90 disabled:cursor-not-allowed disabled:bg-bg-hover disabled:text-content-secondary';
    return (
      <main className="min-h-screen">
        <header className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-6 px-10 pt-2">
          <Mark />
          {showSteps ? <SetupSteps current={2} /> : <span />}
          <p className="justify-self-end text-[13px] text-content-secondary">
            Paying as <span className="text-content-primary">{userEmail}</span> ·{' '}
            <button
              type="button"
              onClick={() => void signOut()}
              className="font-semibold text-brand underline underline-offset-[3px]"
            >
              Not you?
            </button>
          </p>
        </header>
        <div className="mx-auto max-w-[992px] px-8 pb-14 pt-4">
          {options.openInvoice && options.openInvoice.paidKobo > 0 ? (
            <div className="mb-6 rounded-xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm text-content-secondary">
              {partPaidCopy(
                Math.max(0, options.openInvoice.amountKobo - options.openInvoice.creditKobo - options.openInvoice.paidKobo),
                options.openInvoice.paidKobo
              ).title}{' '}
              Pick bank transfer to see your account number.
            </div>
          ) : null}
          <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section>
              <h1 className="font-display text-[34px] font-normal leading-[42px] text-content-primary">
                {current ? 'Change your plan' : 'Pick a plan'}
              </h1>
              <p className="mt-1.5 text-[15px] text-content-secondary">You can change it any time in Settings.</p>

              {intervalChoice ? (
                <div role="radiogroup" aria-label="How often" className="mt-5 inline-flex gap-0.5 rounded-full bg-bg-hover p-[3px]">
                  {periods.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={option === period}
                      onClick={() => setIntent((value) => ({ ...value, period: option }))}
                      className={`h-8 rounded-full px-4 text-[13px] font-semibold transition-colors ${
                        option === period
                          ? 'bg-bg-surface text-content-primary shadow-sm'
                          : 'text-content-secondary hover:text-content-primary'
                      }`}
                    >
                      {periodLabel(option)}
                      {periodSaving(option) ? (
                        <span className="ml-1.5 font-normal text-brand">{periodSaving(option)}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}

              <div role="radiogroup" aria-label="Plan" className="mt-5 grid gap-2.5">
                {listed.map((option) => {
                  const checked = option === intent.plan;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setIntent((value) => ({ ...value, plan: option }))}
                      className={`grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-[14px] bg-bg-surface text-left transition-colors ${
                        checked
                          ? 'border-2 border-brand px-[17px] py-[15px]'
                          : 'border border-stroke-control px-[18px] py-4 hover:bg-bg-hover'
                      }`}
                    >
                      <span aria-hidden="true" className={radio(checked)} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-semibold text-content-primary">
                          {planName(option)}
                          {current?.plan === option ? (
                            <span className="rounded-full bg-brand/10 px-2 text-xs font-semibold leading-5 text-brand">
                              Your plan
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-[13px] text-content-secondary">{planRowLine(option)}</span>
                      </span>
                      <span className="font-semibold text-content-primary">
                        {periodHeadline(option, period, introMonthsLeft, currency)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {saving ? <p className="mt-2.5 text-[13px] text-content-secondary">{saving}</p> : null}

              <dl className="mt-5 grid grid-cols-3 gap-2.5">
                {planTiles(intent.plan).map((tile) => (
                  <div key={tile.label} className="flex flex-col-reverse rounded-xl border border-stroke-default bg-bg-surface p-3.5">
                    <dt className="text-[13px] text-content-secondary">{tile.label}</dt>
                    <dd className="font-display text-[24px] leading-8 text-content-primary">{tile.value}</dd>
                  </div>
                ))}
              </dl>
              {options.distributionOn && PRICING_TIERS[intent.plan].includesDistribution ? (
                <p className="mt-2.5 text-[13px] text-content-secondary">
                  {distributionIncluded(intent.plan, period, DISTRIBUTION_REQUIRES_PREPAY)
                    ? 'Distribution through our partner is included.'
                    : 'Distribution through our partner comes with yearly plans.'}
                </p>
              ) : null}
            </section>

            <aside className="sticky top-4 rounded-[20px] border border-stroke-default bg-bg-surface p-6">
              {alreadyOnIt || changeNote ? (
                <div className="space-y-4">
                  <p className="text-content-primary">
                    {changeNote ?? `You're already on ${planName(intent.plan)}. It renews by itself.`}
                  </p>
                  <Link href="/dashboard" className={deskPrimary}>
                    Go to Home
                  </Link>
                </div>
              ) : changing && current ? (
                <div className="space-y-4">
                  <h2 className="font-semibold text-content-primary">Change plan</h2>
                  <p className="text-[14px] text-content-secondary">
                    {upgrading
                      ? `You're on ${planName(current.plan)}. Paystack shows the price for the days left in this period before you pay.`
                      : `You're on ${planName(current.plan)}. ${planName(intent.plan)} starts when this period ends.`}
                  </p>
                  {error ? (
                    <p role="alert" className="text-sm text-status-error">
                      {error}
                    </p>
                  ) : null}
                  <button type="button" onClick={() => void pay()} disabled={busy} className={deskPrimary}>
                    {payLabel}
                  </button>
                  <p className="text-center text-xs text-content-secondary">{fineprint}</p>
                </div>
              ) : (
                <>
                  {bachs ? (
                    <>
                      <h2 className="mb-3 font-semibold text-content-primary">Pay your way</h2>
                      <ul className="grid grid-cols-2 gap-2 text-[13px] text-content-primary" aria-label="Ways to pay">
                        {(currency === 'USD' ? BACHS_WAYS_TO_PAY_USD : BACHS_WAYS_TO_PAY).map((way) => (
                          <li key={way} className="rounded-xl border border-stroke-default px-3 py-2.5">
                            {way}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <>
                      <h2 id="checkout-pay-with" className="mb-1 font-semibold text-content-primary">
                        Pay with
                      </h2>
                      <div role="radiogroup" aria-labelledby="checkout-pay-with" className="grid gap-2">
                        {(
                          [
                            { id: 'card', title: 'Card', line: cardLine },
                            { id: 'transfer', title: 'Bank transfer', line: 'Pay into your own account number' },
                          ] as const
                        ).map((option) => {
                          const checked = effectiveMethod === option.id;
                          const disabled = option.id === 'card' && !cardAvailable;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              role="radio"
                              aria-checked={checked}
                              disabled={disabled}
                              onClick={() => pickMethod(option.id)}
                              className={`grid grid-cols-[20px_1fr] items-start gap-3 rounded-xl text-left transition-colors disabled:opacity-50 ${
                                checked
                                  ? 'border-2 border-brand px-[13px] py-[11px]'
                                  : 'border border-stroke-control px-3.5 py-3 hover:bg-bg-hover'
                              }`}
                            >
                              <span aria-hidden="true" className={`mt-0.5 ${radio(checked)}`} />
                              <span>
                                <span className="block font-semibold text-content-primary">{option.title}</span>
                                <span className="block text-[13px] text-content-secondary">{option.line}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {bachs ? null : codeOpen ? (
                    <div className="mt-4">
                      <label className="block text-[13px] font-semibold text-content-primary" htmlFor="checkout-code-desk">
                        Code
                      </label>
                      <div className="mt-1.5 flex gap-2">
                        <input
                          id="checkout-code-desk"
                          className="h-11 min-w-0 flex-1 rounded-xl border border-content-tertiary bg-bg-base px-3.5 text-[14px] uppercase text-content-primary focus:border-brand focus:outline-none"
                          value={codeInput}
                          onChange={(event) => {
                            setCodeInput(event.target.value);
                            setCodeApplied(null);
                          }}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={() => void applyCode(codeInput)}
                          className="h-11 shrink-0 rounded-xl border border-stroke-control px-4 text-[13px] font-semibold hover:bg-bg-hover"
                        >
                          {codeApplied ? 'Applied' : 'Apply'}
                        </button>
                      </div>
                      {codeApplied?.line ? (
                        <p className="mt-1.5 text-[13px] text-content-secondary">{codeApplied.line}</p>
                      ) : null}
                      {codeError ? (
                        <p role="alert" className="mt-1.5 text-[13px] text-status-error">
                          {codeError}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCodeOpen(true)}
                      className="mt-3 text-[13px] font-semibold text-brand underline-offset-[3px] hover:underline"
                    >
                      Have a code?
                    </button>
                  )}

                  <div className="mt-4 flex items-baseline justify-between border-t border-stroke-default pt-4">
                    <span className="text-content-secondary">{period === 'monthly' ? 'Total today' : 'Total'}</span>
                    <span className="font-display text-[28px] leading-9 text-content-primary">
                      {formatPrice(amount, currency)}
                    </span>
                  </div>
                  {error ? (
                    <p role="alert" className="mt-2 text-sm text-status-error">
                      {error}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void pay()}
                    disabled={busy || amount <= 0}
                    className={`mt-4 ${deskPrimary}`}
                  >
                    {payLabel}
                  </button>
                  <p className="mt-2.5 text-center text-xs text-content-secondary">{fineprint}</p>
                </>
              )}
            </aside>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 pb-40 pt-6 lg:px-10 lg:pb-16 lg:pt-10">
      <div className="mx-auto max-w-5xl">
        <Mark />
        {options.openInvoice && options.openInvoice.paidKobo > 0 ? (
          <div className="mt-6 rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm text-content-secondary">
            {partPaidCopy(
              Math.max(0, options.openInvoice.amountKobo - options.openInvoice.creditKobo - options.openInvoice.paidKobo),
              options.openInvoice.paidKobo
            ).title}{' '}
            Pick bank transfer to see your account number.
          </div>
        ) : null}
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <section className="space-y-6">
            <PlanChip
              plan={intent.plan}
              open={pickingPlan}
              setOpen={setPickingPlan}
              onChange={(plan) => setIntent((current) => ({ ...current, plan }))}
              introMonthsLeft={introMonthsLeft}
              currency={currency}
            />
            <div>
              <h1 className="font-display text-[34px] leading-tight text-content-primary lg:text-[44px]">
                {periodHeadline(intent.plan, period, introMonthsLeft, currency)}
              </h1>
              {saving ? <p className="mt-1.5 text-content-secondary">{saving}</p> : null}
            </div>
            <div
              role="radiogroup"
              aria-label="How often"
              className={`grid gap-2 ${periods.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
            >
              {periods.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={option === period}
                  onClick={() => setIntent((current) => ({ ...current, period: option }))}
                  className={`flex min-h-14 flex-col items-center justify-center rounded-2xl border px-2 py-2 text-sm font-semibold ${
                    option === period
                      ? 'border-brand bg-brand/10 text-content-primary'
                      : 'border-stroke-control text-content-secondary hover:bg-bg-hover'
                  }`}
                >
                  {periodLabel(option)}
                  <small className="mt-0.5 font-mono text-xs font-normal">
                    {formatPrice(periodAmount(intent.plan, option, introMonthsLeft, currency) ?? 0, currency)}
                  </small>
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-stroke-default bg-bg-surface px-5 py-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">You get</div>
              <dl className="mt-2 divide-y divide-stroke-subtle">
                {youGet(intent.plan, options.distributionOn, period).map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-2.5">
                    <dt className="text-content-secondary">{row.label}</dt>
                    <dd className="font-mono text-content-primary">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="space-y-5 lg:self-start lg:rounded-3xl lg:border lg:border-stroke-default lg:bg-bg-surface lg:p-6">
            {alreadyOnIt || changeNote ? (
              <div className="space-y-4">
                <p className="text-content-primary">
                  {changeNote ?? `You're already on ${planName(intent.plan)}. It renews by itself.`}
                </p>
                <Link href="/dashboard" className={primaryButton}>
                  Go to Home
                </Link>
              </div>
            ) : changing && current ? (
              <div className="space-y-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">Change plan</div>
                <p className="text-content-secondary">
                  {upgrading
                    ? `You're on ${planName(current.plan)}. Paystack shows the price for the days left in this period before you pay.`
                    : `You're on ${planName(current.plan)}. ${planName(intent.plan)} starts when this period ends.`}
                </p>
                {error ? (
                  <p role="alert" className="text-sm text-status-error">
                    {error}
                  </p>
                ) : null}
                <button type="button" onClick={() => void pay()} disabled={busy} className={primaryButton}>
                  {payLabel}
                </button>
                <p className="text-center text-xs text-content-secondary">{fineprint}</p>
              </div>
            ) : (
            <>
            {bachs ? (
              <>
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">Pay your way</div>
                <ul className="grid grid-cols-2 gap-2 text-sm text-content-primary" aria-label="Ways to pay">
                  {(currency === 'USD' ? BACHS_WAYS_TO_PAY_USD : BACHS_WAYS_TO_PAY).map((way) => (
                    <li key={way} className="rounded-2xl border border-stroke-default px-4 py-3">
                      {way}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
            <>
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">Pay with</div>
            <div role="radiogroup" aria-label="Pay with" className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'card', title: 'Card', line: cardAvailable ? 'Renews by itself' : 'Not available yet' },
                  { id: 'transfer', title: 'Bank transfer', line: 'Your own account number' },
                ] as const
              ).map((option) => {
                const checked = effectiveMethod === option.id;
                const disabled = option.id === 'card' && !cardAvailable;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    disabled={disabled}
                    onClick={() => pickMethod(option.id)}
                    className={`flex min-h-16 items-start gap-3 rounded-2xl border px-4 py-3 text-left disabled:opacity-50 ${
                      checked ? 'border-brand bg-brand/10' : 'border-stroke-control hover:bg-bg-hover'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${checked ? 'border-brand bg-brand' : 'border-stroke-control'}`}
                    />
                    <span>
                      <b className="block text-content-primary">{option.title}</b>
                      <span className="text-sm text-content-secondary">{option.line}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            </>
            )}

            {bachs ? null : codeOpen ? (
              <div>
                <label className="block text-sm text-content-secondary" htmlFor="checkout-code">
                  Code
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="checkout-code"
                    className={`${fieldClass} mt-0 uppercase`}
                    value={codeInput}
                    onChange={(event) => {
                      setCodeInput(event.target.value);
                      setCodeApplied(null);
                    }}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => void applyCode(codeInput)}
                    className="min-h-12 shrink-0 rounded-xl border border-stroke-control px-4 text-sm font-semibold"
                  >
                    {codeApplied ? 'Applied' : 'Apply'}
                  </button>
                </div>
                {codeApplied?.line ? <p className="mt-1.5 text-sm text-content-secondary">{codeApplied.line}</p> : null}
                {codeError ? (
                  <p role="alert" className="mt-1.5 text-sm text-status-error">
                    {codeError}
                  </p>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCodeOpen(true)}
                className="min-h-11 text-sm text-content-secondary underline underline-offset-4"
              >
                Have a code?
              </button>
            )}

            <hr className="border-stroke-default" />
            <div className="flex items-center justify-between">
              <span className="font-semibold text-content-primary">{period === 'monthly' ? 'Total today' : 'Total'}</span>
              <span className="font-display text-[22px] text-content-primary">{formatPrice(amount, currency)}</span>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-status-error">
                {error}
              </p>
            ) : null}
            <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stroke-default bg-bg-base px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 lg:static lg:border-0 lg:bg-transparent lg:p-0">
              <button type="button" onClick={() => void pay()} disabled={busy || amount <= 0} className={primaryButton}>
                {payLabel}
              </button>
              <p className="mt-2 text-center text-xs text-content-secondary">{fineprint}</p>
            </div>
            </>
            )}
          </section>
        </div>
        <p className="mt-10 text-center text-sm text-content-tertiary">
          Paying as {userEmail}.{' '}
          <button type="button" onClick={() => void signOut()} className="min-h-11 underline underline-offset-4">
            Not you?
          </button>
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- transfer waiting

function CopyButton({ value, label, onCopied }: { value: string; label: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          onCopied?.();
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="min-h-11 shrink-0 rounded-full border border-stroke-control px-3 text-sm font-semibold text-content-primary hover:bg-bg-hover"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function TransferWaiting({
  invoice: initial,
  account,
  userId,
  onPaid,
}: {
  invoice: TransferInvoice;
  account: TransferAccount;
  userId: string;
  onPaid: () => void;
}) {
  const [invoice, setInvoice] = useState(initial);
  const [copiedMain, setCopiedMain] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const token = await accessToken();
        if (token) {
          const response = await fetch(`/api/billing/transfer?invoiceId=${encodeURIComponent(initial.id)}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          if (response.ok) {
            const payload = (await response.json()) as { invoice?: TransferInvoice };
            if (!cancelled && payload.invoice) {
              setInvoice(payload.invoice);
              if (payload.invoice.status === 'paid') {
                onPaid();
                return;
              }
            }
          }
        }
      } catch {
        // Keep waiting; the next poll tries again.
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), POLL_MS);
    };
    timer = window.setTimeout(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [initial.id, onPaid]);

  const remaining = invoice.remainingKobo / 100;
  const partPaid = invoice.paidKobo > 0 && invoice.remainingKobo > 0;
  const copy = partPaid ? partPaidCopy(invoice.remainingKobo, invoice.paidKobo) : null;
  const due = Math.max(1, invoice.amountKobo - invoice.creditKobo);
  const copied = () => track('dva_copied', { plan: invoice.plan, period: invoice.period, method: 'transfer' }, userId);

  return (
    <main className="flex min-h-screen justify-center px-6 py-10">
      <div className="w-full max-w-md space-y-5">
        <Mark />
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
          {planName(invoice.plan)} · {periodLabel(invoice.period)}
        </div>
        <h1 className="font-display text-2xl text-content-primary">
          {copy ? copy.title : `Send ${formatNaira(remaining)} to your Urganize account.`}
        </h1>
        {copy ? <p className="text-content-secondary">{copy.body}</p> : null}
        {partPaid ? (
          <div className="rounded-2xl border border-stroke-default bg-bg-surface p-4">
            <div className="h-1.5 rounded-full bg-stroke-strong">
              <div
                className="h-1.5 rounded-full bg-brand"
                style={{ width: `${Math.min(100, Math.round((invoice.paidKobo / due) * 100))}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-content-secondary">
              {formatNaira(invoice.paidKobo / 100)} of {formatNaira(due / 100)}
            </p>
          </div>
        ) : null}
        <div className="divide-y divide-stroke-subtle rounded-2xl border border-stroke-default bg-bg-surface px-4">
          <div className="flex items-center justify-between py-3.5">
            <span className="text-content-secondary">Bank</span>
            <span className="font-semibold text-content-primary">{account.bankName}</span>
          </div>
          <div className="flex items-center justify-between gap-3 py-3.5">
            <div>
              <div className="text-sm text-content-secondary">Account number</div>
              <div className="font-mono text-2xl tracking-wide text-content-primary">
                {spacedAccountNumber(account.accountNumber)}
              </div>
            </div>
            <CopyButton value={account.accountNumber} label="Copy account number" onCopied={copied} />
          </div>
          <div className="flex items-center justify-between gap-3 py-3.5">
            <span className="text-content-secondary">Account name</span>
            <span className="text-right font-semibold text-content-primary">{account.accountName}</span>
          </div>
          <div className="flex items-center justify-between gap-3 py-3.5">
            <span className="text-content-secondary">{partPaid ? 'Still to pay' : 'Amount'}</span>
            <span className="flex items-center gap-3">
              <b className="font-display text-xl font-normal text-content-primary">{formatNaira(remaining)}</b>
              {partPaid ? null : <CopyButton value={String(Math.round(remaining))} label="Copy amount" />}
            </span>
          </div>
        </div>
        {partPaid ? null : (
          <>
            <div role="status" aria-live="polite" className="flex items-center gap-3 text-content-secondary">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-stroke-control border-t-brand motion-reduce:animate-none" aria-hidden="true" />
              {SELF_SERVE_COPY.transferWaiting}
            </div>
            <p className="text-sm text-content-secondary">{SELF_SERVE_COPY.transferKeep}</p>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(account.accountNumber).then(() => {
              setCopiedMain(true);
              copied();
            });
          }}
          className={primaryButton}
        >
          {copiedMain ? 'Copied' : 'Copy account number'}
        </button>
        {partPaid ? null : <p className="text-center text-sm text-content-tertiary">{SELF_SERVE_COPY.transferWrong}</p>}
      </div>
    </main>
  );
}
