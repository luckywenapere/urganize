'use client';

// The old Growth page's two sections, merged into the bottom of /admin/metrics
// on 2026-10-18 (URG-369). Each from its own route so one data source failing
// never hides the other:
//   - New accounts per calendar month, from the app's own Supabase profiles
//     (GET /api/admin/growth/accounts, founder request 2026-09-25).
//   - The marketing site's waitlist, cumulative per ISO week over the last 12
//     weeks, from its Neon database (GET /api/admin/growth).
// The host page (Metrics) is the gate; a refusal here just shows as that
// section's error.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { AccountMonthsSummary } from '@/lib/account-months';
import type { WaitlistSummary } from '@/lib/waitlist-weeks';
import { Skeleton } from '@/components/admin/ui';
import { AccountsSection, WaitlistSection, type SectionState } from './GrowthSections';

async function loadSection<T>(
  url: string,
  token: string,
  fallbackMessage: string,
  isPayload: (payload: unknown) => payload is T
): Promise<SectionState<T>> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
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

export function GrowthPanels() {
  const [accounts, setAccounts] = useState<SectionState<AccountMonthsSummary> | null>(null);
  const [waitlist, setWaitlist] = useState<SectionState<WaitlistSummary> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let token = '';
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        token = session?.access_token || '';
      } catch {
        // Both routes answer 401 and each section shows its error.
      }
      const [accountsResult, waitlistResult] = await Promise.all([
        loadSection('/api/admin/growth/accounts', token, 'Could not load new accounts.', isAccountsPayload),
        loadSection('/api/admin/growth', token, 'Could not load the waitlist.', isWaitlistPayload),
      ]);
      if (cancelled) return;
      setAccounts(accountsResult);
      setWaitlist(waitlistResult);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div id="growth" className="scroll-mt-8">
      {accounts && waitlist ? (
        <>
          <AccountsSection state={accounts} />
          <WaitlistSection state={waitlist} />
        </>
      ) : (
        <div role="status" aria-busy="true" aria-label="Loading growth" className="mt-8">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-3 h-48 w-full rounded-2xl" />
        </div>
      )}
    </div>
  );
}
