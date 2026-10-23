import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getTierPrice,
  monthlyEquivalentKobo,
  PRICING_TIER_ORDER,
  tierHighlights,
  type BillingInterval,
} from '@urganize/pricing';
import {
  DEFAULT_TRM_FEE_LABEL_ANNUAL_KOBO,
  DEFAULT_TRM_FEE_MANAGER_ANNUAL_KOBO,
  intervalCoveringPeriod,
  isDistributionEntitled,
  ledgerEntryForPayment,
  ledgerMonthRange,
  monthlyTrmFeeKobo,
  readRevenueShareBps,
  readTrmFeeConfig,
  trmLedgerCsv,
  trmPlanFor,
  type TrmFeeConfig,
} from './trm/partner-fee';
import { decideDistributionAccess, prepayOffers } from './distribution-entitlement';
import {
  estimatePaystackFeeKobo,
  mapPaystackChannel,
  marginRow,
  marginTotals,
  readCreditCostKobo,
  readFixedCostsKobo,
} from './billing-margin';

// The TRM fee and the margin view (founder, 2026-10-22), built on the
// self-serve prices: Solo ₦5,000 (since 2026-10-23), Manager ₦30,000, Label ₦60,000 a month,
// 6 months for 5, a year for 10. Manager and Label include distribution and we
// owe TRM a fixed fee per team. Every number here is kobo unless a name says
// naira.

const ROOT = join(__dirname, '..');
const NOW = new Date('2026-10-22T09:00:00.000Z');
const INTERVALS: BillingInterval[] = ['monthly', 'semiannual', 'annual'];

function config(over: Partial<TrmFeeConfig> = {}): TrmFeeConfig {
  return { ...readTrmFeeConfig({}), ...over };
}

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

/** The body of a top-level function, up to its closing brace. */
function functionBody(text: string, signature: string): string {
  const start = text.indexOf(signature);
  expect(start, signature).toBeGreaterThan(-1);
  const rest = text.slice(start);
  return rest.slice(0, rest.search(/\r?\n\}\r?\n/));
}

describe('TRM fee config', () => {
  it('defaults to a fixed fee billed month by month, at the quoted yearly figures', () => {
    const c = readTrmFeeConfig({});
    expect(c.costBasis).toBe('fixed');
    expect(c.billingMode).toBe('monthly_prorata');
    expect(c.feeAnnualKobo).toEqual({ manager: 2_010_000, label: 10_100_000 });
    expect(c.distributionRequiresPrepay).toBe(false);
  });

  it('reads every env var, and falls back rather than to zero', () => {
    const c = readTrmFeeConfig({
      TRM_COST_BASIS: 'percent',
      TRM_REVENUE_SHARE_PCT: '12.5',
      TRM_BILLING_MODE: 'annual_upfront',
      TRM_FEE_MANAGER_ANNUAL_KOBO: '3000000',
      TRM_FEE_LABEL_ANNUAL_KOBO: 'not a number',
      DISTRIBUTION_REQUIRES_PREPAY: 'true',
    });
    expect(c.costBasis).toBe('percent');
    expect(c.revenueShareBps).toBe(1250);
    expect(c.billingMode).toBe('annual_upfront');
    expect(c.feeAnnualKobo.manager).toBe(3_000_000);
    expect(c.feeAnnualKobo.label).toBe(DEFAULT_TRM_FEE_LABEL_ANNUAL_KOBO);
    expect(c.distributionRequiresPrepay).toBe(true);
  });

  it('reads an unset or blank fee as the default, never as zero', () => {
    for (const blank of [undefined, '', '  ']) {
      const c = readTrmFeeConfig({ TRM_FEE_MANAGER_ANNUAL_KOBO: blank, TRM_FEE_LABEL_ANNUAL_KOBO: blank });
      expect(c.feeAnnualKobo).toEqual({ manager: 2_010_000, label: 10_100_000 });
    }
  });

  it('treats percent with no readable share as fixed', () => {
    expect(readTrmFeeConfig({ TRM_COST_BASIS: 'percent' }).costBasis).toBe('fixed');
    expect(readTrmFeeConfig({ TRM_COST_BASIS: 'percent', TRM_REVENUE_SHARE_PCT: '0' }).costBasis).toBe('fixed');
    expect(readRevenueShareBps('101')).toBeNull();
    expect(readRevenueShareBps('10')).toBe(1000);
  });
});

