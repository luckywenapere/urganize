import { describe, expect, it } from 'vitest';
import { resolveOnboardingSetupRequired } from './onboarding-setup';

const base = {
  onboardingCompleted: false,
  role: 'artist-manager',
  isWorkspaceMember: false,
  ownsWork: false,
};

describe('resolveOnboardingSetupRequired', () => {
  it('sends an un-onboarded sign-up to the team screen', () => {
    expect(resolveOnboardingSetupRequired(base)).toBe(true);
  });
  it('leaves onboarded accounts alone', () => {
    expect(resolveOnboardingSetupRequired({ ...base, onboardingCompleted: true })).toBe(false);
    expect(resolveOnboardingSetupRequired({ ...base, onboardingCompleted: null })).toBe(false);
  });
  it('an old account that never finished goes too, whatever its age, unless it has work (#854)', () => {
    expect(resolveOnboardingSetupRequired({ ...base, ownsWork: true })).toBe(false);
    expect(resolveOnboardingSetupRequired({ ...base, ownsWork: null })).toBe(false);
  });
  it('leaves curators and invited teammates alone', () => {
    expect(resolveOnboardingSetupRequired({ ...base, role: 'curator' })).toBe(false);
    expect(resolveOnboardingSetupRequired({ ...base, isWorkspaceMember: true })).toBe(false);
  });
});
