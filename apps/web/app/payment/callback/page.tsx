'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { settingsDeepLink } from '@/lib/settings-nav';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH } from '@/lib/home-path';
import { supabase } from '@/lib/supabase/client';
import { describePlanName, formatBillingDate } from '@/lib/billing-summary';
import {
  TRIAL_CARD_PLAN,
  TRIAL_DAYS,
  describeTrialCardFailure,
  type TrialCardFailureKind,
} from '@/lib/trial-card';
import { LoadingMark, LoadingScreen } from '@urganize/ui';

// Paystack post-checkout landing.
//
// User lands here after Paystack's hosted checkout via the callback_url
// we pass in start-checkout. We poll /api/payments/verify until either:
//   - status='success' (webhook fired and credited) → push to /dashboard
//   - status='failed' (terminal — today only the card-trial webhook branch
//     writes it, e.g. a non-reusable card) → failure state immediately
//   - status='pending' for too long → show "Hang on, we're still finalizing"
//   - row missing → show the failure state with a retry
//
// The webhook is the authoritative path. This page just confirms that
// the credit completed before we let the user back into the app.
//
// Card-before-trial: the same page also lands the ₦100 card-verification
// charge (payments.plan === TRIAL_CARD_PLAN). Same polling, different copy —
// "trial started" instead of "subscription active", and the failure state
// points back at /start-trial instead of the plans page.

// 'pending' is its own state, not a flavour of 'failed': we stopped WAITING, we
// did not learn that anything went wrong. The money has likely been charged and
// the webhook is just slow, so the screen must not tell a paying customer their
// payment failed.
type PaymentStatus = 'verifying' | 'success' | 'failed' | 'pending';

type VerifyResponse = {
  status?: string;
  plan?: string | null;
  reference?: string;
  error?: string;
  /** Card-trial failures only: which side the failure was on. Absent for
   *  every other outcome, and 'setup' is the honest default for an absent or
   *  unrecognised value — see classifyTrialCardFailure. */
  failureKind?: TrialCardFailureKind;
};

