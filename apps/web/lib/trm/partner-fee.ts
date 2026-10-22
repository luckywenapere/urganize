import {
  INTERVAL_MONTHS,
  distributionIncluded,
  isPricingTierId,
  type BillingInterval,
  type PricingTierId,
} from '@urganize/pricing';

// What Urganize owes TRM Distro for "Distribution included" (founder, 2026-10-22).
//
// Pure: no database, no network. The env readers take the env as an argument so
// the tests can pass their own. lib/trm/partner-ledger-server.ts is the only
// writer of trm_partner_ledger and calls into this for every number.
//
// THE MODEL
//   cost basis   fixed (default): a wholesale fee per entitled team per year,
//                by TRM plan. Manager -> TRM Single Artist, Label -> TRM Label.
//                percent: a share of what the team paid us, for the case TRM
//                prefers a revenue share instead.
//   billing mode monthly_prorata (default): we owe a twelfth of the yearly fee
//                for each month a payment covers, so a 6-month payment owes six
//                twelfths. annual_upfront: we owe the whole year's fee the first
//                time a team pays in a registration year, and nothing more until
//                that year ends.
//   Solo is never entitled. Group (sales-led, invoiced by hand) is not in the
//   ledger: those deals set their own TRM terms.
//
// Every number is kobo and every result is a whole number of kobo.

export type TrmCostBasis = 'fixed' | 'percent';
export type TrmBillingMode = 'monthly_prorata' | 'annual_upfront';
export type TrmPlan = 'single_artist' | 'label';
export type TrmLedgerPlan = 'manager' | 'label';

/** The yearly fee per entitled team, kobo, when TRM_FEE_* is not set. */
export const DEFAULT_TRM_FEE_MANAGER_ANNUAL_KOBO = 2_010_000;
export const DEFAULT_TRM_FEE_LABEL_ANNUAL_KOBO = 10_100_000;

export type TrmFeeConfig = {
  costBasis: TrmCostBasis;
  billingMode: TrmBillingMode;
  feeAnnualKobo: Record<TrmLedgerPlan, number>;
  /** Basis points (1000 = 10%). Only meaningful for percent. */
  revenueShareBps: number | null;
  /** DISTRIBUTION_REQUIRES_PREPAY: monthly teams do not get distribution. */
  distributionRequiresPrepay: boolean;
};

type Env = Record<string, string | undefined>;

