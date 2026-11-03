'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from '@/components/icons';
import { BuyCredits } from '@/components/credits/BuyCredits';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { authHeaders, readError } from '@/components/press-kits/press-kit-client';
import { useCreditBalance } from '@/components/urgans-actions/useCreditBalance';
import { useAuthStore } from '@/lib/auth-store';
import { isCreditsEnabled } from '@/lib/credits/config';
import { formatSignedCredits, type HistoryEntry } from '@/lib/credits/history';

/**
 * Every spend, top-up, monthly grant and trial grant, newest first, with the
 * date and the amount. Read-only: nothing here changes a balance.
 *
 * Credits never expire, so the page never says they will. The balance at the
 * top is the same number the banner and the cost lines use.
 */

const CREDITS_ON = isCreditsEnabled();

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatWhen(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : dateFormat.format(at);
}

export default function CreditsPageClient() {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.isLoading);
  const { balance, account, refresh: refreshBalance } = useCreditBalance();

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!CREDITS_ON) router.replace('/dashboard');
  }, [router]);

  const load = useCallback(async (before: string | null) => {
    const headers = await authHeaders();
    if (!headers) {
      setIsLoading(false);
      return;
    }
    try {
      const query = before ? `?before=${encodeURIComponent(before)}` : '';
      const response = await fetch(`/api/urgans/credits/history${query}`, { headers, cache: 'no-store' });
      if (!response.ok) {
        setError(await readError(response, 'Could not load your credit history.'));
        return;
      }
      const body = (await response.json()) as { entries: HistoryEntry[]; nextBefore: string | null };
      setEntries((current) => (before ? [...current, ...body.entries] : body.entries));
      setNextBefore(body.nextBefore);
      setError('');
    } catch {
      setError('Could not reach Urganize. Check your connection and try again.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (CREDITS_ON) void load(null);
  }, [load]);

  // A purchase just landed: the balance and the list have both changed.
  const handlePurchased = useCallback(() => {
    void refreshBalance();
    void load(null);
  }, [refreshBalance, load]);

  if (!CREDITS_ON) return null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 pb-16">
      <Link
        href="/dashboard"
        className="motion-focus inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-content-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back
      </Link>

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">AI credits</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-content-primary">Your credit history</h1>
        {balance !== null ? (
          <p className="mt-1 text-sm text-content-secondary">
            You have {Math.max(0, Math.floor(balance)).toLocaleString('en')}{' '}
            {Math.floor(balance) === 1 ? 'credit' : 'credits'}. They never expire.
          </p>
        ) : null}
      </header>

      <BuyCredits account={account} onPurchased={handlePurchased} />

      {authLoading || isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <SkeletonBlock key={index} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : error && entries.length === 0 ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-content-secondary">Nothing here yet. Your credits show up as soon as you have some.</p>
      ) : (
        <>
          <ul className="divide-y divide-stroke-subtle border-y border-stroke-subtle">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-content-primary">{entry.label}</p>
                  {entry.detail ? <p className="mt-0.5 text-xs text-content-secondary">{entry.detail}</p> : null}
                  <p className="mt-0.5 text-xs text-content-tertiary">{formatWhen(entry.at)}</p>
                </div>
                <p
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    entry.credits > 0 ? 'text-brand' : 'text-content-primary'
                  }`}
                >
                  <span className="sr-only">{entry.credits > 0 ? 'Added ' : 'Spent '}</span>
                  {formatSignedCredits(entry.credits)}
                </p>
              </li>
            ))}
          </ul>

          {error ? (
            <p role="alert" className="text-sm text-status-error">
              {error}
            </p>
          ) : null}

          {nextBefore ? (
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={() => {
                setIsLoadingMore(true);
                void load(nextBefore);
              }}
              className="motion-focus inline-flex items-center gap-2 rounded-lg border border-stroke-default px-3 py-2 text-sm text-content-primary hover:border-content-secondary disabled:opacity-60"
            >
              {isLoadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Show older
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
