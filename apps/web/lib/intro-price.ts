import { INTRO_MONTHS } from '@urganize/pricing';

// The starting price (founder, 2026-10-26): a team paying for the first time
// pays the tier's introMonthlyPrice for its first INTRO_MONTHS monthly payments,
// then the full price. Pure, so the rule is tested in one place.
//
// - Never paid before: all INTRO_MONTHS left.
// - Paid before, and some of it at the starting price: what is left of the six.
//   This holds across a gap, so a team that paid 2 starting-price months, left
//   and came back gets the other 4.
// - Paid before, never at the starting price (every team that paid before the
//   starting price existed, or went straight to yearly): none.

export function introMonthsLeft(input: { paidBefore: boolean; introChargesUsed: number }): number {
  if (!input.paidBefore) return INTRO_MONTHS;
  if (input.introChargesUsed <= 0) return 0;
  return Math.max(0, INTRO_MONTHS - input.introChargesUsed);
}

/** After this payment, should a card subscription move to the full-price Plan?
 *  True on the payment that uses the last starting-price month. */
export function introEndsAfterCharge(introChargesUsedIncludingThis: number): boolean {
  return introChargesUsedIncludingThis >= INTRO_MONTHS;
}
