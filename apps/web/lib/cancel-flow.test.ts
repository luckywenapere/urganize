import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL_DISCOUNT_BONUS_DAYS,
  CANCEL_REASONS,
  CANCEL_THANKS_NOTE,
  PAUSE_OPTIONS,
  RETENTION_OFFER_MONTHS,
  addCalendarMonths,
  allRetentionPlanEnvVars,
  budgetBands,
  buildCancelSteps,
  canStartPause,
  cancelThanksTitle,
  cleanCancelText,
  computePauseWindow,
  decideCancelDiscount,
  followUpFor,
  formatNaira,
  isDiscountAvailable,
  isFreshInvite,
  isInviteExtensionAvailable,
  isPauseActive,
  matchBudgetOffer,
  nextCancelStep,
  pauseSweepAction,
  retentionOfferLabel,
  retentionPlanEnvVar,
} from './cancel-flow';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

describe('the flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is on unless set to false (flags ship on)', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FEATURE_CANCEL_FLOW', '');
    expect((await import('./cancel-flow')).isCancelFlowEnabled()).toBe(true);
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FEATURE_CANCEL_FLOW', 'false');
    expect((await import('./cancel-flow')).isCancelFlowEnabled()).toBe(false);
  });
});

describe('reasons', () => {
  it('are exactly the founder list, in order, with no Other', () => {
    expect(CANCEL_REASONS.map((reason) => reason.label)).toEqual([
      "It doesn't fit my budget",
      "I'm taking a break",
      "It's missing features I need",
      "It's hard to use",
      'I found a better alternative',
    ]);
    expect(CANCEL_REASONS.some((reason) => /other/i.test(reason.label))).toBe(false);
  });

  it('match one follow-up each, and a break gets none', () => {
    expect(followUpFor('budget')).toEqual({ kind: 'budget', title: 'What would you pay?' });
    expect(followUpFor('missing_features')).toEqual({ kind: 'text', title: "What's missing?" });
    expect(followUpFor('hard_to_use')).toEqual({ kind: 'text', title: 'What felt hard?' });
    expect(followUpFor('alternative')).toEqual({ kind: 'text', title: 'Which one?' });
    expect(followUpFor('break')).toBeNull();
    expect(followUpFor(null)).toBeNull();
  });
});

describe('buildCancelSteps', () => {
  const base = { discountAvailable: true, inviteAvailable: true, pauseAvailable: true, reason: null };

  it('paid: discount, pause, reason, then the end', () => {
    expect(buildCancelSteps({ ...base, kind: 'paid' })).toEqual([
      'discount',
      'pause',
      'reason',
      'anything',
      'confirm',
      'done',
    ]);
  });

  it('trial: discount, invite, no pause', () => {
    expect(buildCancelSteps({ ...base, kind: 'trial' })).toEqual([
      'discount',
      'invite',
      'reason',
      'anything',
      'confirm',
      'done',
    ]);
  });

  it('drops offers already used', () => {
    expect(
      buildCancelSteps({ kind: 'paid', discountAvailable: false, inviteAvailable: false, pauseAvailable: false, reason: null })
    ).toEqual(['reason', 'anything', 'confirm', 'done']);
  });

  it('adds the follow-up for a reason that has one, never for a break', () => {
    expect(buildCancelSteps({ ...base, kind: 'paid', reason: 'budget' })).toContain('followup');
    expect(buildCancelSteps({ ...base, kind: 'paid', reason: 'break' })).not.toContain('followup');
    expect(nextCancelStep('reason', { ...base, kind: 'paid', reason: 'break' })).toBe('anything');
    expect(nextCancelStep('reason', { ...base, kind: 'paid', reason: 'hard_to_use' })).toBe('followup');
    expect(nextCancelStep('followup', { ...base, kind: 'paid', reason: 'hard_to_use' })).toBe('anything');
  });

  it('always ends at confirm then done', () => {
    expect(nextCancelStep('anything', { ...base, kind: 'trial' })).toBe('confirm');
    expect(nextCancelStep('confirm', { ...base, kind: 'trial' })).toBe('done');
    expect(nextCancelStep('done', { ...base, kind: 'trial' })).toBe('done');
  });
});

