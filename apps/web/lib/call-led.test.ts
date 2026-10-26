import { describe, expect, it } from 'vitest';
import { getTierPrice, isSelfServePurchase } from '@urganize/pricing';
import { needsOnboardingCall, parseSendPaymentLink } from './call-led';

describe('onboarding rules: who pays without a call', () => {
  it('lets only monthly Solo and Manager pay on their own', () => {
    expect(isSelfServePurchase('solo', 'monthly')).toBe(true);
    expect(isSelfServePurchase('manager', 'monthly')).toBe(true);
  });

  it('sends Label to a call on every period', () => {
    for (const period of ['monthly', 'semiannual', 'annual'] as const) {
      expect(needsOnboardingCall('label', period)).toBe(true);
    }
  });

  it('sends every 6-month and yearly plan to a call', () => {
    for (const plan of ['solo', 'manager'] as const) {
      expect(needsOnboardingCall(plan, 'semiannual')).toBe(true);
      expect(needsOnboardingCall(plan, 'annual')).toBe(true);
    }
  });

  it('prices Label at 100,000 a month, 500,000 for 6 months', () => {
    expect(getTierPrice('label', 'monthly')?.amount).toBe(100_000);
    expect(getTierPrice('label', 'semiannual')?.amount).toBe(500_000);
  });
});

describe('send payment link form', () => {
  it('accepts a real email, plan and period', () => {
    expect(parseSendPaymentLink({ email: ' A@B.com ', plan: 'label', period: 'semiannual' })).toEqual({
      ok: true,
      value: { email: 'a@b.com', plan: 'label', period: 'semiannual' },
    });
  });
  it('refuses a bad email, plan or period', () => {
    expect(parseSendPaymentLink({ email: 'nope', plan: 'label', period: 'annual' }).ok).toBe(false);
    expect(parseSendPaymentLink({ email: 'a@b.com', plan: 'gold', period: 'annual' }).ok).toBe(false);
    expect(parseSendPaymentLink({ email: 'a@b.com', plan: 'label', period: 'weekly' }).ok).toBe(false);
  });
});
