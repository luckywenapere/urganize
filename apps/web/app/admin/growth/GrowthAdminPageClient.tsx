'use client';

// Growth dashboard, ported into the admin hub from
// apps/homepage/app/dashboard/(protected)/growth (founder request,
// 2026-07-30): cumulative signups per ISO week over the last 12 weeks.
// The homepage version renders chart.js; here the bars are plain CSS —
// apps/web doesn't carry chart.js and a 12-bar chart doesn't justify
// adding the dependency (boring stack). The GET doubles as the admin gate.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';

type Week = { weekLabel: string; totalUsers: number };
type GrowthResponse = { total: number; weeks: Week[] };

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export default function GrowthAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [checked, setChecked] = useState(false);
  const [data, setData] = useState<GrowthResponse | null>(null);
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
        const response = await fetch('/api/admin/growth', {
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
          setError(payload.error || 'Could not load growth data.');
          setChecked(true);
          return;
        }
        const payload = (await response.json().catch(() => null)) as GrowthResponse | null;
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
      <div className="grid min-h-[50vh] place-items-center text-content-tertiary">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  const weeks = data?.weeks ?? [];
  const total = data?.total ?? 0;
  const maxCount = Math.max(1, ...weeks.map((week) => week.totalUsers));
  const growthThisWindow =
    weeks.length >= 2 ? weeks[weeks.length - 1].totalUsers - weeks[0].totalUsers : 0;

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Growth</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Cumulative waitlist signups per week (ISO weeks, last 12), from the
        marketing site&rsquo;s Neon database.
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
          <p className="mt-2 font-display text-3xl font-semibold text-content-primary">{total}</p>
        </div>
        <div className="rounded-lg border border-stroke-default bg-bg-surface p-5">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
            Last 12 weeks
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-content-primary">
            {growthThisWindow >= 0 ? `+${growthThisWindow}` : growthThisWindow}
          </p>
        </div>
      </div>

      {weeks.length === 0 ? (
        <div className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-8 text-center text-sm text-content-tertiary">
          No signups yet.
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-5">
            <div className="flex h-48 items-end gap-1.5 sm:gap-2">
              {weeks.map((week) => (
                <div
                  key={week.weekLabel}
                  className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
                  title={`${week.weekLabel}: ${week.totalUsers}`}
                >
                  <span className="mb-1 truncate text-center font-mono text-[10px] text-content-tertiary">
                    {week.totalUsers}
                  </span>
                  <div
                    className="w-full rounded-t bg-brand/70 transition-colors group-hover:bg-brand"
                    style={{ height: `${Math.max(2, Math.round((week.totalUsers / maxCount) * 100))}%` }}
                    aria-hidden="true"
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5 sm:gap-2">
              {weeks.map((week) => (
                <span
                  key={week.weekLabel}
                  className="min-w-0 flex-1 truncate text-center font-mono text-[9px] uppercase text-content-tertiary"
                >
                  {week.weekLabel.split('-')[1] || week.weekLabel}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border border-stroke-default">
            <table className="w-full min-w-[360px] text-left text-sm">
              <thead className="bg-bg-elevated font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">
                <tr>
                  <th className="px-4 py-3 font-bold">Week</th>
                  <th className="px-4 py-3 font-bold">Total users</th>
                  <th className="px-4 py-3 font-bold">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke-subtle bg-bg-surface">
                {weeks.map((week, index) => {
                  const previous = index > 0 ? weeks[index - 1].totalUsers : week.totalUsers;
                  const change = week.totalUsers - previous;
                  return (
                    <tr key={week.weekLabel}>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-content-secondary">
                        {week.weekLabel}
                      </td>
                      <td className="px-4 py-3 text-content-primary">{week.totalUsers}</td>
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
