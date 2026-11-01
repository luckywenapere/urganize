import { INTERVAL_MONTHS, type BillingInterval } from '@urganize/pricing';

// The admin margin view's arithmetic (founder, 2026-10-22). Pure, every number
// kobo, so the page and the tests read one set of rules. Estimates, labelled as
// such on the page: Paystack's fee is worked out from its published price, not
// read from a settlement.

export type PaymentChannel = 'card' | 'transfer' | 'direct_transfer' | 'bachs' | 'other';

/**
 * Paystack's charge.success `data.channel` to ours.
 *   card                          -> card
 *   bank_transfer, dedicated_nuban -> transfer (Pay with Transfer and dedicated
 *                                    accounts, both priced as transfers)
 *   anything else                 -> other
 * 'direct_transfer' never comes from Paystack: it is money paid straight to our
 * bank and marked paid in /admin/teams.
 */
export function mapPaystackChannel(channel: unknown): PaymentChannel {
  const value = String(channel ?? '').trim().toLowerCase();
  if (value === 'card') return 'card';
  if (value === 'bank_transfer' || value === 'dedicated_nuban') return 'transfer';
  return 'other';
}

export function isPaymentChannel(value: unknown): value is PaymentChannel {
  return value === 'card' || value === 'transfer' || value === 'direct_transfer' || value === 'bachs' || value === 'other';
}

const CARD_PERCENT_BPS = 150; // 1.5%
const CARD_FLAT_KOBO = 100_00; // ₦100
const CARD_FLAT_WAIVED_BELOW_KOBO = 2_500_00; // ₦2,500
const CARD_CAP_KOBO = 2_000_00; // ₦2,000
const TRANSFER_PERCENT_BPS = 100; // 1%
const TRANSFER_CAP_KOBO = 300_00; // ₦300
const BACHS_PERCENT_BPS = 500; // 5%

/** Paystack's fee on one payment, kobo, from its published local price.
 *  'other' is priced as a card, the dearer of the two, so the estimate never
 *  flatters the margin. */
export function estimatePaystackFeeKobo(amountKobo: number, channel: PaymentChannel): number {
  const amount = Math.max(0, Math.round(Number(amountKobo) || 0));
  if (amount === 0 || channel === 'direct_transfer') return 0;
  // Bachs (2026-11-01): the fee depends on how they paid (Naira card 2%,
  // transfer 1.5% capped at ₦2,000, mobile money 2 to 3%, dollar card 5% +
  // 40c, crypto 1.5%). Priced at 5%, the dearest, so the estimate never
  // flatters the margin.
  if (channel === 'bachs') return Math.round((amount * BACHS_PERCENT_BPS) / 10_000);
  if (channel === 'transfer') {
    return Math.min(TRANSFER_CAP_KOBO, Math.round((amount * TRANSFER_PERCENT_BPS) / 10_000));
  }
  const flat = amount < CARD_FLAT_WAIVED_BELOW_KOBO ? 0 : CARD_FLAT_KOBO;
  return Math.min(CARD_CAP_KOBO, Math.round((amount * CARD_PERCENT_BPS) / 10_000) + flat);
}

/** What a credit costs us to serve, kobo, from CREDIT_COST_KOBO (default 684,
 *  ₦6.84). An unreadable value falls back to the default, never zero. */
export const DEFAULT_CREDIT_COST_KOBO = 684;
export function readCreditCostKobo(raw: string | undefined): number {
  const value = Number(String(raw ?? '').trim());
  return Number.isFinite(value) && value > 0 ? Math.round(value) : DEFAULT_CREDIT_COST_KOBO;
}

/** FIXED_COSTS_MONTHLY_KOBO, or null when unset (then no break-even shows). */
export function readFixedCostsKobo(raw: string | undefined): number | null {
  const value = Number(String(raw ?? '').trim());
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

export type MarginTeamInput = {
  workspaceId: string;
  teamName: string;
  plan: string;
  interval: BillingInterval;
  channel: PaymentChannel;
  /** How the team came in (workspaces.acquisition_path: self_serve,
   *  concierge, legacy), null when unknown. */
  path: string | null;
  /** What the team's latest payment was, kobo (a full period). */
  periodAmountKobo: number;
  /** What we owe TRM for this month, kobo. */
  trmOwedMonthKobo: number;
  /** UrgAns credits the team used this month. */
  creditsUsed: number;
};

export type MarginTeamRow = MarginTeamInput & {
  cashMonthKobo: number;
  paystackFeeMonthKobo: number;
  creditCostKobo: number;
  contributionKobo: number;
  /** contribution / cash, 0..1 (can go below 0). Null when cash is 0. */
  contributionShare: number | null;
};

/** One team's month: a prepaid period spread evenly over its months. */
export function marginRow(input: MarginTeamInput, creditCostKobo: number): MarginTeamRow {
  const months = INTERVAL_MONTHS[input.interval].covers;
  const cash = Math.round(input.periodAmountKobo / months);
  const fee = Math.round(estimatePaystackFeeKobo(input.periodAmountKobo, input.channel) / months);
  const credits = Math.round(Math.max(0, input.creditsUsed) * creditCostKobo);
  const contribution = cash - fee - input.trmOwedMonthKobo - credits;
  return {
    ...input,
    cashMonthKobo: cash,
    paystackFeeMonthKobo: fee,
    creditCostKobo: credits,
    contributionKobo: contribution,
    contributionShare: cash > 0 ? contribution / cash : null,
  };
}

export type MarginTotals = {
  payingTeams: number;
  prepaidTeams: number;
  mrrKobo: number;
  contributionKobo: number;
  contributionPerTeamKobo: number | null;
  contributionShare: number | null;
  /** Teams needed for contribution to cover fixed costs, rounded up. Null when
   *  fixed costs are unset or contribution per team is not positive. */
  breakEvenTeams: number | null;
};

export function marginTotals(rows: readonly MarginTeamRow[], fixedCostsKobo: number | null): MarginTotals {
  const paying = rows.length;
  const mrr = rows.reduce((sum, row) => sum + row.cashMonthKobo, 0);
  const contribution = rows.reduce((sum, row) => sum + row.contributionKobo, 0);
  const perTeam = paying > 0 ? Math.round(contribution / paying) : null;
  return {
    payingTeams: paying,
    prepaidTeams: rows.filter((row) => row.interval !== 'monthly').length,
    mrrKobo: mrr,
    contributionKobo: contribution,
    contributionPerTeamKobo: perTeam,
    contributionShare: mrr > 0 ? contribution / mrr : null,
    breakEvenTeams:
      fixedCostsKobo !== null && perTeam !== null && perTeam > 0
        ? Math.ceil(fixedCostsKobo / perTeam)
        : null,
  };
}
