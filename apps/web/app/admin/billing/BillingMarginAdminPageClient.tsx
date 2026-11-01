'use client';

// The billing margin view (founder, 2026-10-22, mock d). One row per paying
// team for this month: how they pay, the cash, Paystack's fee (estimated from
// its published price), what we owe TRM, what their UrgAns credits cost us, and
// what is left. Data from GET /api/admin/billing; ADMIN_EMAILS gates it server
// side, and anyone else is sent to /dashboard (the /admin/nps pattern).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { intervalLabel } from '@urganize/pricing';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { formatNaira } from '@/lib/money';
import type { BillingMarginView } from '@/lib/billing-margin-server';
import type { PaymentChannel } from '@/lib/billing-margin';

const CHANNEL_LABEL: Record<PaymentChannel, string> = {
  card: 'Card',
  transfer: 'Transfer',
  direct_transfer: 'Direct transfer',
  bachs: 'Bachs',
  other: 'Card (assumed)',
};

const PATH_LABEL: Record<string, string> = {
  self_serve: 'Self-serve',
  concierge: 'Concierge',
  legacy: 'Legacy',
};

const money = (kobo: number): string => (kobo < 0 ? `−${formatNaira(-kobo)}` : formatNaira(kobo));
const share = (value: number | null): string => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);

function thisMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function BillingMarginAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [data, setData] = useState<BillingMarginView | null>(null);
  const [month, setMonth] = useState(thisMonth);
  const [csvState, setCsvState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [csvError, setCsvError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const response = await fetch('/api/admin/billing', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!response.ok) {
          router.replace('/dashboard');
          return;
        }
        const payload = (await response.json().catch(() => null)) as BillingMarginView | null;
        if (!cancelled && payload) setData(payload);
      } catch {
        if (!cancelled) router.replace('/dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  const downloadCsv = async () => {
    setCsvState('busy');
    setCsvError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/billing/trm-ledger?month=${encodeURIComponent(month)}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Could not build the file.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `urganize-trm-${month}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setCsvState('idle');
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : 'Could not build the file.');
      setCsvState('error');
    }
  };

  if (authLoading || !user || !data) {
    return (
      <AdminPageSkeleton
        titleWidth="w-40"
        descriptionLines={2}
        statCards={{ count: 4, gridClassName: 'grid-cols-2 sm:grid-cols-4' }}
        table={{ columns: 6, rows: 8 }}
      />
    );
  }

  const { totals } = data;
  const tiles: Array<{ label: string; value: string }> = [
    { label: 'Paying teams', value: `${totals.payingTeams}${totals.prepaidTeams ? ` · ${totals.prepaidTeams} prepaid` : ''}` },
    { label: 'MRR', value: money(totals.mrrKobo) },
    {
      label: 'Contribution per team',
      value: totals.contributionPerTeamKobo === null ? '—' : `${money(totals.contributionPerTeamKobo)} · ${share(totals.contributionShare)}`,
    },
    {
      label: 'Break-even',
      value: totals.breakEvenTeams === null ? 'Set FIXED_COSTS_MONTHLY_KOBO' : `${totals.breakEvenTeams} teams`,
    },
  ];

  return (
    <div>
      <h1 className="mt-2 font-display text-3xl font-semibold">Billing margin</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        This month, per paying team. Prepaid plans are spread over their months. Paystack fees are estimates from its published
        price; credits cost {formatNaira(data.creditCostKobo)} each. Our own accounts are left out.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="border border-stroke-default bg-bg-surface p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-content-secondary">{tile.label}</p>
            <p className="mt-2 text-lg font-semibold text-content-primary">{tile.value}</p>
          </div>
        ))}
      </div>

      {data.notRead.length ? (
        <p className="mt-4 text-sm text-status-warning" role="status">
          Not fully read: {data.notRead.join(', ')}. The numbers below may be short.
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto border border-stroke-default">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-bg-surface text-content-secondary">
            <tr>
              {['Team', 'Plan', 'Period', 'Paid by', 'Came in', 'Cash', 'Paystack fee', 'TRM owed', 'Credits', 'Contribution'].map((head) => (
                <th key={head} scope="col" className="px-3 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em]">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-content-secondary">
                  No paying teams yet.
                </td>
              </tr>
            ) : (
              data.rows.map((row) => (
                <tr key={row.workspaceId} className="border-t border-stroke-default">
                  <td className="px-3 py-2.5 text-content-primary">{row.teamName}</td>
                  <td className="px-3 py-2.5 capitalize">{row.plan}</td>
                  <td className="px-3 py-2.5">{intervalLabel(row.interval)}</td>
                  <td className="px-3 py-2.5">{CHANNEL_LABEL[row.channel]}</td>
                  <td className="px-3 py-2.5">{row.path ? (PATH_LABEL[row.path] ?? row.path) : '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{money(row.cashMonthKobo)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{money(row.paystackFeeMonthKobo)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{money(row.trmOwedMonthKobo)}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {row.creditsUsed.toLocaleString('en-US')} · {money(row.creditCostKobo)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-content-primary">
                    {money(row.contributionKobo)} · {share(row.contributionShare)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">What we owe TRM</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
          {data.trm.costBasis === 'fixed' ? 'A fixed fee per team with distribution' : 'A share of what each team paid'},{' '}
          {data.trm.billingMode === 'trm_plan'
            ? "on TRM's monthly plan for monthly teams and its yearly plan for 6-month and yearly teams"
            : data.trm.billingMode === 'monthly_prorata'
              ? 'billed month by month'
              : 'a year paid upfront'}. Download a month to send
          with the payment. Nothing is paid automatically.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-content-secondary">Month</span>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-10 border border-stroke-control bg-bg-base px-3 text-content-primary"
            />
          </label>
          <button
            type="button"
            onClick={() => void downloadCsv()}
            disabled={csvState === 'busy' || !month}
            className="motion-focus inline-flex h-10 items-center border border-stroke-strong px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover disabled:opacity-50"
          >
            {csvState === 'busy' ? 'Building…' : 'Download CSV'}
          </button>
        </div>
        {csvError ? (
          <p role="alert" className="mt-3 text-sm text-status-error">
            {csvError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
