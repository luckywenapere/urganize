import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { planMatchesPrice } from './paystack-plan-check';

const MANAGER_MONTH = { amountKobo: 3_000_000, interval: 'monthly' as const };

describe('planMatchesPrice', () => {
  it('accepts a Plan with the same amount, interval and currency', () => {
    expect(planMatchesPrice({ amount: 3_000_000, interval: 'monthly', currency: 'NGN' }, MANAGER_MONTH)).toBe(true);
    expect(
      planMatchesPrice({ amount: 15_000_000, interval: 'biannually', currency: 'NGN' }, { amountKobo: 15_000_000, interval: 'semiannual' })
    ).toBe(true);
  });

  it('refuses the old price, the wrong interval, another currency and an unreadable Plan', () => {
    expect(planMatchesPrice({ amount: 2_500_000, interval: 'monthly', currency: 'NGN' }, MANAGER_MONTH)).toBe(false);
    expect(planMatchesPrice({ amount: 3_000_000, interval: 'annually', currency: 'NGN' }, MANAGER_MONTH)).toBe(false);
    expect(planMatchesPrice({ amount: 3_000_000, interval: 'monthly', currency: 'USD' }, MANAGER_MONTH)).toBe(false);
    expect(planMatchesPrice({ amount: null, interval: null, currency: null }, MANAGER_MONTH)).toBe(false);
    expect(planMatchesPrice(null, MANAGER_MONTH)).toBe(false);
  });

  it('is checked by card checkout before Paystack is called', () => {
    const source = readFileSync(path.join(__dirname, '../app/api/billing/start-checkout/route.ts'), 'utf8');
    const check = source.indexOf('planMatchesPrice(');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(source.indexOf('fetchPaystackInit({'));
    expect(check).toBeLessThan(source.indexOf(".from('payments').insert("));
  });
});
