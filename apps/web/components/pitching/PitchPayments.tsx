'use client';

// The team's pitch payment history: one receipt per paid checkout.
//
// A receipt shows each curator's share and the Urganize fee as SEPARATE lines,
// which is what the spec's receipt asks for and what the "Urganize keeps only
// the Urganize fee" footer means. The share shown is the curator's nominal one,
// built by the server field by field; nothing here could show what a curator
// was actually sent, because the payload does not carry it.

import { useCallback, useEffect, useState } from 'react';
import {
  PAYMENT_IN_REVIEW,
  RECEIPT_FOOTER,
  REFUNDED_LABEL,
  REFUND_ON_ITS_WAY,
  formatPitchDate,
  receiptCuratorLine,
  receiptFeeLine,
  receiptHeader,
  receiptTotalLine,
} from '@/lib/pitch-payment-copy';
import { formatNaira } from '@/lib/pitch-payments';
import { loadPitchReceipts } from '@/lib/pitch-payments-client';
import type { PitchReceipt } from '@/types/pitch-payments';

/** With `releaseId`, only that rollout's receipts (a rollout's Pitch tab). */
export function PitchPayments({ releaseId }: { releaseId?: string } = {}) {
  const [receipts, setReceipts] = useState<PitchReceipt[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const result = await loadPitchReceipts();
    if (!result.ok) {
      setError(result.error);
      setReceipts((current) => current ?? []);
      return;
    }
    setError('');
    setReceipts(
      releaseId ? result.data.receipts.filter((receipt) => receipt.releaseId === releaseId) : result.data.receipts
    );
  }, [releaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (receipts === null) {
    return <div className="h-16 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />;
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-sm text-status-error">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Try again
          </button>
        </p>
      ) : null}

      {receipts.length === 0 && !error ? (
        <p className="rounded-xl border border-stroke-default bg-bg-surface p-4 text-sm text-content-secondary">
          No payments yet. Receipts for paid pitches show up here.
        </p>
      ) : null}

      <ul className="space-y-2">
        {receipts.map((receipt) => {
          const date = formatPitchDate(receipt.paidAt);
          const inReview = receipt.status === 'needs_review';
          return (
            <li key={receipt.id}>
              <details className="rounded-xl border border-stroke-default bg-bg-surface px-3 py-2.5">
                <summary className="flex cursor-pointer select-none items-center justify-between gap-3 marker:content-none">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-content-primary">
                      {receipt.songTitle || receipt.releaseTitle || 'Pitch'}
                    </span>
                    <span className="block truncate text-xs text-content-secondary">
                      {date}
                      {receipt.lines.length > 1 ? ` · ${receipt.lines.length} curators` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm text-content-primary">
                    {formatNaira(receipt.totalKobo)}
                  </span>
                </summary>

                <div className="mt-3 space-y-2 border-t border-stroke-subtle pt-3 text-sm">
                  <p className="font-mono text-[11px] text-content-tertiary">
                    {receiptHeader(date, receipt.reference)}
                  </p>
                  {inReview ? <p className="text-status-warning">{PAYMENT_IN_REVIEW}</p> : null}
                  <ul className="space-y-1">
                    {receipt.lines.map((line) => (
                      <li key={line.pitchId} className="text-content-secondary">
                        {receiptCuratorLine(line.curatorName, receipt.songTitle || 'your song', line.curatorShareKobo)}
                        {line.refund === 'refunded' ? (
                          <span className="ml-2 font-semibold text-content-primary">{REFUNDED_LABEL}</span>
                        ) : line.refund === 'pending' ? (
                          <span className="ml-2 font-semibold text-status-warning">{REFUND_ON_ITS_WAY}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <p className="text-content-secondary">{receiptFeeLine(receipt.platformFeeTotalKobo)}</p>
                  <p className="font-semibold text-content-primary">{receiptTotalLine(receipt.totalKobo)}</p>
                  <p className="text-xs text-content-tertiary">{RECEIPT_FOOTER}</p>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
