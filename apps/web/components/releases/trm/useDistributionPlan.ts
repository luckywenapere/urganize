'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BillingInterval, PricingTierId } from '@urganize/pricing';
import { distributionAuthHeaders } from '../useDistributionStatus';

/** What /api/billing/distribution answers (pricing v3, mock c). */
export type DistributionPlan =
  | {
      state: 'included';
      tier: PricingTierId;
      interval: BillingInterval;
      until: string | null;
      requiresPrepay: boolean;
      canSwitch: boolean;
      ownerName: string | null;
      offers: [];
    }
  | {
      state: 'needs_prepay';
      tier: PricingTierId;
      requiresPrepay: boolean;
      canSwitch: boolean;
      ownerName: string | null;
      offers: Array<{ interval: BillingInterval; priceKobo: number; savingNaira: number }>;
      /** How the owner pays (workspaces.payment_method), null when unknown. */
      paymentMethod: 'card' | 'transfer' | 'direct_transfer' | null;
    }
  | {
      state: 'not_on_plan';
      reason: 'solo' | 'no_plan' | 'lapsed';
      requiresPrepay: boolean;
      canSwitch: boolean;
      ownerName: string | null;
      offers: [];
    };

/** The team's plan answer for the Distribute step. Null while loading and when
 *  it cannot be read: the card then shows nothing, and the step works exactly
 *  as it did before (the artist's own TRM plan). */
export function useDistributionPlan(): { plan: DistributionPlan | null; reload: () => Promise<void> } {
  const [plan, setPlan] = useState<DistributionPlan | null>(null);

  const reload = useCallback(async () => {
    try {
      const headers = await distributionAuthHeaders();
      if (!headers) return;
      const response = await fetch('/api/billing/distribution', { headers, cache: 'no-store' });
      if (!response.ok) return;
      const body = (await response.json().catch(() => null)) as DistributionPlan | null;
      if (body && typeof body.state === 'string') setPlan(body);
    } catch {
      // The card is an extra; a failed read must never break the step.
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { plan, reload };
}
