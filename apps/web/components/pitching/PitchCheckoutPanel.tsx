'use client';

// The checkout for a paid pitch: who the song goes to, what each curator
// charges, the total, and the Pay button.
//
// THE DISCLOSURE IS ALWAYS VISIBLE, directly above the button, never folded
// away or shortened on a phone. It is the line that keeps paid pitching clear
// of the streaming services' rules against paying for a playlist spot, and its
// wording is pinned by lib/pitch-payment-copy.test.ts.
//
// Every number here came from the server. This panel only ever shows a quote
// and asks for it to be paid; it never works out a price itself.

import { useState } from 'react';
import { ARTIST_PITCH_TERMS_VERSION, formatNaira } from '@/lib/pitch-payments';
import {
  BY_PAYING_YOU_AGREE,
  CHECKOUT_DISCLOSURE,
  PAY_ON_THE_WEB,
  PLAYLIST_SPOT_HELP_BODY,
  PLAYLIST_SPOT_HELP_TITLE,
  QUOTE_EXPIRED,
  checkoutTitle,
  payButton,
} from '@/lib/pitch-payment-copy';
import { ARTIST_PITCH_TERMS } from '@/lib/pitch-payment-terms';
import { canPayForPitchesHere, openPaystackCheckout, startPitchCheckout } from '@/lib/pitch-payments-client';
import type { PitchQuote } from '@/types/pitch-payments';
import { PitchTerms } from './PitchTerms';

type PitchCheckoutPanelProps = {
  quote: PitchQuote;
  songTitle: string;
  onCancel: () => void;
};

export function PitchCheckoutPanel({ quote: initialQuote, songTitle, onCancel }: PitchCheckoutPanelProps) {
  const [quote, setQuote] = useState<PitchQuote>(initialQuote);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const canPay = canPayForPitchesHere();

  const handlePay = async () => {
    setError('');
    setNotice('');
    setIsPaying(true);
    try {
      const result = await startPitchCheckout(quote.id, ARTIST_PITCH_TERMS_VERSION);
      if (!result.ok) {
        const repriced = result.body?.quote as PitchQuote | undefined;
        if (result.code === 'QUOTE_EXPIRED' && repriced) {
          // The artist sees the new total before paying it. Nothing is charged.
          setQuote(repriced);
          setNotice(QUOTE_EXPIRED);
          return;
        }
        setError(result.error);
        return;
      }
      await openPaystackCheckout(result.data.authorizationUrl);
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <section
      aria-label="Pay for your pitch"
      className="space-y-4 rounded-xl border border-brand/30 bg-bg-surface p-4"
    >
      <h3 className="font-display text-lg font-semibold text-content-primary">
        {checkoutTitle(songTitle, quote.lines.length)}
      </h3>

      {notice ? (
        <p role="status" className="rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          {notice}
        </p>
      ) : null}

      <ul className="divide-y divide-stroke-subtle rounded-xl border border-stroke-default">
        {quote.lines.map((line) => (
          <li key={line.pitchId} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="line-clamp-2 break-words text-sm font-semibold text-content-primary">{line.curatorName}</p>
              <p className="line-clamp-2 break-words text-xs text-content-secondary">{line.playlistName}</p>
            </div>
            <span className="shrink-0 font-mono text-sm text-content-primary">{formatNaira(line.priceKobo)}</span>
          </li>
        ))}
      </ul>

      <p className="text-sm font-semibold text-content-primary">{CHECKOUT_DISCLOSURE}</p>

      <details className="rounded-xl border border-stroke-default bg-bg-base px-3 py-2">
        <summary className="cursor-pointer select-none text-sm font-semibold text-content-primary marker:text-content-tertiary">
          {PLAYLIST_SPOT_HELP_TITLE}
        </summary>
        <p className="mt-2 pb-1 text-sm text-content-secondary">{PLAYLIST_SPOT_HELP_BODY}</p>
      </details>

      <PitchTerms terms={ARTIST_PITCH_TERMS} />

      {error ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {canPay ? (
        <div className="space-y-2">
          <p className="text-xs text-content-tertiary">{BY_PAYING_YOU_AGREE}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handlePay()}
              disabled={isPaying}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {isPaying ? 'Opening Paystack…' : payButton(quote.totalKobo)}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isPaying}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-stroke-default px-4 text-sm font-semibold text-content-secondary transition-colors hover:border-stroke-strong disabled:opacity-50"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-content-secondary">{PAY_ON_THE_WEB}</p>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-stroke-default px-4 text-sm font-semibold text-content-secondary"
          >
            Back
          </button>
        </div>
      )}
    </section>
  );
}
