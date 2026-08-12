import { describe, expect, it } from 'vitest';
import { isFirstReleaseRequired, type FirstReleaseRequiredInput } from './first-release-required';

// URG-217. This predicate decides whether CreateReleaseModal becomes
// non-dismissable, so a wrong `true` locks a real user out of the product
// behind a modal with no exit. Every case below is a fail-open guard; the
// `error !== ''` one is the whole reason the predicate exists (see the note in
// first-release-required.ts about loadCommandCenter setting isInitialLoading
// false on failure as well as success).

/** All five conditions satisfied — the one input shape that should lock. */
const LOCKING: FirstReleaseRequiredInput = {
  isAuthenticated: true,
  isAuthLoading: false,
  hasCompletedOnboarding: true,
  isInitialLoading: false,
  error: '',
  releaseCount: 0,
};

const withOverrides = (overrides: Partial<FirstReleaseRequiredInput>) =>
  isFirstReleaseRequired({ ...LOCKING, ...overrides });

describe('isFirstReleaseRequired', () => {
  it('locks when the store confirms an onboarded user has zero releases', () => {
    expect(isFirstReleaseRequired(LOCKING)).toBe(true);
  });

  it('does not lock while the command-center load is still in flight', () => {
    // releases is [] here only because nothing has been fetched yet.
    expect(withOverrides({ isInitialLoading: true })).toBe(false);
  });

  it('does not lock when the command-center load FAILED', () => {
    // The trap case: isInitialLoading is false and releases is [], but only
    // because the fetch errored. Locking here would seal the user in on a
    // network blip or an expired session.
    expect(withOverrides({ error: 'Could not load releases.' })).toBe(false);
    expect(withOverrides({ error: 'Session expired. Please sign in again.' })).toBe(false);
  });

  it('does not lock before auth resolves', () => {
    expect(withOverrides({ isAuthLoading: true })).toBe(false);
  });

  it('does not lock an unauthenticated visitor', () => {
    expect(withOverrides({ isAuthenticated: false })).toBe(false);
  });

  it('does not lock while onboarding is still in flight', () => {
    // FirstTimeOnboardingGate owns this moment and already forces a first
    // release; opening underneath it would fight its overlay + scroll lock.
    expect(withOverrides({ hasCompletedOnboarding: false })).toBe(false);
  });

  it('does not lock a user who already has releases', () => {
    expect(withOverrides({ releaseCount: 1 })).toBe(false);
    expect(withOverrides({ releaseCount: 12 })).toBe(false);
  });

  it('stays false when several guards fail at once', () => {
    expect(
      withOverrides({ isInitialLoading: true, error: 'boom', isAuthenticated: false })
    ).toBe(false);
  });
});
