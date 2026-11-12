import { describe, expect, it } from 'vitest';
import { PRICING_TIERS } from '@urganize/pricing';
import { ALLOWANCE_CREDITS } from '@/lib/credits/allowance';
import { CHECKOUT_PLANS } from '@/lib/self-serve';
import { planRowLine, planTiles, showsIntervalChoice } from './checkout-plan-rows';

describe('planRowLine (the line under each plan on the desktop checkout)', () => {
  it('says artists and people from the plan limits', () => {
    expect(planRowLine('solo')).toBe('1 artist, 3 people');
    expect(planRowLine('manager')).toBe('3 artists, 6 people');
    expect(planRowLine('pro')).toBe('5 artists, 10 people');
  });

  it('adds rollouts at once only where two plans would otherwise read the same', () => {
    expect(planRowLine('solo_plus')).toBe('1 artist, 3 people, 3 rollouts at once');
  });

  it('gives every plan checkout sells a different line', () => {
    const lines = CHECKOUT_PLANS.map(planRowLine);
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe('planTiles (the three tiles for the picked plan)', () => {
  it('reads artists, people and the AI credits the plan is given each month', () => {
    expect(planTiles('manager')).toEqual([
      { value: String(PRICING_TIERS.manager.limits.artists), label: 'Artists' },
      { value: String(PRICING_TIERS.manager.limits.seats), label: 'People on your team' },
      { value: ALLOWANCE_CREDITS.manager.toLocaleString('en-NG'), label: 'AI credits a month' },
    ]);
  });

  it('uses the credits granted, not the old action limit', () => {
    expect(planTiles('manager')[2].value).toBe('450');
  });
});

describe('showsIntervalChoice', () => {
  it('hides the toggle when only one interval is on offer', () => {
    expect(showsIntervalChoice(['monthly'])).toBe(false);
    expect(showsIntervalChoice([])).toBe(false);
  });

  it('shows it when there is a real choice', () => {
    expect(showsIntervalChoice(['monthly', 'annual'])).toBe(true);
  });
});
