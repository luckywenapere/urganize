'use client';

// The billing margin view (founder, 2026-10-22, mock d). One row per paying
// team for this month: how they pay, the cash, Paystack's fee (estimated from
// its published price), what we owe TRM, what their UrgAns credits cost us, and
// what is left. Data from GET /api/admin/billing; ADMIN_EMAILS gates it server
// side, and anyone else is sent to /dashboard (the /admin/nps pattern).
//
// Since 2026-11-12 (#1241, approved mock): numbers right aligned, whole naira
// and whole percents, a total row, a thin margin (under THIN_MARGIN_SHARE) in
// red, and the TRM download as a button at the top with its month beside it.
// Display only: every sum is lib/billing-margin.ts, unchanged.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { intervalLabel } from '@urganize/pricing';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { formatNaira } from '@/lib/money';
import { cn } from '@/lib/utils';
import { THIN_MARGIN_SHARE, isThinMargin, marginColumnTotals, wholeNaira, wholePercent } from '@/lib/billing-margin-display';
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
  const columnTotals = marginColumnTotals(data.rows);
  const tiles: Array<{ label: string; value: string; note?: string }> = [
    {
      label: 'Paying teams',
      value: String(totals.payingTeams),
      note: totals.prepaidTeams ? `${totals.prepaidTeams} of them prepaid` : undefined,
    },
    { label: 'Monthly revenue', value: wholeNaira(totals.mrrKobo) },
    {
      label: 'Left per team',
      value: totals.contributionPerTeamKobo === null ? '—' : wholeNaira(totals.contributionPerTeamKobo),
      note: totals.contributionShare === null ? undefined : `${wholePercent(totals.contributionShare)} of what they pay`,
    },
    {
      label: 'Break-even',
      value: totals.breakEvenTeams === null ? 'Not set' : `${totals.breakEvenTeams} teams`,
      note: totals.breakEvenTeams === null ? 'Set FIXED_COSTS_MONTHLY_KOBO' : undefined,
    },
  ];
  const head = 'px-3 py-2.5 text-xs font-semibold text-content-tertiary';
  const num = 'px-3 py-2.5 text-right tabular-nums whitespace-nowrap';

  return (
    <div>
      <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Billing margin</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
            This month, per paying team. Prepaid plans are spread over their months. Paystack fees are estimates from its
            published price; credits cost {formatNaira(data.creditCostKobo)} each. Our own accounts are left out.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="sr-only" htmlFor="trm-month">
            Month for the TRM sheet
          </label>
          <input
            id="trm-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="h-10 rounded-full border border-stroke-control bg-bg-base px-3 text-sm text-content-primary"
          />
          <button
            type="button"
            onClick={() => void downloadCsv()}
            disabled={csvState === 'busy' || !month}
            className="motion-focus inline-flex h-10 items-center whitespace-nowrap rounded-full border border-stroke-strong px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover disabled:opacity-50"
          >
            {csvState === 'busy' ? 'Building…' : 'Download the TRM sheet'}
          </button>
        </div>
      </div>
      {csvError ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {csvError}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-stroke-default bg-bg-surface p-4">
            <p className="text-sm text-content-secondary">{tile.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-content-primary">{tile.value}</p>
            {tile.note ? <p className="mt-0.5 text-xs text-content-tertiary">{tile.note}</p> : null}
          </div>
        ))}
      </div>

      {data.notRead.length ? (
        <p className="mt-4 text-sm text-status-warning" role="status">
          Not fully read: {data.notRead.join(', ')}. The numbers below may be short.
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-stroke-default bg-bg-surface">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="border-b border-stroke-default">
            <tr>
              {['Team', 'Plan', 'Period', 'Paid by', 'Came in'].map((label) => (
                <th key={label} scope="col" className={head}>
                  {label}
                </th>
              ))}
              {['Cash', 'Paystack fee', 'TRM owed', 'Credits', 'Left'].map((label) => (
                <th key={label} scope="col" className={cn(head, 'text-right')}>
                  {label}
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
              data.rows.map((row) => {
                const thin = isThinMargin(row.contributionShare);
                return (
                  <tr key={row.workspaceId} className="border-t border-stroke-subtle first:border-t-0">
                    <td className="px-3 py-2.5 text-content-primary">{row.teamName}</td>
                    <td className="px-3 py-2.5 capitalize">{row.plan}</td>
                    <td className="px-3 py-2.5">{intervalLabel(row.interval)}</td>
                    <td className="px-3 py-2.5">{CHANNEL_LABEL[row.channel]}</td>
                    <td className="px-3 py-2.5">{row.path ? (PATH_LABEL[row.path] ?? row.path) : '—'}</td>
                    <td className={num}>{wholeNaira(row.cashMonthKobo)}</td>
                    <td className={num}>{wholeNaira(row.paystackFeeMonthKobo)}</td>
                    <td className={num}>{wholeNaira(row.trmOwedMonthKobo)}</td>
                    <td className={num} title={`${row.creditsUsed.toLocaleString('en-US')} credits used`}>
                      {wholeNaira(row.creditCostKobo)}
                    </td>
                    <td className={cn(num, thin ? 'font-semibold text-status-error' : 'text-content-primary')}>
                      {wholeNaira(row.contributionKobo)} · {wholePercent(row.contributionShare)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {data.rows.length > 0 ? (
            <tfoot>
              <tr className="border-t border-stroke-default bg-bg-hover font-semibold text-content-primary">
                <th scope="row" colSpan={5} className="px-3 py-2.5 text-left font-semibold">
                  All {totals.payingTeams} {totals.payingTeams === 1 ? 'team' : 'teams'}
                </th>
                <td className={num}>{wholeNaira(columnTotals.cashKobo)}</td>
                <td className={num}>{wholeNaira(columnTotals.paystackFeeKobo)}</td>
                <td className={num}>{wholeNaira(columnTotals.trmOwedKobo)}</td>
                <td className={num}>{wholeNaira(columnTotals.creditCostKobo)}</td>
                <td className={cn(num, isThinMargin(totals.contributionShare) && 'text-status-error')}>
                  {wholeNaira(totals.contributionKobo)} · {wholePercent(totals.contributionShare)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="mt-2 max-w-3xl text-xs leading-5 text-content-tertiary">
        Left under {wholePercent(THIN_MARGIN_SHARE)} of what a team pays is shown in red. The TRM sheet:{' '}
        {data.trm.costBasis === 'fixed' ? 'a fixed fee per team with distribution' : 'a share of what each team paid'},{' '}
        {data.trm.billingMode === 'trm_plan'
          ? "on TRM's monthly plan for monthly teams and its yearly plan for 6-month and yearly teams"
          : data.trm.billingMode === 'monthly_prorata'
            ? 'billed month by month'
            : 'a year paid upfront'}
        . Send it with the payment; nothing is paid automatically.
      </p>
    </div>
  );

}
