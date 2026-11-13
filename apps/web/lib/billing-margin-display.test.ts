import { describe, expect, it } from 'vitest';
import { marginRow, marginTotals } from './billing-margin';
import { THIN_MARGIN_SHARE, isThinMargin, marginColumnTotals, wholeNaira, wholePercent } from './billing-margin-display';

// /admin/billing's display (2026-11-12, #1241): whole naira, whole percents, a
// total row, thin margins in red. The sums themselves stay in billing-margin.

describe('rounding for the eye', () => {
  it('shows whole naira, with a minus for a loss', () => {
    expect(wholeNaira(174_792)).toBe('₦1,748');
    expect(wholeNaira(8_208)).toBe('₦82');
    expect(wholeNaira(0)).toBe('₦0');
    expect(wholeNaira(-25_449)).toBe('−₦254');
    expect(wholeNaira(-20)).toBe('₦0');
  });

  it('shows whole percents and a dash for none', () => {
    expect(wholePercent(0.874)).toBe('87%');
    expect(wholePercent(0.085)).toBe('9%');
    expect(wholePercent(-0.12)).toBe('-12%');
    expect(wholePercent(-0.001)).toBe('0%');
    expect(wholePercent(null)).toBe('—');
  });
});

describe('thin margins', () => {
  it('flags anything under the named threshold, losses included', () => {
    expect(THIN_MARGIN_SHARE).toBe(0.2);
    expect(isThinMargin(0.08)).toBe(true);
    expect(isThinMargin(-0.5)).toBe(true);
    expect(isThinMargin(0.2)).toBe(false);
    expect(isThinMargin(0.85)).toBe(false);
    expect(isThinMargin(null)).toBe(false);
  });
});

describe('the total row', () => {
  const rows = [
    marginRow(
      { workspaceId: 'a', teamName: 'A', plan: 'manager', interval: 'monthly', channel: 'card', path: null, periodAmountKobo: 480_000, trmOwedMonthKobo: 12_000, creditsUsed: 11 },
      500
    ),
    marginRow(
      { workspaceId: 'b', teamName: 'B', plan: 'label', interval: 'annual', channel: 'transfer', path: null, periodAmountKobo: 2_400_000, trmOwedMonthKobo: 15_000, creditsUsed: 4 },
      500
    ),
  ];

  it('adds every column up, and its contribution matches the page totals', () => {
    const total = marginColumnTotals(rows);
    expect(total.cashKobo).toBe(rows[0].cashMonthKobo + rows[1].cashMonthKobo);
    expect(total.paystackFeeKobo).toBe(rows[0].paystackFeeMonthKobo + rows[1].paystackFeeMonthKobo);
    expect(total.trmOwedKobo).toBe(27_000);
    expect(total.creditsUsed).toBe(15);
    expect(total.creditCostKobo).toBe(7_500);
    const totals = marginTotals(rows, null);
    expect(total.contributionKobo).toBe(totals.contributionKobo);
    expect(total.cashKobo).toBe(totals.mrrKobo);
  });

  it('is all zeros with no rows', () => {
    expect(marginColumnTotals([])).toEqual({
      cashKobo: 0,
      paystackFeeKobo: 0,
      trmOwedKobo: 0,
      creditsUsed: 0,
      creditCostKobo: 0,
      contributionKobo: 0,
    });
  });
});
