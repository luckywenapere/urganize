'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useEntitlementsStore } from '@/stores/useEntitlementsStore';
import { HOME_PATH } from '@/lib/home-path';
import { isBillingPlanId, getPlan } from '@urganize/pricing';
import { Loader2 } from 'lucide-react';
import { LoadingScreen } from '@urganize/ui';

// Paystack post-checkout landing.
//
// User lands here after Paystack's hosted checkout via the callback_url
// we pass in start-checkout. We poll /api/payments/verify until either:
//   - status='success' (webhook fired and credited) → push to /dashboard
//   - status='pending' for too long → show "Hang on, we're still finalizing"
//   - status='failed' / row missing → show the failure state with a retry
//
// The webhook is the authoritative path. This page just confirms that
// the credit completed before we let the user back into the app.

type PaymentStatus = 'verifying' | 'success' | 'failed';

type VerifyResponse = {
  status?: string;
  plan?: string | null;
  reference?: string;
  error?: string;
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
          await checkAuth();
          // URG-178: paid-tier flags flip live on the server the moment the
          // webhook credits the account, but the client-side entitlements
          // store only fetched once at session start — refetch now so the
          // upgrade unlocks nav/upsells without a full page reload.
          void useEntitlementsStore.getState().load();
          return;
        }

        if (Date.now() - start >= POLL_TIMEOUT_MS) {
          // We timed out waiting for the webhook. Tell the user — they can
          // refresh, and the gate will reflect reality once the webhook
          // eventually lands. Not a hard failure (their money has likely
          // been charged); just a UI wait that overran.
          setStatus('failed');
          setResult({
            error:
              "We're still finalizing your payment. Refresh in a moment — your access will unlock as soon as Paystack confirms.",
          });
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

  const planLabel = isBillingPlanId(result.plan) ? getPlan(result.plan).label : null;

  return (
    <div className="w-full max-w-md rounded-3xl border border-stroke-subtle bg-bg-surface/95 p-6 shadow-[0_12px_32px_rgb(var(--shadow-ink)/calc(0.18*var(--shadow-alpha-scale)))] backdrop-blur-sm">
      {status === 'verifying' && (
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-content-tertiary" aria-hidden="true" />
          <p className="text-sm text-content-secondary">Verifying payment</p>
          <p className="text-xs text-content-tertiary">Confirming with Paystack — this usually takes a few seconds.</p>
        </div>
      )}

      {status === 'success' && (
        <div className="text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted text-2xl text-brand">
            ✓
          </div>
          <p className="text-xl font-semibold text-content-primary">Subscription active</p>
          {planLabel ? (
            <p className="mt-2 text-sm text-content-secondary">
              Plan: <span className="font-semibold text-content-primary">{planLabel}</span>
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => router.push(HOME_PATH)}
              className="min-h-11 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              Open dashboard
            </button>
            <button
              type="button"
              onClick={() => router.push('/settings')}
              className="min-h-11 rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover"
            >
              Billing
            </button>
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div className="text-center">
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
              onClick={() => router.push('/locked')}
              className="min-h-11 rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover"
            >
              Back to plans
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[720px] items-center justify-center px-6 py-12">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-60 w-60 rounded-full bg-status-info/12 blur-3xl" />
        <Suspense
          fallback={
            <div className="w-full">
              <LoadingScreen
                variant="shell"
                eyebrow="Billing"
                title="Checking payment status"
                description="Confirming your payment and updating access."
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
