'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { DIRECTORY_ROLE_LABELS } from '@/lib/directory-roles';
import type { DirectorySummary } from '@/lib/directory-admin-summary';

// /admin/directory — supply against demand, one row per role.
//
// The question this page exists to answer, and the only one a cold-start
// marketplace has: which roles are managers asking for that nobody has
// delivered. That is the "recruit these" list at the top; everything below it
// is the working out.
//
// Follows the /admin/urgans gate/load pattern exactly (authLoading -> !user ->
// redirect; the backing GET's 401/403 is the real gate). Read only.

type DirectoryPayload = DirectorySummary & { lookbackDays: number };

const numberFormat = new Intl.NumberFormat('en');

export default function DirectoryAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [payload, setPayload] = useState<DirectoryPayload | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (options: { asGate?: boolean } = {}) => {
      setError(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const response = await fetch('/api/admin/directory', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (response.status === 401 || response.status === 403) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const body = (await response.json().catch(() => ({}))) as Partial<DirectoryPayload> & {
          error?: string;
        };
        if (!response.ok) {
          setError(body.error || 'Could not load the directory.');
          return;
        }
        setPayload({
          lookbackDays: body.lookbackDays ?? 90,
          byRole: body.byRole || [],
          recruit: body.recruit || [],
          totals: body.totals || { listed: 0, withARecord: 0, wanted: 0, unmet: 0 },
        });
        setChecked(true);
      } catch {
        setError('Could not load the directory.');
      }
    },
    [router]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load({ asGate: true });
  }, [authLoading, user, router, load]);

  if (authLoading || !checked) {
    return (
      <AdminPageSkeleton
        titleWidth="w-44"
        descriptionLines={2}
        statCards={{ count: 4, gridClassName: 'sm:grid-cols-4' }}
        table={{ columns: 6, rows: 6 }}
      />
    );
  }

  const totals = payload?.totals ?? { listed: 0, withARecord: 0, wanted: 0, unmet: 0 };

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">Directory</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Who is listed, who has a record we can vouch for, and what managers went
        looking for. Demand covers the last {payload?.lookbackDays ?? 90} days and is counted
        once per team per role per day. Nothing here records what anybody typed.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Listed" value={totals.listed} />
        <Stat label="With a record" value={totals.withARecord} />
        <Stat label="Roles wanted" value={totals.wanted} />
        <Stat label="Went unmet" value={totals.unmet} />
      </div>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-content-primary">Recruit these</h2>
        <p className="mt-1 text-sm text-content-secondary">
          Worst first. A role nobody asked for is not a shortage, so only roles with unmet
          demand are here.
        </p>
        {payload && payload.recruit.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {payload.recruit.map((row) => (
              <li
                key={row.role}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-stroke-default px-3 py-2"
              >
                <span className="text-sm font-medium text-content-primary">
                  {DIRECTORY_ROLE_LABELS[row.role]}
                </span>
                <span className="text-xs text-content-secondary">
                  {numberFormat.format(row.unmet)} unmet of {numberFormat.format(row.wanted)} ·{' '}
                  {row.delivered === 0
                    ? 'nobody has delivered it'
                    : `${numberFormat.format(row.delivered)} could take it`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-content-tertiary">
            Nothing has gone unmet yet.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-content-primary">Every role</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-stroke-default text-left text-xs uppercase tracking-wide text-content-tertiary">
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Listed</th>
                <th className="py-2 pr-3 font-medium">With a record</th>
                <th className="py-2 pr-3 font-medium">Wanted</th>
                <th className="py-2 pr-3 font-medium">Unmet</th>
                <th className="py-2 font-medium">From role gaps</th>
              </tr>
            </thead>
            <tbody>
              {(payload?.byRole || []).map((row) => (
                <tr key={row.role} className="border-b border-stroke-subtle">
                  <td className="py-2 pr-3 text-content-primary">
                    {DIRECTORY_ROLE_LABELS[row.role]}
                  </td>
                  <td className="py-2 pr-3 text-content-secondary">{numberFormat.format(row.listed)}</td>
                  <td className="py-2 pr-3 text-content-secondary">
                    {numberFormat.format(row.delivered)}
                  </td>
                  <td className="py-2 pr-3 text-content-secondary">{numberFormat.format(row.wanted)}</td>
                  <td className="py-2 pr-3 text-content-secondary">{numberFormat.format(row.unmet)}</td>
                  <td className="py-2 text-content-secondary">
                    {numberFormat.format(row.fromRoleGaps)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {payload && payload.byRole.length === 0 ? (
            <p className="py-3 text-sm text-content-tertiary">
              Nobody is listed and nobody has looked yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-stroke-default px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-content-tertiary">{label}</p>
      <p className="mt-1 font-display text-xl text-content-primary">{numberFormat.format(value)}</p>
    </div>
  );
}
