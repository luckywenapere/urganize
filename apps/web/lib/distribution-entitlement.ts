import {
  getTierPrice,
  intervalSavingNaira,
  isPricingTierId,
  type BillingInterval,
  type PricingTierId,
} from '@urganize/pricing';
import { isDistributionEntitled } from './trm/partner-fee';

// Whether a team's plan includes distribution right now, for the Distribute
// step (pricing v3, mock c). Pure and client-safe. The server reads the facts
// (lib/distribution-entitlement-server.ts); the step renders the answer.
//
// THREE ANSWERS
//   included     Manager or Label (or a period that qualifies while
//                DISTRIBUTION_REQUIRES_PREPAY is on), and the team is paying.
//   needs_prepay A monthly Manager or Label team while the flag is on: one
//                Switch button away.
//   not_on_plan  Solo, a legacy plan, a trial, no plan, or a lapsed one. The
//                own-TRM-plan path (today's Send to TRM) stays open below.
//
// LAPSE IS UNCHANGED: a team in its paid period (including Paystack's retries,
// which the access resolver already counts as paid) is included; once the
// period ends unpaid it is not, so no new sends under the plan. Releases already
// live stay live, because nothing here touches them.

export type DistributionAccess =
  | { state: 'included'; tier: PricingTierId; interval: BillingInterval; until: string | null }
  | { state: 'needs_prepay'; tier: PricingTierId }
  | { state: 'not_on_plan'; reason: 'solo' | 'no_plan' | 'lapsed' };

export function decideDistributionAccess(input: {
  /** The primary team's access state ('paid', 'trial', 'read_only', ...). */
  accessState: string;
  plan: string | null | undefined;
  interval: BillingInterval | null;
  expiresAt: string | null | undefined;
  requiresPrepay: boolean;
}): DistributionAccess {
  const plan = input.plan ?? null;
  if (plan === 'solo') return { state: 'not_on_plan', reason: 'solo' };
  if (!isPricingTierId(plan)) return { state: 'not_on_plan', reason: 'no_plan' };
  if (input.accessState === 'read_only') return { state: 'not_on_plan', reason: 'lapsed' };
  if (input.accessState !== 'paid') return { state: 'not_on_plan', reason: 'no_plan' };

  if (isDistributionEntitled({ plan, interval: input.interval, requiresPrepay: input.requiresPrepay })) {
    return { state: 'included', tier: plan, interval: input.interval ?? 'monthly', until: input.expiresAt ?? null };
  }
  if (input.requiresPrepay && input.interval === 'monthly' && (plan === 'manager' || plan === 'label')) {
    return { state: 'needs_prepay', tier: plan };
  }
  return { state: 'not_on_plan', reason: 'no_plan' };
}

export type PrepayOffer = {
  interval: BillingInterval;
  /** Full price of the period, kobo. */
  priceKobo: number;
  /** Naira saved against paying monthly for the same months. */
  savingNaira: number;
};

/** The two Switch offers for a monthly tier, 6 months first. */
export function prepayOffers(tier: PricingTierId): PrepayOffer[] {
  const out: PrepayOffer[] = [];
  for (const interval of ['six_month', 'annual'] as const) {
    const price = getTierPrice(tier, interval);
    const saving = intervalSavingNaira(tier, interval);
    if (price && saving !== null) out.push({ interval, priceKobo: price.minorUnit, savingNaira: saving });
  }
  return out;
}
