'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from '@/components/icons';
import { BuyCredits } from '@/components/credits/BuyCredits';
import { CreditCap } from '@/components/credits/CreditCap';
import { formatHistoryAmount, groupHistoryByDay, type HistoryEntry } from '@/lib/credits/history';
import type { CreditAccount } from '@/lib/credits/allowance';
import { SettingsDesk } from './SettingsDesk';

const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

function time(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : timeFormat.format(at);
}

/**
 * AI credits on a computer (#1226): the history on the left, grouped by day
 * with no minus signs; the balance and the switch for paying past your
 * credits on the right. The data, the reads and every action are the page's
 * own (CreditsPageClient); this only lays them out.
 */
export function CreditsDesk({
  entries,
  loading,
  error,
  nextBefore,
  loadingMore,
  onMore,
  balance,
  account,
  onPurchased,
}: {
  entries: HistoryEntry[];
  loading: boolean;
  error: string;
  nextBefore: string | null;
  loadingMore: boolean;
  onMore: () => void;
  balance: number | null;
  account: CreditAccount | null;
  onPurchased: () => void;
}) {
  // Day labels are worked out once per page life; "Today" stays today.
  const [now] = useState(() => new Date());
  const days = useMemo(() => groupHistoryByDay(entries, now), [entries, now]);

  // A team with no plan has no monthly credits or switch: its balance and the
  // credit packs, as on the phone.
  const fallback = (
    <div className="space-y-4">
      {balance !== null ? (
        <div className="rounded-2xl border border-stroke-default bg-bg-surface p-5">
          <p className="text-sm text-content-secondary">Your credits</p>
          <p className="mt-1 font-display text-[40px] leading-[44px] text-content-primary">
            {Math.max(0, Math.floor(balance)).toLocaleString('en')}
          </p>
          <p className="mt-2 text-[13px] text-content-secondary">They never expire.</p>
        </div>
      ) : null}
      <BuyCredits account={account} onPurchased={onPurchased} />
    </div>
  );

  return (
    <SettingsDesk active="credits" title="AI credits" lead="What AI has done for you, and what it cost.">
      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-stroke-default bg-bg-surface">
          {loading ? (
            <div aria-busy="true" className="py-2">
              {[0, 1, 2, 3, 4].map((key) => (
                <div key={key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <span className="h-4 w-56 animate-pulse rounded bg-bg-hover" />
                  <span className="h-4 w-8 animate-pulse rounded bg-bg-hover" />
                </div>
              ))}
            </div>
          ) : error && entries.length === 0 ? (
            <p role="alert" className="px-5 py-6 text-sm text-status-error">
              {error}
            </p>
          ) : entries.length === 0 ? (
            <p className="px-5 py-6 text-sm text-content-secondary">
              Nothing here yet. Your credits show up as soon as you have some.
            </p>
          ) : (
            <>
              {days.map((dayGroup) => (
                <div key={dayGroup.key}>
                  <p className="px-5 pb-1 pt-4 text-xs font-bold uppercase tracking-[0.08em] text-content-tertiary">
                    {dayGroup.label}
                  </p>
                  <ul>
                    {dayGroup.entries.map((entry) => {
                      const detail = [entry.detail, time(entry.at)].filter(Boolean).join(' · ');
                      return (
                        <li
                          key={entry.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-stroke-default px-5 py-3 first:border-t-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-content-primary">{entry.label}</p>
                            {detail ? <p className="truncate text-[13px] text-content-secondary">{detail}</p> : null}
                          </div>
                          <p
                            className={`text-sm font-semibold tabular-nums ${entry.credits > 0 ? 'text-brand' : 'text-content-primary'}`}
                          >
                            <span className="sr-only">{entry.credits > 0 ? 'Added ' : 'Spent '}</span>
                            {formatHistoryAmount(entry.credits)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {error ? (
                <p role="alert" className="px-5 pb-3 text-sm text-status-error">
                  {error}
                </p>
              ) : null}
              {nextBefore ? (
                <div className="border-t border-stroke-default px-5 py-3">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={onMore}
                    className="motion-focus inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline disabled:opacity-60"
                  >
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    Show older
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="sticky top-4">
          <CreditCap variant="desk" fallback={fallback} onChange={onPurchased} />
        </div>
      </div>
    </SettingsDesk>
  );
}