describe('who gets distribution', () => {
  it('maps Manager to TRM Single Artist and Label to TRM Label, and nothing else', () => {
    expect(trmPlanFor('manager')).toBe('single_artist');
    expect(trmPlanFor('label')).toBe('label');
    for (const other of ['solo', 'enterprise', 'monthly', 'annual', 'access', 'custom', null]) {
      expect(trmPlanFor(other), String(other)).toBeNull();
    }
  });

  it('never entitles Solo, on any period, with the gate on or off', () => {
    for (const interval of INTERVALS) {
      for (const requiresPrepay of [false, true]) {
        expect(isDistributionEntitled({ plan: 'solo', interval, requiresPrepay })).toBe(false);
        for (const mode of ['monthly_prorata', 'annual_upfront'] as const) {
          for (const costBasis of ['fixed', 'percent'] as const) {
            const entry = ledgerEntryForPayment({
              plan: 'solo',
              interval,
              amountPaidKobo: 800_000,
              chargedAt: NOW,
              config: config({ billingMode: mode, costBasis, revenueShareBps: 1000, distributionRequiresPrepay: requiresPrepay }),
            });
            expect(entry).toBeNull();
          }
        }
      }
    }
    expect(monthlyTrmFeeKobo('solo', config())).toBe(0);
  });

  it('never entitles a legacy plan id, which was sold without distribution', () => {
    for (const plan of ['monthly', 'annual', 'access', 'custom']) {
      expect(isDistributionEntitled({ plan, interval: 'annual', requiresPrepay: false })).toBe(false);
    }
  });

  it('with the prepay gate on, a monthly Manager or Label team is not entitled until it prepays', () => {
    for (const plan of ['manager', 'label']) {
      expect(isDistributionEntitled({ plan, interval: 'monthly', requiresPrepay: true })).toBe(false);
      expect(isDistributionEntitled({ plan, interval: 'semiannual', requiresPrepay: true })).toBe(true);
      expect(isDistributionEntitled({ plan, interval: 'annual', requiresPrepay: true })).toBe(true);
      expect(isDistributionEntitled({ plan, interval: 'monthly', requiresPrepay: false })).toBe(true);
    }
  });
});

describe('the pricing cards', () => {
  it('Manager, Label and Group say distribution is included; Solo says nothing about it', () => {
    expect(tierHighlights('manager')).toContain('Distribution included');
    expect(tierHighlights('label')).toContain('Distribution included');
    expect(tierHighlights('enterprise')).toContain('Distribution included');
    expect(tierHighlights('solo').some((line) => /distribution/i.test(line))).toBe(false);
  });

  it('no card still says distribution goes through a partner the team pays', () => {
    for (const id of PRICING_TIER_ORDER) {
      expect(tierHighlights(id).join(' ')).not.toMatch(/through our partner/i);
    }
  });

  it('with the prepay gate on, the monthly view says it needs 6 months or a year', () => {
    expect(tierHighlights('manager', { interval: 'monthly', distributionRequiresPrepay: true })).toContain(
      'Distribution on 6-month and yearly plans'
    );
    expect(tierHighlights('manager', { interval: 'semiannual', distributionRequiresPrepay: true })).toContain(
      'Distribution included'
    );
  });
});

