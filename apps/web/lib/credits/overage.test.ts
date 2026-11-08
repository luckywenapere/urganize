import { describe, expect, it } from 'vitest';
import {
  buildOverageState,
  capReachedNotice,
  isOverageReference,
  noCapNotice,
  overageCostKobo,
  overageHeadroom,
  overageRateKobo,
  parseCapNaira,
  shortfall,
} from './overage';
import { ALLOWANCE_CREDITS } from './allowance';

describe('the rate past the allowance', () => {
  it('is ₦20, ₦18, ₦16 and ₦15 a credit, for paying teams only', () => {
    expect(overageRateKobo({ state: 'paid', tier: 'solo' })).toBe(2000);
    expect(overageRateKobo({ state: 'paid', tier: 'manager' })).toBe(1800);
    expect(overageRateKobo({ state: 'paid', tier: 'pro' })).toBe(1600);
    expect(overageRateKobo({ state: 'paid', tier: 'label' })).toBe(1500);
    expect(overageRateKobo({ state: 'trial', tier: 'label' })).toBeNull();
    expect(overageRateKobo({ state: 'comped', tier: 'manager' })).toBeNull();
    expect(overageRateKobo({ state: 'paid', tier: 'founding' })).toBeNull();
    expect(overageRateKobo(undefined)).toBeNull();
  });

  it('keeps the monthly credits the founder approved', () => {
    expect(ALLOWANCE_CREDITS).toMatchObject({ solo: 150, manager: 450, pro: 900, label: 2000 });
  });
});

describe('the cap', () => {
  it('allows what fits under the cap', () => {
    expect(overageHeadroom({ capKobo: 500_000, credits: 0, rateKobo: 1800 })).toBe(277);
    expect(overageHeadroom({ capKobo: 500_000, credits: 270, rateKobo: 1800 })).toBe(7);
    expect(overageHeadroom({ capKobo: 500_000, credits: 300, rateKobo: 1800 })).toBe(0);
  });

  it('allows nothing when off', () => {
    expect(overageHeadroom({ capKobo: 0, credits: 0, rateKobo: 1800 })).toBe(0);
  });

  it('never bills more than the cap', () => {
    expect(overageCostKobo(70, 1800, 500_000)).toBe(126_000);
    expect(overageCostKobo(400, 1800, 500_000)).toBe(500_000);
  });

  it('shows the live tally', () => {
    const state = buildOverageState({ rateKobo: 1800, capKobo: 500_000, credits: 70, windowStart: '2026-11-01', windowEnd: '2026-12-01T00:00:00Z' });
    expect(state.spentKobo).toBe(126_000);
    expect(state.headroomCredits).toBe(207);
  });

  it('reads a typed cap', () => {
    expect(parseCapNaira('5,000')).toBe(5000);
    expect(parseCapNaira('₦ 2000')).toBe(2000);
    expect(parseCapNaira(0)).toBe(0);
    expect(parseCapNaira(-1)).toBeNull();
    expect(parseCapNaira('lots')).toBeNull();
    expect(parseCapNaira(2_000_000)).toBeNull();
  });
});

describe('a turn past the balance', () => {
  it('pays for only what the balance did not cover', () => {
    expect(shortfall(12, 20)).toBe(0);
    expect(shortfall(12, 5)).toBe(7);
    expect(shortfall(12, -3)).toBe(12);
  });
});

describe('what the chat says', () => {
  it('names the cap and the day, in plain words', () => {
    const line = capReachedNotice({ capKobo: 500_000, windowEnd: '2026-12-01T00:00:00Z' }, '1 December');
    expect(line).toBe("You've hit your ₦5,000 cap for this month. AI is paused until 1 December. The owner can raise the cap on the AI credits page.");
    expect(noCapNotice('1 December')).toMatch(/set a monthly cap/);
    for (const text of [line, noCapNotice(null)]) {
      expect(text).not.toMatch(/—/);
      expect(text.toLowerCase()).not.toContain('workspace');
    }
  });

  it('keeps its reference prefix to itself', () => {
    expect(isOverageReference('urgcred-1')).toBe(true);
    expect(isOverageReference('urgcredits-1')).toBe(false);
  });
});
