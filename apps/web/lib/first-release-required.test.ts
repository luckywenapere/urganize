import { describe, expect, it } from 'vitest';
import { isFirstReleaseRequired, type FirstReleaseRequiredInput } from './first-release-required';

// This predicate decides whether the deferred first-release prompt arms (and
// whether CreateReleaseModal wears its first-release copy), so a wrong `true`
// interrupts a real user with a prompt they didn't need — and before
// 2026-08-28 it walled them in outright, which is the severity these guards
// were written against. Every case below is a fail-open guard; the
// `error !== ''` one is the whole reason the predicate exists (see the note in
// first-release-required.ts about loadCommandCenter setting isInitialLoading
// false on failure as well as success).

/** All five conditions satisfied — the one input shape that should prompt. */
const PROMPTING: FirstReleaseRequiredInput = {
  isAuthenticated: true,
  isAuthLoading: false,
  hasCompletedOnboarding: true,
  isInitialLoading: false,
  error: '',
  releaseCount: 0,
};

const withOverrides = (overrides: Partial<FirstReleaseRequiredInput>) =>
  isFirstReleaseRequired({ ...PROMPTING, ...overrides });

describe('isFirstReleaseRequired', () => {
  it('prompts when the store confirms an onboarded user has zero releases', () => {
    expect(isFirstReleaseRequired(PROMPTING)).toBe(true);
  });

  it('does not prompt while the command-center load is still in flight', () => {
    // releases is [] here only because nothing has been fetched yet.
    expect(withOverrides({ isInitialLoading: true })).toBe(false);
  });

  it('does not prompt when the command-center load FAILED', () => {
    // The trap case: isInitialLoading is false and releases is [], but only
    // because the fetch errored. Prompting here would nag a user whose
    // releases exist behind a network blip or an expired session.
    expect(withOverrides({ error: 'Could not load releases.' })).toBe(false);
    expect(withOverrides({ error: 'Session expired. Please sign in again.' })).toBe(false);
  });

  it('does not prompt before auth resolves', () => {
    expect(withOverrides({ isAuthLoading: true })).toBe(false);
  });

  it('does not prompt an unauthenticated visitor', () => {
    expect(withOverrides({ isAuthenticated: false })).toBe(false);
  });

  it('does not prompt while onboarding is still in flight', () => {
    // The /onboarding wizard owns this moment and creates the first release
    // itself before completion is stamped; prompting mid-flow would talk over
    // the flow that already does the job.
    expect(withOverrides({ hasCompletedOnboarding: false })).toBe(false);
  });

  it('does not prompt a user who already has releases', () => {
    expect(withOverrides({ releaseCount: 1 })).toBe(false);
    expect(withOverrides({ releaseCount: 12 })).toBe(false);
  });

  it('stays false when several guards fail at once', () => {
    expect(
      withOverrides({ isInitialLoading: true, error: 'boom', isAuthenticated: false })
    ).toBe(false);
  });
});
