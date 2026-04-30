'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { formatCurrencyAmount } from '@/lib/pricing';
import { LoadingScreen } from '@urganize/ui';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

type PaymentStatus = 'verifying' | 'success' | 'failed';

type VerificationResult = {
  status?: string;
  plan?: string;
  amount?: number;
  trialing?: boolean;
  trial_days?: number;
  trial_ends_at?: string;
  message?: string;
  error?: string;
  payment_mode?: string;
};

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reference = searchParams.get('reference');
  const { checkAuth } = useAuthStore();

  const [status, setStatus] = useState<PaymentStatus>('verifying');
  const [result, setResult] = useState<VerificationResult>({});

  useEffect(() => {
    if (!reference) {
      setStatus('failed');
      setResult({ error: 'Missing payment reference. Please try again from Billing.' });
      return;
    }

    const controller = new AbortController();
    const verifyPayment = async () => {
      try {
        const res = await fetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const payload = (await res.json()) as VerificationResult;

        if (!res.ok || payload.status !== 'success') {
          setStatus('failed');
          setResult(payload);
          return;
        }

        setStatus('success');
        setResult(payload);
        await checkAuth();
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        setStatus('failed');
        setResult({ error: 'Could not verify payment. Check your network and try again.' });
      }
    };

    verifyPayment();
    return () => {
      controller.abort();
    };
  }, [checkAuth, reference]);

  return (
    <div className="w-full max-w-md rounded-3xl border border-stroke-subtle bg-bg-surface/95 p-6 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-sm">
      {status === 'verifying' && (
        <div aria-live="polite" className="text-center">
          <div className="mx-auto mb-4 flex max-w-[220px] flex-col items-center gap-3">
            <SkeletonBlock className="h-3 w-24 rounded-full" />
            <SkeletonBlock className="h-9 w-40 rounded-[16px]" />
          </div>
          <p className="text-lg font-semibold text-content-primary">Verifying payment...</p>
          <p className="mt-2 text-sm text-content-secondary">Please wait while we confirm your transaction.</p>
        </div>
      )}

      {status === 'success' && (
        <div className="text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted text-2xl text-brand">
            ✓
          </div>
          <p className="text-xl font-semibold text-content-primary">Payment confirmed</p>
          {typeof result.amount === 'number' && (
            <p className="mt-2 text-sm text-content-secondary">Amount: {formatCurrencyAmount(result.amount, 'NGN')}</p>
          )}
          {result.plan && <p className="text-sm text-content-secondary">Plan: {String(result.plan).replace('_', ' ')}</p>}
          {result.trialing && (
            <p className="mt-2 text-sm text-content-secondary">
              3-day trial active until{' '}
              <span className="font-semibold text-content-primary">
                {result.trial_ends_at ? new Date(result.trial_ends_at).toLocaleDateString() : 'your renewal date'}
              </span>
              .
            </p>
          )}
          {result.trialing && (
            <p className="mt-1 text-xs text-content-tertiary">
              Your annual plan will auto-renew after the trial unless canceled beforehand.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
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
          <p className="text-xl font-semibold text-content-primary">Couldn&apos;t verify payment</p>
          <p className="mt-2 text-sm text-content-secondary">
            {result.error || result.message || 'Your transaction could not be confirmed at the moment.'}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              Retry
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