const POLL_INTERVAL_MS = 1_500;
const POLL_TIMEOUT_MS = 30_000;

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reference = searchParams.get('reference');
  const { checkAuth } = useAuthStore();

  const [status, setStatus] = useState<PaymentStatus>('verifying');
  const [result, setResult] = useState<VerifyResponse>({});
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setStatus('failed');
      setResult({ error: 'Missing payment reference. Please retry from the locked page.' });
      return;
    }

    let cancelled = false;
    const start = Date.now();

    const poll = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`, {
          cache: 'no-store',
        });
        const payload = (await res.json().catch(() => ({}))) as VerifyResponse;

        if (cancelled) return;

        if (res.ok && payload.status === 'success') {
          setStatus('success');
          setResult(payload);
          await checkAuth({ force: true });
          if (payload.plan === TRIAL_CARD_PLAN) {
            // Render the "first charge on <date>" line from the authoritative
            // trial end. Best-effort: without it the line just doesn't show.
            try {
              const { data: sessionData } = await supabase.auth.getSession();
              const token = sessionData.session?.access_token;
              if (token) {
                const statusRes = await fetch('/api/subscription-status', {
                  headers: { Authorization: `Bearer ${token}` },
                  cache: 'no-store',
                });
                const statusPayload = (await statusRes.json().catch(() => ({}))) as {
                  trialEndsAt?: string | null;
                };
                if (!cancelled && statusRes.ok && typeof statusPayload.trialEndsAt === 'string') {
                  setTrialEndsAt(statusPayload.trialEndsAt);
                }
              }
            } catch {
              // Non-fatal — the trial is live either way.
            }
          }
          return;
        }

        if (res.ok && payload.status === 'failed') {
          // Terminal: today only the card-trial webhook branch writes
          // 'failed', so this is a no-op for the ordinary subscription flow.
          //
          // The copy is chosen by WHY it failed, not by the fact that it did.
          // Only one of the webhook's three reasons is about the customer's
          // card; the others are a missing or stale Paystack plan code on our
          // side, and "try a different card" for those is advice that cannot
          // work however many cards they own. verify hands us the coarse
          // classification — see classifyTrialCardFailure.
          setStatus('failed');
          setResult({
            ...payload,
            error:
              payload.plan === TRIAL_CARD_PLAN
                ? describeTrialCardFailure(payload.failureKind ?? 'setup')
                : 'The payment did not complete. Try again from the plans page.',
          });
          return;
        }

        if (Date.now() - start >= POLL_TIMEOUT_MS) {
          // We timed out waiting for the webhook. Not a failure (their money
          // has likely been charged); just a UI wait that overran. The gate
          // reflects reality once the webhook eventually lands.
          setStatus('pending');
          return;
        }

        setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        setStatus('failed');
        setResult({ error: 'Could not verify payment. Check your network and try again.' });
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [checkAuth, reference]);

  const isTrialCard = result.plan === TRIAL_CARD_PLAN;
  // Shared with Settings rather than re-deriving here: that helper knows the
  // pricing-v2 tier ids as well as the legacy ones, so a Manager or Label
  // customer sees what they just bought instead of a blank line. 'trial_card'
  // is not a plan id in either generation, so the plan line naturally stays
  // hidden for the trial variant.
  const planLabel = describePlanName(result.plan ?? null);
  const trialEndCopy = trialEndsAt ? formatBillingDate(trialEndsAt) : null;

  return (
    <div className="w-full max-w-md rounded-3xl border border-stroke-subtle bg-bg-surface/95 p-6 shadow-[0_12px_32px_rgb(var(--shadow-ink)/calc(0.18*var(--shadow-alpha-scale)))] backdrop-blur-sm">
      {status === 'verifying' && (
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 text-center">
          <LoadingMark />
          <p className="text-sm text-content-secondary">Verifying payment</p>
        </div>
      )}

      {status === 'success' && (
        <div role="status" className="text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted text-2xl text-brand">
            ✓
          </div>
          <p className="text-xl font-semibold text-content-primary">
            {isTrialCard ? `Your ${TRIAL_DAYS}-day free trial has started` : 'Subscription active'}
          </p>
          {isTrialCard ? (
            <p className="mt-2 text-sm text-content-secondary">
              Your card is saved and the ₦100 check is being refunded.
              {trialEndCopy
                ? ` First charge on ${trialEndCopy} unless you cancel.`
                : ' You won’t be charged until your trial ends.'}
            </p>
          ) : null}
          {planLabel ? (
            <p className="mt-2 text-sm text-content-secondary">
              Plan: <span className="font-semibold text-content-primary">{planLabel}</span>
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => router.replace(HOME_PATH)}
              className="min-h-11 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              Open dashboard
            </button>
            <button
              type="button"
              onClick={() => router.replace(settingsDeepLink({ segment: 'billing' }))}
              className="min-h-11 rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover"
            >
              Billing
            </button>
          </div>
        </div>
      )}

      {status === 'pending' && (
        <div role="status" className="text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-bg-elevated text-2xl text-content-secondary">
            …
          </div>
          <p className="text-xl font-semibold text-content-primary">Still confirming your payment</p>
          <p className="mt-2 text-sm text-content-secondary">
            This can take a minute. Your access unlocks as soon as Paystack confirms.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              Check again
            </button>
            <button
              type="button"
              onClick={() => router.replace(HOME_PATH)}
              className="min-h-11 rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover"
            >
              Open dashboard
            </button>
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div role="alert" className="text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-status-error/20 text-2xl text-status-error">
            !
          </div>
          <p className="text-xl font-semibold text-content-primary">Couldn&apos;t confirm payment</p>
          <p className="mt-2 text-sm text-content-secondary">
            {result.error || 'Your transaction could not be confirmed at the moment.'}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => router.push(isTrialCard ? '/start-trial' : '/locked')}
              className="min-h-11 rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover"
            >
              {isTrialCard ? 'Back to trial setup' : 'Back to plans'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <main className="min-h-screen text-content-primary">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[720px] items-center justify-center px-6 py-12">
        {/* Gold-thread ray fan (NEXT_PUBLIC_FEATURE_TEXTILE). Replaces the
            blurred brand blobs below, which the same flag hides. Inert off. */}
        <div className="urg-ground-sunburst" aria-hidden="true" />
        <div className="urg-blob pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/15 blur-3xl" />
        <div className="urg-blob pointer-events-none absolute -left-20 bottom-0 h-60 w-60 rounded-full bg-status-info/12 blur-3xl" />
        <Suspense
          fallback={
            <div className="w-full">
              <LoadingScreen
                variant="shell"
                eyebrow="Billing"
                title="Checking payment status"
                asPage={false}
              />
            </div>
          }
        >
          <PaymentCallbackContent />
        </Suspense>
      </div>
    </main>
  );
}