describe('what one payment owes TRM', () => {
  const pay = (plan: string, interval: BillingInterval, c: TrmFeeConfig, covered: Date | null = null) =>
    ledgerEntryForPayment({
      plan,
      interval,
      amountPaidKobo: getTierPrice(plan as 'manager', interval)?.minorUnit ?? 0,
      chargedAt: NOW,
      config: c,
      upfrontCoveredUntil: covered,
    });

  it('Manager monthly, pro-rata: ₦1,675.00 a month', () => {
    const entry = pay('manager', 'monthly', config());
    expect(entry?.owedKobo).toBe(167_500);
    expect(entry?.trmPlan).toBe('single_artist');
    expect(entry?.serviceMonths).toBe(1);
    expect(entry?.entryKind).toBe('period');
  });

  it('Label monthly, pro-rata: ₦8,416.67 a month', () => {
    const entry = pay('label', 'monthly', config());
    expect(entry?.owedKobo).toBe(841_667);
    expect(entry?.trmPlan).toBe('label');
  });

  it('Manager 6 months: ₦10,050 pro-rata, ₦20,100 up front', () => {
    expect(pay('manager', 'semiannual', config())?.owedKobo).toBe(1_005_000);
    expect(pay('manager', 'semiannual', config())?.serviceMonths).toBe(6);
    const upfront = pay('manager', 'semiannual', config({ billingMode: 'annual_upfront' }));
    expect(upfront?.owedKobo).toBe(2_010_000);
    expect(upfront?.entryKind).toBe('upfront');
    expect(upfront?.serviceMonths).toBe(12);
  });

  it('a year pro-rata owes the whole yearly fee, and up front owes it once', () => {
    expect(pay('manager', 'annual', config())?.owedKobo).toBe(DEFAULT_TRM_FEE_MANAGER_ANNUAL_KOBO);
    expect(pay('label', 'annual', config())?.owedKobo).toBe(DEFAULT_TRM_FEE_LABEL_ANNUAL_KOBO);
    const upfront = config({ billingMode: 'annual_upfront' });
    const covered = new Date('2027-06-01T00:00:00.000Z');
    // A year already paid up front covers this payment: nothing more is owed.
    expect(pay('label', 'monthly', upfront, covered)).toBeNull();
    // That year has ended: the next payment opens a new one.
    expect(pay('label', 'monthly', upfront, new Date('2026-10-01T00:00:00.000Z'))?.owedKobo).toBe(
      DEFAULT_TRM_FEE_LABEL_ANNUAL_KOBO
    );
  });

  it('percent basis owes a share of what the team paid, whatever the period', () => {
    const c = config({ costBasis: 'percent', revenueShareBps: 1000 });
    expect(pay('manager', 'monthly', c)?.owedKobo).toBe(300_000);
    expect(pay('manager', 'semiannual', c)?.owedKobo).toBe(1_500_000);
    expect(pay('label', 'annual', c)?.owedKobo).toBe(6_000_000);
    expect(pay('label', 'annual', c)?.feeAnnualKobo).toBeNull();
  });

  it('every combination is a whole number of kobo, never negative, and dated', () => {
    for (const plan of ['manager', 'label']) {
      for (const interval of INTERVALS) {
        for (const billingMode of ['monthly_prorata', 'annual_upfront'] as const) {
          for (const costBasis of ['fixed', 'percent'] as const) {
            for (const distributionRequiresPrepay of [false, true]) {
              const entry = pay(
                plan,
                interval,
                config({ billingMode, costBasis, revenueShareBps: 750, distributionRequiresPrepay })
              );
              const label = `${plan}/${interval}/${billingMode}/${costBasis}/${distributionRequiresPrepay}`;
              if (distributionRequiresPrepay && interval === 'monthly') {
                expect(entry, label).toBeNull();
                continue;
              }
              expect(entry, label).not.toBeNull();
              expect(Number.isInteger(entry!.owedKobo), label).toBe(true);
              expect(entry!.owedKobo, label).toBeGreaterThan(0);
              expect(entry!.periodEnd.getTime(), label).toBeGreaterThan(entry!.periodStart.getTime());
            }
          }
        }
      }
    }
  });

  it('a hand-set period reads as the interval it covers, so Mark paid never bills a year for a month', () => {
    expect(intervalCoveringPeriod(NOW, '2026-11-22T09:00:00.000Z')).toBe('monthly');
    expect(intervalCoveringPeriod(NOW, '2027-04-22T09:00:00.000Z')).toBe('semiannual');
    expect(intervalCoveringPeriod(NOW, '2027-10-22T09:00:00.000Z')).toBe('annual');
    expect(intervalCoveringPeriod(NOW, 'not a date')).toBe('monthly');
  });
});

describe('every paid period records the fee, in one place', () => {
  const recorder = functionBody(
    source('lib/referrals-server.ts'),
    'export async function recordSubscriptionCharge('
  );

  it('records every payment whether or not referrals are on (the margin view needs them all)', () => {
    // The flag only decides whether the row can earn commission, never whether
    // it is written. See chargeExclusionWhenRecorded.
    expect(recorder).not.toMatch(/!\s*isReferralsEnabled\(\)/);
  });

  it('writes the TRM fee from there, never for a plan-change top-up, and only with a named period', () => {
    expect(recorder).toContain('recordTrmFeeForPayment(');
    expect(recorder).toMatch(/input\.source !== 'plan_change' && input\.interval/);
  });

  it('every caller names the period it was paid for', () => {
    const callers = [
      'app/api/webhooks/paystack/route.ts',
      'lib/self-serve-server.ts',
      'app/api/admin/teams/route.ts',
    ];
    for (const file of callers) {
      const text = source(file);
      const calls = text.split('recordSubscriptionCharge(admin, {').slice(1)
        .concat(text.split('recordSubscriptionCharge(client, {').slice(1));
      expect(calls.length, file).toBeGreaterThan(0);
      for (const call of calls) {
        const args = call.slice(0, call.indexOf('});'));
        expect(args, file).toMatch(/\binterval[,:]/);
        expect(args, file).toContain('channel:');
      }
    }
  });

  it('nothing else calls the ledger writer', () => {
    const files = ['app', 'lib', 'components'].flatMap((dir) => walk(join(ROOT, dir)));
    const callers = files
      .filter((file) => /recordTrmFeeForPayment\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file).replace(/\\/g, '/'))
      .sort();
    expect(callers).toEqual(['lib/referrals-server.ts', 'lib/trm/partner-ledger-server.ts']);
  });
});

