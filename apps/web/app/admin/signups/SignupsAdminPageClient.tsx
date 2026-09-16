'use client';

// Monthly product-signup dashboard: new Urganize accounts
// (profiles.created_at) per calendar month, last 12 months. Distinct from
// Growth, which tracks the marketing site's waitlist (Neon) cumulatively by
// week — this counts real accounts, month by month, from Supabase. The GET
// doubles as the admin gate, same as every other admin page.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';

type Month = { monthKey: string; monthLabel: string; newSignups: number };
type SignupsResponse = {
  totalSignups: number;
  last12MonthsSignups: number;
  months: Month[];
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export default function SignupsAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [checked, setChecked] = useState(false);
  const [data, setData] = useState<SignupsResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/admin/signups', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (response.status === 401 || response.status === 403) {
          router.replace('/dashboard');
          return;
        }
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setError(payload.error || 'Could not load signups.');
          setChecked(true);
          return;
        }
        const payload = (await response.json().catch(() => null)) as SignupsResponse | null;
        if (!cancelled && payload) {
          setData(payload);
          setChecked(true);
        }
      } catch {
        if (!cancelled) router.replace('/dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  if (authLoading || !user || !checked) {
    return (
      <AdminPageSkeleton
        titleWidth="w-32"
        statCards={{ count: 2, gridClassName: 'grid-cols-1 sm:grid-cols-2' }}
        chart
        table={{ columns: 3, rows: 8 }}
      />
    );
  }

  const months = data?.months ?? [];
  const totalSignups = data?.totalSignups ?? 0;
  const last12MonthsSignups = data?.last12MonthsSignups ?? 0;
  const maxCount = Math.max(1, ...months.map((month) => month.newSignups));

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Signups</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        New Urganize accounts created each month, from Supabase. This is real
        product signups — for the marketing site&rsquo;s waitlist, see
        Growth.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-stroke-default bg-bg-surface p-5">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
            Total signups
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-content-primary">
            {totalSignups}
          </p>
        </div>
        <div className="rounded-lg border border-stroke-default bg-bg-surface p-5">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
            Last 12 months
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-content-primary">
            {last12MonthsSignups}
          </p>
        </div>
      </div>

      {totalSignups === 0 ? (
        <div className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-8 text-center text-sm text-content-tertiary">
          No signups yet.
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-5">
            <div className="flex h-48 items-end gap-1.5 sm:gap-2">
              {months.map((month) => (
                <div
                  key={month.monthKey}
                  className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
                  title={`${month.monthLabel}: ${month.newSignups}`}
                >
                  <span className="mb-1 truncate text-center font-mono text-[10px] text-content-tertiary">
                    {month.newSignups}
                  </span>
                  <div
                    className="w-full rounded-t bg-brand/70 transition-colors group-hover:bg-brand"
                    style={{ height: `${Math.max(2, Math.round((month.newSignups / maxCount) * 100))}%` }}
                    aria-hidden="true"
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5 sm:gap-2">
              {months.map((month) => (
                <span
                  key={month.monthKey}
                  className="min-w-0 flex-1 truncate text-center font-mono text-[9px] uppercase text-content-tertiary"
                >
                  {month.monthLabel.split(' ')[0]}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border border-stroke-default">
            <table className="w-full min-w-[360px] text-left text-sm">
              <thead className="bg-bg-elevated font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">
                <tr>
                  <th className="px-4 py-3 font-bold">Month</th>
                  <th className="px-4 py-3 font-bold">New signups</th>
                  <th className="px-4 py-3 font-bold">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke-subtle bg-bg-surface">
                {months.map((month, index) => {
                  const previous = index > 0 ? months[index - 1].newSignups : month.newSignups;
                  const change = month.newSignups - previous;
                  return (
                    <tr key={month.monthKey}>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-content-secondary">
                        {month.monthLabel}
                      </td>
                      <td className="px-4 py-3 text-content-primary">{month.newSignups}</td>
                      <td className={`px-4 py-3 ${change > 0 ? 'text-status-success' : 'text-content-tertiary'}`}>
                        {change > 0 ? `+${change}` : change === 0 ? '—' : change}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
