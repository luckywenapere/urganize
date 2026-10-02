'use client';

import { useCallback, useEffect, useState } from 'react';
import { isCreditsEnabled } from '@/lib/credits/config';
import type { CreditAccount } from '@/lib/credits/allowance';
import { supabase } from '@/lib/supabase/client';

/**
 * How many UrgAns credits the team has, for the line that shows it BEFORE a
 * credit-spending action runs. Null when credits are off, when the number is
 * not known yet, or when it could not be read: the callers then say only the
 * estimate, because a wrong balance is worse than none.
 *
 * Reads the same endpoint the usage strip does, so the two cannot disagree.
 * `refresh` is for after an action settles, when the balance has just moved.
 */
export function useCreditBalance(): {
  balance: number | null;
  /** subscriber, trial or credits_only: decides which rate a pack is bought at. */
  account: CreditAccount | null;
  refresh: () => Promise<void>;
} {
  const [balance, setBalance] = useState<number | null>(null);
  const [account, setAccount] = useState<CreditAccount | null>(null);

  const refresh = useCallback(async () => {
    if (!isCreditsEnabled()) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const response = await fetch('/api/urgans/usage', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) return;
      const body = (await response.json().catch(() => null)) as {
        credits?: { total?: unknown; account?: unknown };
      } | null;
      const total = body?.credits?.total;
      setBalance(typeof total === 'number' && Number.isFinite(total) ? total : null);
      const kind = body?.credits?.account;
      setAccount(kind === 'subscriber' || kind === 'trial' || kind === 'credits_only' ? kind : null);
    } catch {
      // Unreadable: say nothing rather than guess.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balance, account, refresh };
}
