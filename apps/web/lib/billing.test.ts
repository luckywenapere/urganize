import { describe, expect, it } from 'vitest';
import { getPlanExpiry } from './billing';

// Dates are constructed with the local-time Date(y, m, d) constructor so the
// assertions are timezone-independent — getPlanExpiry mutates via setMonth/
// setFullYear, which operate in local time.

describe('getPlanExpiry', () => {
  it('monthly advances one month', () => {
    const now = new Date(2026, 0, 15); // Jan 15
    expect(getPlanExpiry('monthly', now).getTime()).toBe(new Date(2026, 1, 15).getTime());
  });

  it('unknown plan strings fall back to the monthly default', () => {
    const now = new Date(2026, 0, 15);
    expect(getPlanExpiry('something-new', now).getTime()).toBe(new Date(2026, 1, 15).getTime());
  });

  it('month-end rollover follows JS setMonth semantics (Jan 31 + 1mo lands in March)', () => {
    // Documents existing behavior: Jan 31 → "Feb 31" → Mar 3 (non-leap 2026).
    // A user charged on the 31st gets 31 days, not a truncated month.
    const now = new Date(2026, 0, 31);
    expect(getPlanExpiry('monthly', now).getTime()).toBe(new Date(2026, 2, 3).getTime());
  });

  it.each(['annual', 'label', 'yearly', 'access'])('%s advances one year', (plan) => {
    const now = new Date(2026, 5, 10);
    expect(getPlanExpiry(plan, now).getTime()).toBe(new Date(2027, 5, 10).getTime());
  });

  it('custom (admin-provisioned) is pegged far-future: +100 years', () => {
    const now = new Date(2026, 5, 10);
    expect(getPlanExpiry('custom', now).getTime()).toBe(new Date(2126, 5, 10).getTime());
  });

  it('does not mutate the passed-in date', () => {
    const now = new Date(2026, 0, 15);
    const snapshot = now.getTime();
    getPlanExpiry('annual', now);
    expect(now.getTime()).toBe(snapshot);
  });
});