describe('once-per-team guards', () => {
  it('the discount is once per team and never for a comped team', () => {
    expect(isDiscountAvailable({ claimedAt: null, comped: false })).toBe(true);
    expect(isDiscountAvailable({ claimedAt: at(-DAY), comped: false })).toBe(false);
    expect(isDiscountAvailable({ claimedAt: null, comped: true })).toBe(false);
  });

  it('the invite extension is trial-only, once, and needs a free seat', () => {
    expect(isInviteExtensionAvailable({ kind: 'trial', usedAt: null, hasSeatRoom: true })).toBe(true);
    expect(isInviteExtensionAvailable({ kind: 'paid', usedAt: null, hasSeatRoom: true })).toBe(false);
    expect(isInviteExtensionAvailable({ kind: 'trial', usedAt: at(-DAY), hasSeatRoom: true })).toBe(false);
    expect(isInviteExtensionAvailable({ kind: 'trial', usedAt: null, hasSeatRoom: false })).toBe(false);
  });

  it('only a fresh invite earns the extension', () => {
    expect(isFreshInvite(at(-5 * 60 * 1000), NOW)).toBe(true);
    expect(isFreshInvite(at(-2 * 60 * 60 * 1000), NOW)).toBe(false);
    expect(isFreshInvite(null, NOW)).toBe(false);
  });
});

describe('decideCancelDiscount', () => {
  it('a paying team gets 3 bonus days on top of any it holds', () => {
    const decision = decideCancelDiscount({
      claimedAt: null,
      comped: false,
      kind: 'paid',
      ownerPaidThrough: at(10 * DAY),
      teamTrialEndsAt: null,
      paidBonusDays: 30,
      now: NOW,
    });
    expect(decision).toEqual({
      kind: 'paid_bonus',
      paidBonusDays: 30 + CANCEL_DISCOUNT_BONUS_DAYS,
      accessUntil: at(43 * DAY),
    });
  });

  it('a trial moves 3 days later', () => {
    const decision = decideCancelDiscount({
      claimedAt: null,
      comped: false,
      kind: 'trial',
      ownerPaidThrough: null,
      teamTrialEndsAt: at(DAY),
      paidBonusDays: 0,
      now: NOW,
    });
    expect(decision).toEqual({ kind: 'trial_extended', trialEndsAt: at(4 * DAY), accessUntil: at(4 * DAY) });
  });

  it('refuses a second claim and a comped team', () => {
    const common = { kind: 'paid' as const, ownerPaidThrough: at(DAY), teamTrialEndsAt: null, paidBonusDays: 0, now: NOW };
    expect(decideCancelDiscount({ ...common, claimedAt: at(-DAY), comped: false }).kind).toBe('already_claimed');
    expect(decideCancelDiscount({ ...common, claimedAt: null, comped: true }).kind).toBe('not_needed');
  });
});

