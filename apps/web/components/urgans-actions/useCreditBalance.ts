'use client';

import { useCallback, useEffect, useState } from 'react';
import { isCreditsEnabled } from '@/lib/credits/config';
import type { CreditAccount } from '@/lib/credits/allowance';
import { supabase } from '@/lib/supabase/client';
import { invalidateUrgansUsage, readUrgansUsageShared } from '@/components/app/useUrgansUsage';

/**
 * How many UrgAns credits the team has, for the line that shows it BEFORE a
 * credit-spending action runs. Null when credits are off, when the number is
 * not known yet, or when it could not be read: the callers then say only the
 * estimate, because a wrong balance is worse than none.
 *
 * Reads the same endpoint the usage strip does, so the two cannot disagree.
 * `refresh` is for after an action settles, when the balance has just moved.
 */
export function useCreditBalance(options: { withFirstPlan?: boolean } = {}): {
  balance: number | null;
  /**
   * Only read when `withFirstPlan` is passed (the planner): true when the
   * team's next plan is its free first one (lib/credits/first-plan.ts). Null
   * while unknown, which the planner reads as "show the usual cost line".
   */
  firstPlanFree: boolean | null;
  /** subscriber, trial or credits_only: decides which rate a pack is bought at. */
  account: CreditAccount | null;
  refresh: () => Promise<void>;
} {
  const [balance, setBalance] = useState<number | null>(null);
  const [account, setAccount] = useState<CreditAccount | null>(null);
  const [firstPlanFree, setFirstPlanFree] = useState<boolean | null>(null);
  const withFirstPlan = options.withFirstPlan === true;

  // `force` is true for refresh() (after an action moved the balance) and false
  // for the read on mount, which reuses the shared answer the usage strip
  // already holds instead of asking the server again (#1039).
  const read = useCallback(async (force: boolean) => {
    if (!isCreditsEnabled()) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      if (!withFirstPlan && session.user?.id) {
        if (force) invalidateUrgansUsage();
        const snapshot = await readUrgansUsageShared(session.user.id);
        const credits = snapshot?.credits;
        setBalance(credits && Number.isFinite(credits.total) ? credits.total : null);
        setAccount(credits?.account ?? null);
        return;
      }
      const response = await fetch(withFirstPlan ? '/api/urgans/usage?firstPlan=1' : '/api/urgans/usage', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) return;
      const body = (await response.json().catch(() => null)) as {
        credits?: { total?: unknown; account?: unknown; firstPlanFree?: unknown };
      } | null;
      const total = body?.credits?.total;
      setBalance(typeof total === 'number' && Number.isFinite(total) ? total : null);
      const kind = body?.credits?.account;
      setAccount(kind === 'subscriber' || kind === 'trial' || kind === 'credits_only' ? kind : null);
      const free = body?.credits?.firstPlanFree;
      setFirstPlanFree(typeof free === 'boolean' ? free : null);
    } catch {
      // Unreadable: say nothing rather than guess.
    }
  }, [withFirstPlan]);

  const refresh = useCallback(() => read(true), [read]);

  useEffect(() => {
    void read(false);
  }, [read]);

  return { balance, account, firstPlanFree, refresh };
}
