import { describe, expect, it } from 'vitest';
import { getTierPrice, isSelfServePurchase } from '@urganize/pricing';
import { needsOnboardingCall, parseSendPaymentLink } from './call-led';

describe('onboarding rules: who pays without a call', () => {
  it('lets Solo and Manager pay on their own, monthly or yearly', () => {
    for (const plan of ['solo', 'manager'] as const) {
      expect(isSelfServePurchase(plan, 'monthly')).toBe(true);
      expect(isSelfServePurchase(plan, 'annual')).toBe(true);
    }
  });

  it('sends Label to a call on every period', () => {
    for (const period of ['monthly', 'semiannual', 'annual'] as const) {
      expect(needsOnboardingCall('label', period)).toBe(true);
    }
  });

  it('sends a 6-month plan to a call, and no longer a yearly one', () => {
    for (const plan of ['solo', 'manager'] as const) {
      expect(needsOnboardingCall(plan, 'semiannual')).toBe(true);
      expect(needsOnboardingCall(plan, 'annual')).toBe(false);
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