describe('pause dates', () => {
  it('offers exactly 2 weeks to 3 months', () => {
    expect(PAUSE_OPTIONS.map((option) => option.label)).toEqual(['2 weeks', '1 month', '2 months', '3 months']);
  });

  it('starts at the end of the paid period', () => {
    expect(computePauseWindow({ periodEnd: '2026-10-31T09:00:00.000Z', option: '2w', now: NOW })).toEqual({
      pausedFrom: '2026-10-31T09:00:00.000Z',
      pausedUntil: '2026-11-14T09:00:00.000Z',
    });
    expect(computePauseWindow({ periodEnd: '2026-10-31T09:00:00.000Z', option: '3m', now: NOW }).pausedUntil).toBe(
      '2027-01-31T09:00:00.000Z'
    );
  });

  it('starts now when the period already ended or is unknown', () => {
    expect(computePauseWindow({ periodEnd: at(-DAY), option: '1m', now: NOW }).pausedFrom).toBe(NOW.toISOString());
    expect(computePauseWindow({ periodEnd: null, option: '1m', now: NOW }).pausedUntil).toBe('2026-11-14T12:00:00.000Z');
  });

  it('clamps to the end of a short month', () => {
    expect(addCalendarMonths(new Date('2027-01-31T10:00:00.000Z'), 1).toISOString()).toBe('2027-02-28T10:00:00.000Z');
    expect(addCalendarMonths(new Date('2027-11-30T10:00:00.000Z'), 3).toISOString()).toBe('2028-02-29T10:00:00.000Z');
  });

  it('allows one pause per 6 months', () => {
    expect(canStartPause({ lastPausedAt: null, now: NOW })).toBe(true);
    expect(canStartPause({ lastPausedAt: '2026-04-01T00:00:00.000Z', now: NOW })).toBe(true);
    expect(canStartPause({ lastPausedAt: '2026-06-01T00:00:00.000Z', now: NOW })).toBe(false);
  });

  it('a pause is in force only while the subscription is the disabled one', () => {
    expect(isPauseActive({ status: 'cancelled', pausedUntil: at(10 * DAY), now: NOW })).toBe(true);
    expect(isPauseActive({ status: 'active', pausedUntil: at(10 * DAY), now: NOW })).toBe(false);
    expect(isPauseActive({ status: 'cancelled', pausedUntil: at(-DAY), now: NOW })).toBe(false);
  });

  it('the sweep reminds 3 days out once, and ends a pause on its date', () => {
    const base = { status: 'cancelled', reminderSentAt: null, now: NOW };
    expect(pauseSweepAction({ ...base, pausedUntil: at(10 * DAY) })).toBe('none');
    expect(pauseSweepAction({ ...base, pausedUntil: at(2 * DAY) })).toBe('remind');
    expect(pauseSweepAction({ ...base, pausedUntil: at(2 * DAY), reminderSentAt: at(-DAY) })).toBe('none');
    expect(pauseSweepAction({ ...base, pausedUntil: at(-60 * 1000) })).toBe('end');
    expect(pauseSweepAction({ ...base, status: 'active', pausedUntil: at(10 * DAY) })).toBe('end');
    expect(pauseSweepAction({ ...base, pausedUntil: null })).toBe('none');
  });
});

describe('budget bands', () => {
  const labels = (price: number) => budgetBands(price).map((band) => band.label);

  it('Manager matches the founder example exactly', () => {
    // The founder's example was set at the old ₦22,000 price; the shape still holds.
    expect(labels(22_000)).toEqual(['Under ₦10,000', '₦10,000–₦15,000', '₦15,000–₦20,000']);
  });

  it('Manager at ₦25,000 (since the 2026-10-17 reprice) rounds to ₦1,000 steps', () => {
    expect(labels(25_000)).toEqual(['Under ₦11,000', '₦11,000–₦17,000', '₦17,000–₦23,000']);
  });

  it('Manager at ₦30,000 (self-serve reprice, 2026-10-22)', () => {
    expect(labels(30_000)).toEqual(['Under ₦14,000', '₦14,000–₦20,000', '₦20,000–₦27,000']);
  });

  it('Solo and Label follow the same shape', () => {
    // Solo ₦7,500 and Label ₦60,000 since 2026-10-17.
    expect(labels(7_500)).toEqual(['Under ₦3,500', '₦3,500–₦5,000', '₦5,000–₦7,000']);
    expect(labels(8_000)).toEqual(['Under ₦3,500', '₦3,500–₦5,500', '₦5,500–₦7,500']);
    // Solo ₦5,000 since 2026-10-23.
    expect(labels(5_000)).toEqual(['Under ₦2,500', '₦2,500–₦3,500', '₦3,500–₦4,500']);
    expect(labels(60_000)).toEqual(['Under ₦25,000', '₦25,000–₦40,000', '₦40,000–₦55,000']);
  });

  it('every band sits under the plan price and climbs', () => {
    for (const price of [5_000, 7_500, 8_000, 22_000, 25_000, 30_000, 35_000, 50_000, 60_000]) {
      const bands = budgetBands(price);
      expect(bands[0].max).toBeLessThan(bands[1].max);
      expect(bands[1].max).toBeLessThan(bands[2].max);
      expect(bands[2].max).toBeLessThan(price);
    }
  });

  it('formats naira with no decimals', () => {
    expect(formatNaira(15000)).toBe('₦15,000');
  });
});

