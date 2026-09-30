'use client';

// One sent pitch, with the curator's answer on it.
//
// Extracted from PitchScene 2026-09-09 so the team-wide Pitching page renders
// the same row: a pitch has to look identical whether it is read inside its
// release or in a list spanning all of them.
//
// Curator pitch payments (2026-09-25) added two states a pitch can be in
// without any curator having it: 'awaiting_payment', saved but not paid for,
// which offers Pay now and Remove; and 'expired', a paid pitch whose curator
// missed the window, which says the artist was refunded. A paid pitch still
// waiting shows when the reply is due, and a paid Added reads "Accepted",
// never a promise of a playlist spot.

import { useState } from 'react';
import type { PitchState, SentPitch } from '@/types/pitching';
import { pitchStateLabel } from '@/lib/pitching';
import { formatRelativeTime } from '@/lib/relative-time';
import {
  PAY_NOW,
  REMOVE_UNPAID,
  autoRefundLine,
  formatPitchDeadline,
  replyDueLine,
} from '@/lib/pitch-payment-copy';
import { removeUnpaidPitch, requestPitchQuote } from '@/lib/pitch-payments-client';
import { isPitchPaymentsEnabled } from '@/lib/pitch-payments';
import type { PitchQuote } from '@/types/pitch-payments';
import { PitchCheckoutPanel } from './PitchCheckoutPanel';

// Read once: a NEXT_PUBLIC_ flag is inlined at build time, so it cannot change
// under a mounted row.
const PAYMENTS_ON = isPitchPaymentsEnabled();

const statusPillClass = (status: PitchState): string => {
  const base =
    'inline-flex h-6 shrink-0 items-center rounded-full px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]';
  if (status === 'added') return `${base} bg-brand/15 text-brand`;
  if (status === 'passed') return `${base} bg-bg-elevated text-content-secondary`;
  if (status === 'listened') return `${base} bg-status-info/15 text-status-info`;
  if (status === 'expired') return `${base} bg-bg-elevated text-content-tertiary`;
  return `${base} bg-status-warning/15 text-status-warning`;
};

type SentPitchRowProps = {
  pitch: SentPitch;
  /** The row changed something the list should reload for: an unpaid pitch
   *  was removed. Absent where the list cannot act on it. */
  onChanged?: () => void;
};

export function SentPitchRow({ pitch, onChanged }: SentPitchRowProps) {
  const [quote, setQuote] = useState<PitchQuote | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const paid = pitch.paymentKind === 'paid';
  const waitingOnCurator = paid && (pitch.status === 'new' || pitch.status === 'listened');
  const deadline = waitingOnCurator ? formatPitchDeadline(pitch.responseDueAt) : '';

  const payNow = async () => {
    setError('');
    setIsBusy(true);
    try {
      const result = await requestPitchQuote({ pitchIds: [pitch.id] });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setQuote(result.data.quote);
    } finally {
      setIsBusy(false);
    }
  };

  const remove = async () => {
    setError('');
    setIsBusy(true);
    try {
      const result = await removeUnpaidPitch(pitch.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChanged?.();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-stroke-default bg-bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-sm font-semibold text-content-primary">
            {pitch.playlistName}
          </p>
          <p className="line-clamp-2 break-words text-xs text-content-secondary">
            {pitch.curatorName} · {pitch.songTitle}
          </p>
        </div>
        <span className={statusPillClass(pitch.status)}>
          {pitchStateLabel(pitch.status, pitch.paymentKind)}
        </span>
      </div>
      {pitch.reply ? (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-bg-elevated px-2 py-1.5 text-sm text-content-secondary">
          {pitch.reply}
        </p>
      ) : null}
      {deadline ? (
        <p className="mt-2 text-xs text-content-secondary">{replyDueLine(deadline)}</p>
      ) : null}
      {/* Only with a known price: the price arrives with the payment fields, and
          a line saying "We refunded ₦0" is worse than no line. */}
      {pitch.status === 'expired' && typeof pitch.priceKobo === 'number' ? (
        <p className="mt-2 text-xs text-content-secondary">
          {autoRefundLine(pitch.curatorName, pitch.priceKobo)}
        </p>
      ) : null}

      {pitch.status === 'awaiting_payment' ? (
        quote ? (
          <div className="mt-3">
            <PitchCheckoutPanel
              quote={quote}
              songTitle={pitch.songTitle}
              onCancel={() => setQuote(null)}
            />
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Pay now needs payments switched on. Remove does not: an unpaid
                pitch holds its playlist's one waiting slot, so it has to stay
                removable even if paid pitching is switched off. */}
            {PAYMENTS_ON ? (
              <button
                type="button"
                onClick={() => void payNow()}
                disabled={isBusy}
                className="inline-flex h-9 items-center rounded-xl bg-brand px-3 text-xs font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {PAY_NOW}
              </button>
            ) : null}
            {onChanged ? (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={isBusy}
                className="inline-flex h-9 items-center rounded-xl border border-stroke-default px-3 text-xs font-semibold text-content-secondary transition-colors hover:border-stroke-strong disabled:opacity-50"
              >
                {REMOVE_UNPAID}
              </button>
            ) : null}
          </div>
        )
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-status-error">
          {error}
        </p>
      ) : null}

      <p className="mt-2 font-mono text-[11px] text-content-tertiary">
        {pitch.status === 'awaiting_payment' ? 'Saved' : 'Sent'} {formatRelativeTime(pitch.createdAt)} by{' '}
        {pitch.pitcherName}
      </p>
    </li>
  );
}
