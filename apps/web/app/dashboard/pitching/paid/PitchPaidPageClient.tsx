'use client';

// Back from Paystack. Confirms the payment and says, in one line, what happens
// next: the pitch is with the curators, or the payment did not go through and
// the pitch is saved to try again.
//
// The page asks the server, which asks Paystack. Nothing here trusts the
// query string beyond using it as a reference to look up, and the webhook
// settles the payment whether or not this page ever loads.
//
// NEVER useSearchParams: that would put this page behind a Suspense boundary
// and ship loading.tsx as its server HTML. The reference is read once, in an
// effect, the way the Pitching page reads its own param.
//
// Not behind the feature flag, like the verify route it calls: it only ever
// confirms money that was already paid.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CHECKING_PAYMENT,
  PAID_ELSEWHERE,
  PAYMENT_FAILED,
  PAYMENT_IN_REVIEW,
  PITCH_SENT,
} from '@/lib/pitch-payment-copy';
import { formatNaira } from '@/lib/pitch-payments';
import { verifyPitchPayment, type PitchPaymentState } from '@/lib/pitch-payments-client';
import type { PitchQuote } from '@/types/pitch-payments';

type ViewState = 'checking' | PitchPaymentState | 'signed_out';

const MAX_TRIES = 5;
const RETRY_MS = 2500;

function readReference(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get('reference') || params.get('trxref') || '').trim();
  } catch {
    return '';
  }
}

export default function PitchPaidPageClient() {
  const [state, setState] = useState<ViewState>('checking');
  const [quote, setQuote] = useState<PitchQuote | null>(null);
  useEffect(() => {
    let cancelled = false;
    const attempt = async (reference: string, tries: number): Promise<void> => {
      const result = await verifyPitchPayment(reference);
      if (cancelled) return;
      if (!result.ok) {
        // Paid in a browser that is not signed in, most often the phone's
        // own browser after the app opened Paystack there.
        setState(result.status === 401 ? 'signed_out' : 'error');
        return;
      }
      setQuote(result.data.quote);
      if (result.data.state === 'pending' && tries + 1 < MAX_TRIES) {
        setTimeout(() => void attempt(reference, tries + 1), RETRY_MS);
        return;
      }
      setState(result.data.state);
    };

    // Read after the first paint, never during render: the server has no URL
    // to read, and the first client render has to match what it sent.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const reference = readReference();
      if (!reference) {
        setState('not_paid');
        return;
      }
      void attempt(reference, 0);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const message =
    state === 'checking'
      ? CHECKING_PAYMENT
      : state === 'paid'
        ? PITCH_SENT
        : state === 'not_paid'
          ? PAYMENT_FAILED
          : state === 'needs_review'
            ? PAYMENT_IN_REVIEW
            : PAID_ELSEWHERE;

  const tone =
    state === 'paid'
      ? 'border-brand/30 bg-brand/10 text-content-primary'
      : state === 'not_paid'
        ? 'border-status-warning/30 bg-status-warning/10 text-status-warning'
        : 'border-stroke-default bg-bg-surface text-content-secondary';

  return (
    <div className="mx-auto w-full max-w-xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">Pitching</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">Your pitch payment</h1>

      <p role="status" className={`mt-6 rounded-xl border p-4 text-sm ${tone}`}>
        {message}
      </p>

      {state === 'paid' && quote ? (
        <ul className="mt-4 divide-y divide-stroke-subtle rounded-xl border border-stroke-default bg-bg-surface">
          {quote.lines.map((line) => (
            <li key={line.pitchId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 truncate text-content-primary">
                {line.curatorName} · {line.playlistName}
              </span>
              <span className="shrink-0 font-mono text-content-secondary">{formatNaira(line.priceKobo)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {state === 'signed_out' ? (
          <Link
            href="/auth?next=%2Fdashboard%2Fpitching"
            className="inline-flex h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
          >
            Sign in
          </Link>
        ) : (
          <Link
            href="/dashboard/pitching"
            className="inline-flex h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
          >
            Back to pitching
          </Link>
        )}
      </div>
    </div>
  );
}