describe('matchBudgetOffer', () => {
  const codes = { PAYSTACK_PLAN_MANAGER_RETENTION_18000: 'PLN_m18', PAYSTACK_PLAN_MANAGER_RETENTION_24000: 'PLN_m24' };

  it('the lowest band offers the dearest cheaper plan that fits', () => {
    expect(matchBudgetOffer({ tier: 'manager', band: 'low', planCodes: {} })).toEqual({
      kind: 'switch_plan',
      tier: 'solo',
      price: 2_600,
    });
    // Label at ₦100,000 (2026-10-26) has a lowest band under ₦45,000, so
    // Pro at ₦26,000 is the dearest cheaper plan that fits.
    expect(matchBudgetOffer({ tier: 'label', band: 'low', planCodes: {} })).toEqual({
      kind: 'switch_plan',
      tier: 'manager',
      price: 26_000,
    });
    expect(matchBudgetOffer({ tier: 'solo', band: 'low', planCodes: {} })).toBeNull();
  });

  it('middle and top bands keep the plan at the band price for 3 months', () => {
    expect(matchBudgetOffer({ tier: 'manager', band: 'mid', planCodes: codes })).toEqual({
      kind: 'discounted_plan',
      tier: 'manager',
      price: 18_000,
      months: RETENTION_OFFER_MONTHS,
      planCode: 'PLN_m18',
    });
    expect(matchBudgetOffer({ tier: 'manager', band: 'high', planCodes: codes })?.price).toBe(24_000);
  });

  it('hides a discounted offer whose Paystack plan is not configured', () => {
    expect(matchBudgetOffer({ tier: 'manager', band: 'mid', planCodes: {} })).toBeNull();
    expect(matchBudgetOffer({ tier: 'label', band: 'high', planCodes: { PAYSTACK_PLAN_LABEL_RETENTION_90000: '  ' } })).toBeNull();
  });

  it('names the env vars the setup needs', () => {
    expect(retentionPlanEnvVar('manager', 15000)).toBe('PAYSTACK_PLAN_MANAGER_RETENTION_15000');
    expect(allRetentionPlanEnvVars().map((row) => row.envVar)).toEqual([
      'PAYSTACK_PLAN_SOLO_RETENTION_2000',
      'PAYSTACK_PLAN_SOLO_RETENTION_2500',
      'PAYSTACK_PLAN_MANAGER_RETENTION_18000',
      'PAYSTACK_PLAN_MANAGER_RETENTION_24000',
      'PAYSTACK_PLAN_LABEL_RETENTION_70000',
      'PAYSTACK_PLAN_LABEL_RETENTION_90000',
    ]);
  });

  it('words the offers plainly', () => {
    expect(retentionOfferLabel({ kind: 'switch_plan', tier: 'solo', price: 7500 })).toBe('Switch to Emerging for ₦7,500/month');
    expect(
      retentionOfferLabel({ kind: 'discounted_plan', tier: 'manager', price: 15000, months: 3, planCode: 'x' })
    ).toBe('Keep Pro for ₦15,000/month for 3 months');
  });
});

describe('the goodbye', () => {
  it('uses the first name, or none', () => {
    expect(cancelThanksTitle('Oyin Wenapere')).toBe('Thank you, Oyin');
    expect(cancelThanksTitle('')).toBe('Thank you');
    expect(cancelThanksTitle('oyin@example.com')).toBe('Thank you');
  });

  it('says what they built stays, read only', () => {
    expect(CANCEL_THANKS_NOTE).toMatch(/stays right here/);
    expect(CANCEL_THANKS_NOTE).toMatch(/read/);
  });

  it('caps free text', () => {
    expect(cleanCancelText('  hi  ')).toBe('hi');
    expect(cleanCancelText('x'.repeat(5000))).toHaveLength(1000);
    expect(cleanCancelText(undefined)).toBe('');
  });
});
