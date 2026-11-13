import {
  getTierPrice,
  intervalSavingNaira,
  isPricingTierId,
  type BillingInterval,
  type PricingTierId,
} from '@urganize/pricing';
import { isDistributionEntitled } from './trm/partner-fee';

// Whether a team's plan includes distribution right now, for the Distribute
// step (2026-10-22, mock c). Pure and client-safe. The server reads the facts
// (app/api/billing/distribution); the step renders the answer.
//
// THREE ANSWERS
//   included     Pro or Label (or a period that qualifies while
//                DISTRIBUTION_REQUIRES_PREPAY is on), and the team is paying.
//   needs_prepay A monthly Pro or Label team while the flag is on: it
//                needs a 6-month or yearly period.
//   not_on_plan  Solo, Manager, a legacy plan, a trial, no plan, or a lapsed one. The
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
  if (
    input.requiresPrepay &&
    input.interval === 'monthly' &&
    (plan === 'solo_plus' || plan === 'pro' || plan === 'label')
  ) {
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

/** The prepaid period offered to a monthly tier: yearly only, since the
 *  6-month plan is not on sale (founder, 2026-11-13, #1264). Teams already
 *  on 6 months keep distribution; they are just never offered it. */
export function prepayOffers(tier: PricingTierId): PrepayOffer[] {
  const out: PrepayOffer[] = [];
  for (const interval of ['annual'] as const) {
    const price = getTierPrice(tier, interval);
    const saving = intervalSavingNaira(tier, interval);
    if (price && saving !== null) out.push({ interval, priceKobo: price.minorUnit, savingNaira: saving });
  }
  return out;
}
