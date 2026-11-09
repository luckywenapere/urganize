import { describe, expect, it } from 'vitest';
import { isLiveSubscriptionStatus } from './subscription-status';

describe('isLiveSubscriptionStatus', () => {
  it('treats every status Paystack still renews as live', () => {
    for (const status of ['active', 'past_due', 'trialing']) {
      expect(isLiveSubscriptionStatus(status), status).toBe(true);
    }
  });

  it('treats ended, paused and unknown rows as not live', () => {
    for (const status of ['cancelled', 'inactive', 'expired', 'canceled', '', null, undefined, 7]) {
      expect(isLiveSubscriptionStatus(status), String(status)).toBe(false);
    }
  });
});