function readKobo(raw: string | undefined, fallback: number): number {
  // Number('') is 0, so an unset or blank var must be caught before the parse:
  // reading it as zero would quietly stop recording what we owe TRM.
  const text = String(raw ?? '').trim();
  if (!text) return fallback;
  const value = Number(text);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** "10" or "10.5" -> 1000 or 1050 basis points; anything else -> null. */
export function readRevenueShareBps(raw: string | undefined): number | null {
  const text = String(raw ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const pct = Number(text);
  if (!(pct > 0 && pct <= 100)) return null;
  return Math.round(pct * 100);
}

/**
 * The fee config from env. Anything unreadable falls back to the default rather
 * than to zero, because a zero would quietly stop recording what we owe.
 *
 * percent WITHOUT a readable TRM_REVENUE_SHARE_PCT falls back to fixed: a
 * percent basis with no percent is not a basis, and fixed is what TRM has
 * quoted.
 */
export function readTrmFeeConfig(env: Env = process.env): TrmFeeConfig {
  const revenueShareBps = readRevenueShareBps(env.TRM_REVENUE_SHARE_PCT);
  const wantsPercent = String(env.TRM_COST_BASIS ?? '').trim().toLowerCase() === 'percent';
  return {
    costBasis: wantsPercent && revenueShareBps !== null ? 'percent' : 'fixed',
    billingMode:
      String(env.TRM_BILLING_MODE ?? '').trim().toLowerCase() === 'annual_upfront'
        ? 'annual_upfront'
        : 'monthly_prorata',
    feeAnnualKobo: {
      manager: readKobo(env.TRM_FEE_MANAGER_ANNUAL_KOBO, DEFAULT_TRM_FEE_MANAGER_ANNUAL_KOBO),
      label: readKobo(env.TRM_FEE_LABEL_ANNUAL_KOBO, DEFAULT_TRM_FEE_LABEL_ANNUAL_KOBO),
    },
    revenueShareBps,
    distributionRequiresPrepay:
      String(env.DISTRIBUTION_REQUIRES_PREPAY ?? '').trim().toLowerCase() === 'true',
  };
}

/** Which TRM plan a tier maps to, or null when it is not in the ledger. */
export function trmPlanFor(tier: string | null | undefined): TrmPlan | null {
  if (tier === 'manager') return 'single_artist';
  if (tier === 'label') return 'label';
  return null;
}

/**
 * Does a team on this stored plan and period get "Distribution included"?
 * Takes the stored subscriptions.plan, so a legacy id ('monthly', 'annual',
 * 'access', 'custom') is not entitled: those plans were sold without it.
 */
export function isDistributionEntitled(input: {
  plan: string | null | undefined;
  interval: BillingInterval | null;
  requiresPrepay: boolean;
}): boolean {
  if (!isPricingTierId(input.plan)) return false;
  return distributionIncluded(input.plan as PricingTierId, input.interval, input.requiresPrepay);
}

/**
 * The interval a hand-set period is closest to, for /admin/teams' Mark paid
 * when the admin gave no interval: under about 4 months is monthly, under about
 * 9 is 6 months, anything longer a year. A deal is priced by the period it
 * covers, so this keeps the TRM fee from charging a year for one month.
 */
export function intervalCoveringPeriod(start: Date, endIso: string): BillingInterval {
  const days = (Date.parse(endIso) - start.getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 120) return 'monthly';
  if (days < 270) return 'semiannual';
  return 'annual';
}

export type TrmLedgerEntry = {
  entryKind: 'period' | 'upfront';
  plan: TrmLedgerPlan;
  trmPlan: TrmPlan;
  costBasis: TrmCostBasis;
  billingMode: TrmBillingMode;
  feeAnnualKobo: number | null;
  revenueShareBps: number | null;
  serviceMonths: number;
  amountPaidKobo: number;
  owedKobo: number;
  periodStart: Date;
  periodEnd: Date;
};

function addMonths(start: Date, months: number): Date {
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  return end;
}

/**
 * What one successful payment adds to the ledger, or null for nothing.
 *
 * Null when the payment is not entitled (Solo, a legacy plan, a monthly team
 * while prepay is required), and, on annual_upfront, when a year already paid
 * up front still covers this payment (`upfrontCoveredUntil` after `chargedAt`).
 */
export function ledgerEntryForPayment(input: {
  plan: string | null | undefined;
  interval: BillingInterval;
  amountPaidKobo: number;
  chargedAt: Date;
  config: TrmFeeConfig;
  /** The end of the latest annual_upfront year already in the ledger for this
   *  team, or null. Ignored on the other modes. */
  upfrontCoveredUntil?: Date | null;
}): TrmLedgerEntry | null {
  const { config } = input;
  if (
    !isDistributionEntitled({
      plan: input.plan,
      interval: input.interval,
      requiresPrepay: config.distributionRequiresPrepay,
    })
  ) {
    return null;
  }
  const trmPlan = trmPlanFor(input.plan);
  if (!trmPlan) return null;
  const plan = input.plan as TrmLedgerPlan;
  const paid = Math.max(0, Math.round(Number(input.amountPaidKobo) || 0));
  const months = INTERVAL_MONTHS[input.interval].covers;
  const feeAnnual = config.feeAnnualKobo[plan];

  if (config.costBasis === 'percent') {
    const bps = config.revenueShareBps ?? 0;
    return {
      entryKind: 'period',
      plan,
      trmPlan,
      costBasis: 'percent',
      billingMode: config.billingMode,
      feeAnnualKobo: null,
      revenueShareBps: bps,
      serviceMonths: months,
      amountPaidKobo: paid,
      owedKobo: Math.round((paid * bps) / 10_000),
      periodStart: input.chargedAt,
      periodEnd: addMonths(input.chargedAt, months),
    };
  }

  if (config.billingMode === 'annual_upfront') {
    const covered = input.upfrontCoveredUntil ?? null;
    if (covered && covered.getTime() > input.chargedAt.getTime()) return null;
    return {
      entryKind: 'upfront',
      plan,
      trmPlan,
      costBasis: 'fixed',
      billingMode: 'annual_upfront',
      feeAnnualKobo: feeAnnual,
      revenueShareBps: null,
      serviceMonths: 12,
      amountPaidKobo: paid,
      owedKobo: feeAnnual,
      periodStart: input.chargedAt,
      periodEnd: addMonths(input.chargedAt, 12),
    };
  }

  return {
    entryKind: 'period',
    plan,
    trmPlan,
    costBasis: 'fixed',
    billingMode: 'monthly_prorata',
    feeAnnualKobo: feeAnnual,
    revenueShareBps: null,
    serviceMonths: months,
    amountPaidKobo: paid,
    owedKobo: Math.round((feeAnnual * months) / 12),
    periodStart: input.chargedAt,
    periodEnd: addMonths(input.chargedAt, months),
  };
}

/** What a team costs us in TRM fee per month on fixed monthly_prorata, kobo.
 *  For the admin margin view's estimate when the ledger has nothing yet. */
export function monthlyTrmFeeKobo(plan: string | null | undefined, config: TrmFeeConfig): number {
  const trmPlan = trmPlanFor(plan);
  if (!trmPlan) return 0;
  return Math.round(config.feeAnnualKobo[plan as TrmLedgerPlan] / 12);
}

// ------------------------------------------------------------------ CSV export

export type TrmLedgerCsvRow = {
  charge_reference: string;
  workspace_id: string | null;
  team_name: string | null;
  entry_kind: string;
  plan: string;
  trm_plan: string;
  cost_basis: string;
  billing_mode: string;
  fee_annual_kobo: number | null;
  revenue_share_bps: number | null;
  service_months: number;
  amount_paid_kobo: number;
  owed_kobo: number;
  period_start: string;
  period_end: string;
};

const TRM_PLAN_LABEL: Record<string, string> = {
  single_artist: 'Single Artist',
  label: 'Label',
};

function csvCell(value: string): string {
  // Formula-looking cells are prefixed so a spreadsheet never runs them.
  const safe = /^[=+\-@\t]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function naira(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

/** The monthly statement for TRM, one row per ledger entry. Naira as plain
 *  numbers so the columns sum. Byte-order mark for Excel. */
export function trmLedgerCsv(rows: readonly TrmLedgerCsvRow[]): string {
  const header = [
    'Team',
    'Payment reference',
    'Urganize plan',
    'TRM plan',
    'Cost basis',
    'Billing mode',
    'Service months',
    'Period start',
    'Period end',
    'Team paid (NGN)',
    'Yearly fee (NGN)',
    'Revenue share (%)',
    'Owed to TRM (NGN)',
  ];
  const lines = [header.map(csvCell).join(',')];
  let total = 0;
  for (const row of rows) {
    total += row.owed_kobo;
    lines.push(
      [
        row.team_name ?? row.workspace_id ?? '',
        row.charge_reference,
        row.plan === 'manager' ? 'Manager' : row.plan === 'label' ? 'Label' : row.plan,
        TRM_PLAN_LABEL[row.trm_plan] ?? row.trm_plan,
        row.cost_basis === 'percent' ? 'Percent' : 'Fixed',
        row.billing_mode === 'annual_upfront' ? 'Annual upfront' : 'Monthly pro-rata',
        String(row.service_months),
        row.period_start.slice(0, 10),
        row.period_end.slice(0, 10),
        naira(row.amount_paid_kobo),
        row.fee_annual_kobo === null ? '' : naira(row.fee_annual_kobo),
        row.revenue_share_bps === null ? '' : (row.revenue_share_bps / 100).toFixed(2),
        naira(row.owed_kobo),
      ]
        .map(csvCell)
        .join(',')
    );
  }
  lines.push(['Total', '', '', '', '', '', '', '', '', '', '', '', naira(total)].map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** "2026-10" -> [Oct 1, Nov 1) in UTC, or null. Defaults to this month. */
export function ledgerMonthRange(raw: string | null, now: Date): { from: Date; to: Date; label: string } | null {
  const text = (raw ?? '').trim();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  if (text) {
    const match = /^(\d{4})-(\d{2})$/.exec(text);
    if (!match) return null;
    year = Number(match[1]);
    month = Number(match[2]) - 1;
    if (month < 0 || month > 11) return null;
  }
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 1));
  return { from, to, label: `${year}-${String(month + 1).padStart(2, '0')}` };
}
