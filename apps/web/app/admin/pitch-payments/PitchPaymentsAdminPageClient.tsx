'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { formatNaira } from '@/lib/pitch-payments';

// /admin/pitch-payments — everything about curator pitch payments that needs a
// person: a bank account whose name did not match, a checkout that could not
// settle cleanly, a refund that failed, and a curator paused by strikes.
//
// Follows the /admin/teams pattern exactly: gate on the backing GET
// (authLoading -> !user -> /auth; the GET's own 401/403 -> /dashboard), a
// runAction helper that POSTs {action, ...} and refetches on success, and a
// per-row busy id. Deliberately NOT flag-gated in the API — the note on
// the route explains why: a failed refund has to stay visible whether or not
// paid pitching is switched on today.

type PayoutReview = {
  id: string;
  curatorName: string;
  profileName: string;
  bankName: string;
  accountLast4: string;
  resolvedAccountName: string;
  createdAt: string;
};

type QuoteReview = {
  id: string;
  reference: string;
  totalKobo: number;
  reason: string;
  paidAt: string | null;
  createdAt: string;
  curators: string[];
};

type RefundRow = {
  id: string;
  reference: string;
  priceKobo: number;
  songTitle: string;
  artistName: string;
  curatorName: string;
  status: string;
  attempts: number;
  lastError: string | null;
  requestedAt: string | null;
};

type PausedCurator = {
  curatorUserId: string;
  displayName: string;
  pausedAt: string;
};

type RecentPayment = {
  id: string;
  reference: string;
  priceKobo: number;
  songTitle: string;
  curatorName: string;
  status: string;
  paidAt: string;
};

type Payload = {
  paystackConfigured: boolean;
  splitMode: string;
  payoutReviews: PayoutReview[];
  quoteReviews: QuoteReview[];
  refunds: RefundRow[];
  pausedCurators: PausedCurator[];
  recentPayments: RecentPayment[];
  summary: {
    count: number;
    grossKobo: number;
    feeKobo: number;
    paystackFeeKobo: number;
    refundedCount: number;
    openRecoveryKobo: number;
  };
};

const formatDate = (value: string | null): string => {
  if (!value) return '—';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
};

