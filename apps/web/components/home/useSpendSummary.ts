'use client';

import { useEffect, useState } from 'react';
import { loadSpendSummaryFromApi } from '@/lib/release-spend-client';
import type { SpendSummary } from '@/lib/release-spend-server';

/**
 * What the viewer's rollouts spent over the last 90 days, by category, for Home's
 * "Where the money went" card. Asked only for a manager (`enabled`): the server
 * adds up only the rollouts whose spend the viewer may see, so a person who may
 * see none gets nothing back and the card stays out, which is the same as the
 * card being for managers only. Read once per visit and never kept on the
 * device, since it is money. A failed read draws nothing; Home never shows a
 * broken card.
 */
export function useSpendSummary(enabled: boolean): SpendSummary | null {
  const [summary, setSummary] = useState<SpendSummary | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadSpendSummaryFromApi().then((result) => {
      if (!cancelled && result.ok) setSummary(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled ? summary : null;
}
