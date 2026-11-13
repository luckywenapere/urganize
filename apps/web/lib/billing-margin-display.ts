import { formatNaira } from './money';
import type { MarginTeamRow } from './billing-margin';

// How /admin/billing shows the margin numbers (2026-11-12, #1241; founder
// approved the mock). Display only: every number is worked out by
// lib/billing-margin.ts exactly as before, and this only rounds it for the eye
// and adds the columns up for the total row.

/** A team keeping less than this share of what it pays is shown in red. */
export const THIN_MARGIN_SHARE = 0.2;

/** Kobo to whole naira, "−" for a loss: ₦1,748, −₦254. */
export function wholeNaira(kobo: number): string {
  if (!Number.isFinite(kobo)) return '—';
  const naira = Math.round(kobo / 100);
  if (naira === 0) return '₦0';
  return naira < 0 ? `−${formatNaira(-naira * 100)}` : formatNaira(naira * 100);
}

/** A share (0..1, can go below 0) as a whole percent; a dash when there is none. */
export function wholePercent(share: number | null): string {
  if (share === null || !Number.isFinite(share)) return '—';
  const value = Math.round(share * 100);
  return `${value === 0 ? 0 : value}%`;
}

/** True when a team keeps too little of what it pays (or loses money). */
export function isThinMargin(share: number | null): boolean {
  return share !== null && share < THIN_MARGIN_SHARE;
}

/** The total row: each money column added up, in kobo, before any rounding. */
export function marginColumnTotals(rows: readonly MarginTeamRow[]) {
  return rows.reduce(
    (sum, row) => ({
      cashKobo: sum.cashKobo + row.cashMonthKobo,
      paystackFeeKobo: sum.paystackFeeKobo + row.paystackFeeMonthKobo,
      trmOwedKobo: sum.trmOwedKobo + row.trmOwedMonthKobo,
      creditsUsed: sum.creditsUsed + row.creditsUsed,
      creditCostKobo: sum.creditCostKobo + row.creditCostKobo,
      contributionKobo: sum.contributionKobo + row.contributionKobo,
    }),
    { cashKobo: 0, paystackFeeKobo: 0, trmOwedKobo: 0, creditsUsed: 0, creditCostKobo: 0, contributionKobo: 0 }
  );
}