export default function PitchPaymentsAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [payload, setPayload] = useState<Payload | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const load = useCallback(
    async (options: { asGate?: boolean } = {}) => {
      setError(null);
      try {
        const token = await getAccessToken();
        if (!token) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const response = await fetch('/api/admin/pitch-payments', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (response.status === 401 || response.status === 403) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const body = (await response.json().catch(() => ({}))) as Partial<Payload> & { error?: string };
        if (!response.ok) {
          setError(body.error || 'Could not load pitch payments.');
          return;
        }
        setPayload({
          paystackConfigured: Boolean(body.paystackConfigured),
          splitMode: body.splitMode || 'unknown',
          payoutReviews: body.payoutReviews || [],
          quoteReviews: body.quoteReviews || [],
          refunds: body.refunds || [],
          pausedCurators: body.pausedCurators || [],
          recentPayments: body.recentPayments || [],
          summary: body.summary || {
            count: 0,
            grossKobo: 0,
            feeKobo: 0,
            paystackFeeKobo: 0,
            refundedCount: 0,
            openRecoveryKobo: 0,
          },
        });
        setChecked(true);
      } catch {
        setError('Could not load pitch payments.');
      }
    },
    [getAccessToken, router]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load({ asGate: true });
  }, [authLoading, user, router, load]);

  const runAction = useCallback(
    async (rowId: string, body: Record<string, unknown>) => {
      setBusyId(rowId);
      setError(null);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Session expired.');
        const response = await fetch('/api/admin/pitch-payments', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(result.error || 'That did not work.');
        await load();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'That did not work.');
      } finally {
        setBusyId(null);
      }
    },
    [getAccessToken, load]
  );

  const reject = useCallback(
    (row: PayoutReview) => {
      const note = window.prompt(`Why is ${row.curatorName || 'this account'} rejected?`, '') || '';
      void runAction(row.id, { action: 'reject_payout', accountId: row.id, note });
    },
    [runAction]
  );

  if (authLoading || !checked) {
    return (
      <AdminPageSkeleton
        titleWidth="w-48"
        descriptionLines={2}
        statCards={{ count: 5, gridClassName: 'sm:grid-cols-5' }}
        table={{ columns: 5, rows: 6 }}
      />
    );
  }

  const summary = payload?.summary ?? {
    count: 0,
    grossKobo: 0,
    feeKobo: 0,
    paystackFeeKobo: 0,
    refundedCount: 0,
    openRecoveryKobo: 0,
  };

  return (
    <div>
      <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">Pitch payments</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Bank accounts to approve, checkouts that need a look, and refunds that did not go through on
        their own. The last 30 days of payments below are for reconciling against Paystack by eye.
      </p>

      {payload && !payload.paystackConfigured ? (
        <p className="mt-4 rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          PAYSTACK_SECRET_KEY is not set. Nothing here can charge, refund, or check a checkout until it
          is.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-5">
        <Stat label="Paid (30d)" value={String(summary.count)} />
        <Stat label="Gross (30d)" value={formatNaira(summary.grossKobo)} />
        <Stat label="Urganize fee (30d)" value={formatNaira(summary.feeKobo)} />
        <Stat label="Refunded (30d)" value={String(summary.refundedCount)} />
        <Stat label="Owed from curators" value={formatNaira(summary.openRecoveryKobo)} />
      </div>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-content-primary">Bank accounts to review</h2>
        <p className="mt-1 text-sm text-content-secondary">
          The name at the bank did not match this curator&apos;s profile. No money goes to it until
          you approve it.
        </p>
        {payload && payload.payoutReviews.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {payload.payoutReviews.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stroke-default px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-content-primary">
                    {row.curatorName || row.profileName || 'Unnamed curator'}
                  </p>
                  <p className="text-xs text-content-secondary">
                    Bank says &quot;{row.resolvedAccountName}&quot; · {row.bankName} ending{' '}
                    {row.accountLast4} · {formatDate(row.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void runAction(row.id, { action: 'approve_payout', accountId: row.id })}
                    className="inline-flex h-9 items-center rounded-xl bg-brand px-3 text-xs font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => reject(row)}
                    className="inline-flex h-9 items-center rounded-xl border border-stroke-default px-3 text-xs font-semibold text-content-secondary disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-content-tertiary">Nothing waiting for review.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-content-primary">Checkouts that need a look</h2>
        <p className="mt-1 text-sm text-content-secondary">
          The amount did not match, or the pitches it priced had already changed by the time it was
          paid. Nothing was sent to a curator for these.
        </p>
        {payload && payload.quoteReviews.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {payload.quoteReviews.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stroke-default px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-content-primary">
                    {formatNaira(row.totalKobo)} · {row.reference}
                  </p>
                  <p className="text-xs text-content-secondary">
                    {row.reason || 'unknown reason'} · {row.curators.join(', ') || 'no curators on it'} ·{' '}
                    {formatDate(row.paidAt || row.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void runAction(row.id, { action: 'refund_quote', quoteId: row.id })}
                  className="inline-flex h-9 shrink-0 items-center rounded-xl border border-status-error/40 px-3 text-xs font-semibold text-status-error disabled:opacity-50"
                >
                  Refund in full
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-content-tertiary">Nothing waiting for review.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-content-primary">Refunds needing attention</h2>
        <p className="mt-1 text-sm text-content-secondary">
          A missed-window refund that has not gone through yet, or one that failed too many times.
        </p>
        {payload && payload.refunds.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {payload.refunds.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stroke-default px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-content-primary">
                    {row.songTitle} by {row.artistName} · {formatNaira(row.priceKobo)}
                  </p>
                  <p className="text-xs text-content-secondary">
                    {row.curatorName} · {row.status} · {row.attempts} tries
                    {row.lastError ? ` · ${row.lastError}` : ''} · {formatDate(row.requestedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void runAction(row.id, { action: 'refund_payment', paymentId: row.id })}
                    className="inline-flex h-9 items-center rounded-xl bg-brand px-3 text-xs font-semibold text-content-inverse disabled:opacity-50"
                  >
                    Retry refund
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void runAction(row.id, { action: 'mark_refunded', paymentId: row.id })}
                    className="inline-flex h-9 items-center rounded-xl border border-stroke-default px-3 text-xs font-semibold text-content-secondary disabled:opacity-50"
                  >
                    Mark refunded by hand
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-content-tertiary">Nothing waiting.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-content-primary">Paused curators</h2>
        <p className="mt-1 text-sm text-content-secondary">
          Three missed windows in 90 days pauses an inbox until reviewed by hand.
        </p>
        {payload && payload.pausedCurators.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {payload.pausedCurators.map((row) => (
              <li
                key={row.curatorUserId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stroke-default px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-content-primary">
                    {row.displayName || 'Unnamed curator'}
                  </p>
                  <p className="text-xs text-content-secondary">Paused {formatDate(row.pausedAt)}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === row.curatorUserId}
                  onClick={() =>
                    void runAction(row.curatorUserId, {
                      action: 'unpause_curator',
                      curatorUserId: row.curatorUserId,
                    })
                  }
                  className="inline-flex h-9 shrink-0 items-center rounded-xl bg-brand px-3 text-xs font-semibold text-content-inverse disabled:opacity-50"
                >
                  Unpause
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-content-tertiary">Nobody is paused.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-content-primary">Recent payments</h2>
        <p className="mt-1 text-sm text-content-secondary">
          Last 30 days. For eyeballing against Paystack; the daily reconcile sweep checks this
          automatically.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-stroke-default text-left text-xs uppercase tracking-wide text-content-tertiary">
                <th className="py-2 pr-3 font-medium">Song</th>
                <th className="py-2 pr-3 font-medium">Curator</th>
                <th className="py-2 pr-3 font-medium">Price</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {(payload?.recentPayments || []).map((row) => (
                <tr key={row.id} className="border-b border-stroke-subtle">
                  <td className="py-2 pr-3 text-content-primary">{row.songTitle}</td>
                  <td className="py-2 pr-3 text-content-secondary">{row.curatorName}</td>
                  <td className="py-2 pr-3 font-mono text-content-secondary">{formatNaira(row.priceKobo)}</td>
                  <td className="py-2 pr-3 text-content-secondary">{row.status}</td>
                  <td className="py-2 text-content-secondary">{formatDate(row.paidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {payload && payload.recentPayments.length === 0 ? (
            <p className="py-3 text-sm text-content-tertiary">No payments in the last 30 days.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stroke-default px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-content-tertiary">{label}</p>
      <p className="mt-1 font-display text-xl text-content-primary">{value}</p>
    </div>
  );
}
