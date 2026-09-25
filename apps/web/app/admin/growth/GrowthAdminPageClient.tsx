'use client';

// Growth dashboard. Two sections, each from its own route so one data source
// failing never hides the other:
//   - New accounts per calendar month, from the app's own Supabase profiles
//     (GET /api/admin/growth/accounts, founder request 2026-09-25: "analytics
//     page should view monthly sign ups too").
//   - The marketing site's waitlist, cumulative per ISO week over the last 12
//     weeks, from its Neon database (GET /api/admin/growth, ported into the
//     admin hub from apps/homepage on 2026-07-30).
// The charts are plain CSS (components/admin/AdminBarChart.tsx): apps/web
// carries no chart library and a 12-bar chart doesn't justify one.
//
// The two GETs double as the admin gate, as on every admin page: either one
// answering 401/403 bounces to /dashboard. A network failure is NOT treated as
// a refusal any more; it shows as that section's error, so a blip does not
// throw an admin out of the page.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import type { AccountMonthsSummary } from '@/lib/account-months';
import type { WaitlistSummary } from '@/lib/waitlist-weeks';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { AccountsSection, WaitlistSection, type SectionState } from './GrowthSections';

type Loaded<T> = SectionState<T> | { kind: 'denied' };

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

async function loadSection<T>(
  url: string,
  token: string,
  fallbackMessage: string,
  isPayload: (payload: unknown) => payload is T
): Promise<Loaded<T>> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) return { kind: 'denied' };
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
          ? (payload as { error: string }).error
          : '';
      return { kind: 'error', message: message || fallbackMessage };
    }
    return isPayload(payload) ? { kind: 'ok', data: payload } : { kind: 'error', message: fallbackMessage };
  } catch {
    return { kind: 'error', message: fallbackMessage };
  }
}

function isAccountsPayload(payload: unknown): payload is AccountMonthsSummary {
  return (
    Boolean(payload) &&
    typeof (payload as AccountMonthsSummary).total === 'number' &&
    Array.isArray((payload as AccountMonthsSummary).months)
  );
}

function isWaitlistPayload(payload: unknown): payload is WaitlistSummary {
  return (
    Boolean(payload) &&
    typeof (payload as WaitlistSummary).total === 'number' &&
    typeof (payload as WaitlistSummary).beforeWindow === 'number' &&
    Array.isArray((payload as WaitlistSummary).weeks)
  );
}

export default function GrowthAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [accounts, setAccounts] = useState<SectionState<AccountMonthsSummary> | null>(null);
  const [waitlist, setWaitlist] = useState<SectionState<WaitlistSummary> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      let token = '';
      try {
        token = await getAccessToken();
      } catch {
        // Fall through with no token: both routes answer 401 and the gate
        // bounces, exactly as a signed-out visit would.
      }
      const [accountsResult, waitlistResult] = await Promise.all([
        loadSection('/api/admin/growth/accounts', token, 'Could not load new accounts.', isAccountsPayload),
        loadSection('/api/admin/growth', token, 'Could not load growth data.', isWaitlistPayload),
      ]);
      if (cancelled) return;
      if (accountsResult.kind === 'denied' || waitlistResult.kind === 'denied') {
        router.replace('/dashboard');
        return;
      }
      setAccounts(accountsResult);
      setWaitlist(waitlistResult);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  if (authLoading || !user || !accounts || !waitlist) {
    return (
      <AdminPageSkeleton
        titleWidth="w-28"
        sections={[
          {
            statCards: { count: 3, gridClassName: 'grid-cols-1 sm:grid-cols-3', hint: true },
            chart: true,
            table: { columns: 3, rows: 12 },
          },
          {
            statCards: { count: 2, gridClassName: 'grid-cols-1 sm:grid-cols-2' },
            chart: true,
            table: { columns: 3, rows: 12 },
          },
        ]}
      />
    );
  }

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Growth</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        New Urganize accounts each month, and the waitlist each week.
      </p>

      <AccountsSection state={accounts} />
      <WaitlistSection state={waitlist} />
    </div>
  );
}
