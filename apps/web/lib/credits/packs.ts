import type { CreditAccount } from './allowance';

/**
 * The top-up packs (founder, 2026-10-01, round 2). The PRICE is the same for
 * everyone; what differs is the credits it buys, because a subscriber pays 15
 * naira a credit and an account with no subscription pays 30:
 *
 *   price      subscriber   credits-only
 *   1,500            100             50    (the minimum)
 *   3,000            200            100
 *   7,500            500            250
 *   15,000         1,000            500
 *
 * Paid through Paystack, and only these four amounts: no custom amounts.
 *
 * THIS MODULE IS THE TABLE AND NOTHING ELSE. There is no checkout yet: no
 * Paystack initialize call, no webhook branch, no screen, and nothing writes a
 * `topup` ledger row from a purchase. When that is built it must take the credits
 * from `creditsForPack`, decided on the server from the account's state at the
 * moment of purchase and never from the client, and must reject any price that
 * is not in `TOPUP_PACKS`.
 */

export type TopupPack = {
  /** What the customer pays, in naira. Also the pack's identity. */
  priceNaira: number;
  subscriberCredits: number;
  creditsOnlyCredits: number;
};

export const TOPUP_PACKS: readonly TopupPack[] = [
  { priceNaira: 1500, subscriberCredits: 100, creditsOnlyCredits: 50 },
  { priceNaira: 3000, subscriberCredits: 200, creditsOnlyCredits: 100 },
  { priceNaira: 7500, subscriberCredits: 500, creditsOnlyCredits: 250 },
  { priceNaira: 15000, subscriberCredits: 1000, creditsOnlyCredits: 500 },
] as const;

/** The smallest purchase. */
export const MIN_TOPUP_NAIRA = TOPUP_PACKS[0].priceNaira;

export function findPack(priceNaira: unknown): TopupPack | null {
  if (typeof priceNaira !== 'number') return null;
  return TOPUP_PACKS.find((pack) => pack.priceNaira === priceNaira) ?? null;
}

/**
 * What a pack buys for this account, or null for a price that is not a pack. A
 * trial has not subscribed, so it buys at the credits-only rate.
 */
export function creditsForPack(account: CreditAccount, priceNaira: unknown): number | null {
  const pack = findPack(priceNaira);
  if (!pack) return null;
  return account === 'subscriber' ? pack.subscriberCredits : pack.creditsOnlyCredits;
}
