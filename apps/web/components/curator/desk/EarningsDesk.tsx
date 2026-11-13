'use client';

// The playlist owner's Earnings on a computer (#1237): three numbers first,
// the history as a table, and the price and bank cards on the right. Every
// figure comes from GET /api/curator/earnings or the inbox already loaded in
// useCuratorStore; nothing here is estimated.

import Link from 'next/link';
import { formatNaira } from '@/lib/money';
import { formatPitchDate, recoveryAppliedLine } from '@/lib/pitch-payment-copy';
import { splitPitchPrice } from '@/lib/pitch-payments';
import { earningsStatusLabel, monthEarnings, waitingOnReplies } from '@/lib/curator-desk';
import type { CuratorEarnings } from '@/types/pitch-payments';
import type { CuratorPitch } from '@/types/pitching';

const ROW = 'grid grid-cols-[110px_minmax(0,1fr)_100px_140px] items-center gap-4 px-5 py-3';

function Stat({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stroke-default bg-bg-surface p-5">
      <p className="text-[13px] text-content-secondary">{label}</p>
      <p className="mt-1 font-display text-[32px] leading-[38px] text-content-primary">{value}</p>
      <p className="text-[13px] text-content-secondary">{sub}</p>
    </div>
  );
}

export function EarningsDesk({
  earnings,
  pitches,
  pitchesLoaded,
  notices,
  priceCard,
  bankCard,
}: {
  earnings: CuratorEarnings;
  pitches: CuratorPitch[];
  /** False until the inbox has loaded, so "waiting" is never a guessed 0. */
  pitchesLoaded: boolean;
  notices: React.ReactNode;
  priceCard: React.ReactNode;
  bankCard: React.ReactNode;
}) {
  const month = monthEarnings(earnings.earnings);
  const waiting = waitingOnReplies(pitches);
  // What artists are charged right now: null while paid pitches are off, or
  // on but not charging yet (no bank account, under review, paused).
  const priceKobo = earnings.livePriceKobo;
  const keepKobo = priceKobo ? splitPitchPrice(priceKobo, earnings.config.feeBps).curatorShareKobo : null;

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-[30px] leading-[38px] text-content-primary">Earnings</h1>
        <p className="mt-1 text-sm text-content-secondary">Artists pay you each time you listen and reply.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat
          label="This month"
          value={month.kobo > 0 ? formatNaira(month.kobo) : '₦0'}
          sub={`${month.count} ${month.count === 1 ? 'reply' : 'replies'} paid`}
        />
        <Stat
          label="Waiting on replies"
          value={pitchesLoaded ? (waiting.kobo > 0 ? formatNaira(waiting.kobo) : '₦0') : '…'}
          sub={
            pitchesLoaded ? (
              <>
                {waiting.count} {waiting.count === 1 ? 'pitch' : 'pitches'}
                {waiting.count > 0 ? (
                  <>
                    {' · '}
                    <Link href="/curator" className="font-semibold text-brand underline underline-offset-[3px]">
                      Open
                    </Link>
                  </>
                ) : null}
              </>
            ) : (
              'Loading'
            )
          }
        />
        <Stat
          label="Your price"
          value={priceKobo ? formatNaira(priceKobo) : 'Free'}
          sub={keepKobo ? `You keep ${formatNaira(keepKobo)}` : 'Artists pitch you for free'}
        />
      </div>

      {notices}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_300px] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-stroke-default bg-bg-surface">
          <div
            aria-hidden="true"
            className={`${ROW} border-b border-stroke-default text-xs font-semibold text-content-tertiary`}
          >
            <span>Date</span>
            <span>Song</span>
            <span>You got</span>
            <span>Status</span>
          </div>
          {earnings.earnings.length === 0 ? (
            <p className="px-5 py-6 text-sm text-content-secondary">
              No pitches paid for yet. They will show up here.
            </p>
          ) : (
            <ul aria-label="Earnings history">
              {earnings.earnings.map((entry) => {
                const refunded = entry.status !== 'paid';
                return (
                  <li key={entry.id} className={`${ROW} border-t border-stroke-default first:border-t-0`}>
                    <span className="text-[13px] text-content-secondary">{formatPitchDate(entry.paidAt)}</span>
                    <span className="min-w-0">
                      <span className="block truncate">
                        <b className={`font-semibold ${refunded ? 'text-content-tertiary' : 'text-content-primary'}`}>
                          {entry.songTitle}
                        </b>{' '}
                        <span className="text-[13px] text-content-secondary">· {entry.artistName}</span>
                      </span>
                      {!refunded && entry.recoveryAppliedKobo > 0 ? (
                        <span className="block text-xs text-content-tertiary">
                          {recoveryAppliedLine(entry.recoveryAppliedKobo)}
                        </span>
                      ) : null}
                    </span>
                    <span className={`tabular-nums ${refunded ? 'text-content-tertiary' : 'text-content-primary'}`}>
                      {refunded ? '–' : formatNaira(entry.sentToBankKobo)}
                    </span>
                    <span
                      className={`text-xs font-semibold ${refunded ? 'text-status-warning' : 'text-brand'}`}
                    >
                      {earningsStatusLabel(entry.status)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="space-y-4">
          {priceCard}
          {bankCard}
        </div>
      </div>
    </div>
  );
}
