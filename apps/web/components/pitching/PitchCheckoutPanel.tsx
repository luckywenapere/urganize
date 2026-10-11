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
import { CuratorFace } from './CuratorFace';

type PitchCheckoutPanelProps = {
  quote: PitchQuote;
  songTitle: string;
  onCancel: () => void;
  /** Curator photos by name, when the caller has them, so the checkout shows
   *  the people being paid rather than a list of names. */
  faces?: Record<string, string | null>;
};

export function PitchCheckoutPanel({ quote: initialQuote, songTitle, onCancel, faces = {} }: PitchCheckoutPanelProps) {
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

  // Restyled 2026-10-11 (founder brief: faces first, much less to read). Every
  // sentence is still the spec's own copy; CHECKOUT_DISCLOSURE in particular is
  // pinned by its test and is shown in full, never folded away.
  return (
    <section
      aria-label="Pay for your pitch"
      className="animate-enter space-y-5 rounded-2xl border border-stroke-default bg-bg-surface p-5 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className="flex -space-x-3">
          {quote.lines.slice(0, 4).map((line) => (
            <span key={line.pitchId} className="rounded-full ring-2 ring-bg-surface">
              <CuratorFace name={line.curatorName} photoUrl={faces[line.curatorName]} size={44} />
            </span>
          ))}
        </div>
        <h3 className="min-w-0 font-display text-lg font-semibold leading-tight text-content-primary">
          {checkoutTitle(songTitle, quote.lines.length)}
        </h3>
      </div>

      {notice ? (
        <p role="status" className="rounded-xl bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          {notice}
        </p>
      ) : null}

      <ul className="space-y-2">
        {quote.lines.map((line) => (
          <li key={line.pitchId} className="flex items-center gap-3">
            <CuratorFace name={line.curatorName} photoUrl={faces[line.curatorName]} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-content-primary">{line.curatorName}</p>
              <p className="truncate text-xs text-content-secondary">{line.playlistName}</p>
            </div>
            <span className="shrink-0 font-mono text-sm text-content-primary">{formatNaira(line.priceKobo)}</span>
          </li>
        ))}
      </ul>

      <p className="rounded-xl bg-bg-elevated px-3 py-2.5 text-sm font-medium text-content-primary">
        {CHECKOUT_DISCLOSURE}
      </p>

      <details className="group text-sm">
        <summary className="cursor-pointer select-none font-semibold text-content-secondary marker:text-content-tertiary hover:text-content-primary">
          {PLAYLIST_SPOT_HELP_TITLE}
        </summary>
        <p className="mt-2 text-content-secondary">{PLAYLIST_SPOT_HELP_BODY}</p>
      </details>

      <PitchTerms terms={ARTIST_PITCH_TERMS} />

      {error ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {canPay ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void handlePay()}
            disabled={isPaying}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {isPaying ? 'Opening Paystack…' : payButton(quote.totalKobo)}
          </button>
          <p className="text-center text-xs text-content-tertiary">{BY_PAYING_YOU_AGREE}</p>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPaying}
            className="block w-full py-2 text-center text-sm font-semibold text-content-secondary hover:text-content-primary disabled:opacity-50"
          >
            Back
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-content-secondary">{PAY_ON_THE_WEB}</p>
          <button
            type="button"
            onClick={onCancel}
            className="block w-full py-2 text-center text-sm font-semibold text-content-secondary hover:text-content-primary"
          >
            Back
          </button>
        </div>
      )}
    </section>
  );
}