describe('the monthly statement for TRM', () => {
  it('lists each entry, sums the total, and neutralises formula-looking cells', () => {
    const csv = trmLedgerCsv([
      {
        charge_reference: 'ref_1',
        workspace_id: 'w1',
        team_name: '=HYPERLINK("x")',
        entry_kind: 'period',
        plan: 'manager',
        trm_plan: 'single_artist',
        cost_basis: 'fixed',
        billing_mode: 'monthly_prorata',
        fee_annual_kobo: 2_010_000,
        revenue_share_bps: null,
        service_months: 1,
        amount_paid_kobo: 3_000_000,
        owed_kobo: 167_500,
        period_start: '2026-10-22T09:00:00.000Z',
        period_end: '2026-11-22T09:00:00.000Z',
      },
      {
        charge_reference: 'ref_2',
        workspace_id: 'w2',
        team_name: 'North',
        entry_kind: 'period',
        plan: 'label',
        trm_plan: 'label',
        cost_basis: 'fixed',
        billing_mode: 'monthly_prorata',
        fee_annual_kobo: 10_100_000,
        revenue_share_bps: null,
        service_months: 1,
        amount_paid_kobo: 6_000_000,
        owed_kobo: 841_667,
        period_start: '2026-10-05T00:00:00.000Z',
        period_end: '2026-11-05T00:00:00.000Z',
      },
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"Single Artist"');
    expect(csv).toContain('"1675.00"');
    expect(csv).toContain('"8416.67"');
    expect(csv.trim().split('\r\n').at(-1)).toContain('"10091.67"');
  });

  it('reads a month, defaulting to this one, and refuses anything else', () => {
    expect(ledgerMonthRange('2026-10', NOW)?.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(ledgerMonthRange('2026-12', NOW)?.to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(ledgerMonthRange(null, NOW)?.label).toBe('2026-10');
    expect(ledgerMonthRange('2026-13', NOW)).toBeNull();
    expect(ledgerMonthRange('Oct 2026', NOW)).toBeNull();
  });
});

describe('the Distribute step', () => {
  it('flag on: a paying monthly Manager needs a prepaid period; flag off: included', () => {
    const base = { accessState: 'paid', plan: 'manager', interval: 'monthly' as const, expiresAt: '2026-11-20T00:00:00Z' };
    expect(decideDistributionAccess({ ...base, requiresPrepay: true })).toEqual({ state: 'needs_prepay', tier: 'manager' });
    expect(decideDistributionAccess({ ...base, requiresPrepay: false })).toMatchObject({ state: 'included', tier: 'manager' });
    expect(decideDistributionAccess({ ...base, interval: 'semiannual', requiresPrepay: true })).toMatchObject({
      state: 'included',
    });
  });

  it('Solo, no plan, a trial and a lapse are not on the plan', () => {
    const base = { interval: 'annual' as const, expiresAt: null, requiresPrepay: false };
    expect(decideDistributionAccess({ ...base, accessState: 'paid', plan: 'solo' })).toEqual({
      state: 'not_on_plan',
      reason: 'solo',
    });
    expect(decideDistributionAccess({ ...base, accessState: 'paid', plan: null })).toEqual({
      state: 'not_on_plan',
      reason: 'no_plan',
    });
    expect(decideDistributionAccess({ ...base, accessState: 'trial', plan: 'label' })).toEqual({
      state: 'not_on_plan',
      reason: 'no_plan',
    });
    expect(decideDistributionAccess({ ...base, accessState: 'read_only', plan: 'label' })).toEqual({
      state: 'not_on_plan',
      reason: 'lapsed',
    });
  });

  it('offers 6 months first, then a year, each with its saving', () => {
    expect(prepayOffers('manager')).toEqual([
      { interval: 'semiannual', priceKobo: 15_000_000, savingNaira: 30_000 },
      { interval: 'annual', priceKobo: 30_000_000, savingNaira: 60_000 },
    ]);
  });
});

describe('locked prices', () => {
  it('a renewal records what Paystack charged and never re-prices or re-locks', () => {
    const body = functionBody(source('app/api/webhooks/paystack/route.ts'), 'async function applyRenewal(');
    expect(body).toContain('amount: amountMinorUnit');
    expect(body).not.toMatch(/getTierPrice|getTierMinorUnit|price_locked_kobo|plan_version/);
  });

  it('a new card checkout and a paid transfer period lock the price they were charged', () => {
    const card = functionBody(source('app/api/webhooks/paystack/route.ts'), 'async function applyInitialOrManualCharge(');
    expect(card).toContain('price_locked_kobo: amountMinorUnit');
    expect(card).toContain('isMissingColumnError');
    const transfer = functionBody(source('lib/self-serve-server.ts'), 'export async function applyTransferPeriod(');
    expect(transfer).toContain('price_locked_kobo: input.amountKobo');
    expect(transfer).toContain('isMissingColumnError');
  });
});

describe('the margin view', () => {
  it('prices Paystack fees from its published rates', () => {
    // Card: 1.5% + ₦100, the ₦100 waived under ₦2,500, capped at ₦2,000.
    expect(estimatePaystackFeeKobo(2_000_00, 'card')).toBe(30_00);
    expect(estimatePaystackFeeKobo(30_000_00, 'card')).toBe(550_00);
    expect(estimatePaystackFeeKobo(1_000_000_00, 'card')).toBe(2_000_00);
    // Transfer: 1%, capped at ₦300.
    expect(estimatePaystackFeeKobo(8_000_00, 'transfer')).toBe(80_00);
    expect(estimatePaystackFeeKobo(60_000_00, 'transfer')).toBe(300_00);
    // Paid straight to our bank: no Paystack fee. Unknown: priced as a card.
    expect(estimatePaystackFeeKobo(60_000_00, 'direct_transfer')).toBe(0);
    expect(estimatePaystackFeeKobo(30_000_00, 'other')).toBe(550_00);
    expect(mapPaystackChannel('dedicated_nuban')).toBe('transfer');
    expect(mapPaystackChannel('ussd')).toBe('other');
  });

  it('spreads a prepaid period over its months and works out the contribution', () => {
    const row = marginRow(
      {
        workspaceId: 'w',
        teamName: 'T',
        plan: 'manager',
        interval: 'semiannual',
        channel: 'transfer',
        path: 'self_serve',
        periodAmountKobo: 15_000_000,
        trmOwedMonthKobo: 167_500,
        creditsUsed: 100,
      },
      684
    );
    expect(row.cashMonthKobo).toBe(2_500_000);
    expect(row.paystackFeeMonthKobo).toBe(5_000);
    expect(row.creditCostKobo).toBe(68_400);
    expect(row.contributionKobo).toBe(2_500_000 - 5_000 - 167_500 - 68_400);

    const totals = marginTotals([row, { ...row, interval: 'monthly' }], 2_000_000);
    expect(totals.payingTeams).toBe(2);
    expect(totals.prepaidTeams).toBe(1);
    expect(totals.breakEvenTeams).toBe(1);
    expect(marginTotals([], 2_000_000).breakEvenTeams).toBeNull();
    expect(marginTotals([row], null).breakEvenTeams).toBeNull();
  });

  it('counts a 6-month payment as a sixth a month, not a whole month (scoreboard MRR too)', () => {
    expect(monthlyEquivalentKobo(15_000_000, 'semiannual')).toBe(2_500_000);
    expect(monthlyEquivalentKobo(30_000_000, 'annual')).toBe(2_500_000);
    expect(monthlyEquivalentKobo(3_000_000, 'monthly')).toBe(3_000_000);
    expect(source('lib/scoreboard.ts')).toContain('monthlyEquivalentKobo(amount, interval)');
  });

  it('reads its env with safe fallbacks', () => {
    expect(readCreditCostKobo(undefined)).toBe(684);
    expect(readCreditCostKobo('0')).toBe(684);
    expect(readCreditCostKobo('700')).toBe(700);
    expect(readFixedCostsKobo(undefined)).toBeNull();
    expect(readFixedCostsKobo('500000000')).toBe(500_000_000);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('who writes the TRM ledger', () => {
  it('only lib/trm/partner-ledger-server.ts touches trm_partner_ledger', () => {
    const touching = ['app', 'lib', 'components']
      .flatMap((dir) => walk(join(ROOT, dir)))
      .filter((file) => /from\(\s*['"]trm_partner_ledger['"]\s*\)/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file).replace(/\\/g, '/'));
    expect(touching).toEqual(['lib/trm/partner-ledger-server.ts']);
  });
});
