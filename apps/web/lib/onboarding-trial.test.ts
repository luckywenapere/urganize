import { describe, expect, it } from 'vitest';
import { shouldStartOnboardingTrial } from './onboarding-trial';

describe('shouldStartOnboardingTrial', () => {
  it('starts the no-card trial only when both billing flags are off', () => {
    expect(
      shouldStartOnboardingTrial({ cardTrialEnabled: false, hardPaywallEnabled: false })
    ).toBe(true);
  });

  it('skips it under the card trial (that route 404s; the trial starts on /start-trial)', () => {
    expect(
      shouldStartOnboardingTrial({ cardTrialEnabled: true, hardPaywallEnabled: false })
    ).toBe(false);
  });

  it('skips it under the hard paywall (the team trial is granted at team creation)', () => {
    // The regression this whole fix exists for: /api/trial/start 404s under the
    // hard paywall, and the wizard would throw on that 404.
    expect(
      shouldStartOnboardingTrial({ cardTrialEnabled: false, hardPaywallEnabled: true })
    ).toBe(false);
  });

  it('skips it when both are on', () => {
    expect(
      shouldStartOnboardingTrial({ cardTrialEnabled: true, hardPaywallEnabled: true })
    ).toBe(false);
  });
});
