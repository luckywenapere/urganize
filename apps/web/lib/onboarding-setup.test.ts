import { describe, expect, it } from 'vitest';
import { FRESH_SIGNUP_WINDOW_MS, resolveOnboardingSetupRequired } from './onboarding-setup';

const now = Date.parse('2026-10-14T15:00:00Z');
const base = {
  onboardingCompleted: false,
  role: 'artist-manager',
  isWorkspaceMember: false,
  createdAtIso: new Date(now - 60_000).toISOString(),
  nowMs: now,
};

describe('resolveOnboardingSetupRequired', () => {
  it('sends a fresh, un-onboarded Google sign-up to the wizard', () => {
    expect(resolveOnboardingSetupRequired(base)).toBe(true);
  });
  it('leaves onboarded accounts alone', () => {
    expect(resolveOnboardingSetupRequired({ ...base, onboardingCompleted: true })).toBe(false);
    expect(resolveOnboardingSetupRequired({ ...base, onboardingCompleted: null })).toBe(false);
  });
  it('leaves old accounts that never finished onboarding alone', () => {
    expect(
      resolveOnboardingSetupRequired({
        ...base,
        createdAtIso: new Date(now - FRESH_SIGNUP_WINDOW_MS - 1000).toISOString(),
      })
    ).toBe(false);
  });
  it('leaves curators and invited teammates alone', () => {
    expect(resolveOnboardingSetupRequired({ ...base, role: 'curator' })).toBe(false);
    expect(resolveOnboardingSetupRequired({ ...base, isWorkspaceMember: true })).toBe(false);
  });
  it('fails closed on missing or bad dates', () => {
    expect(resolveOnboardingSetupRequired({ ...base, createdAtIso: null })).toBe(false);
    expect(resolveOnboardingSetupRequired({ ...base, createdAtIso: 'nope' })).toBe(false);
  });
});
