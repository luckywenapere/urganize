import { describe, expect, it } from 'vitest';
import { readRolloutOrigin, resolveRolloutOrigin } from './rollout-origin';

describe('resolveRolloutOrigin', () => {
  it('tags the sign-up wizard as onboarding whatever else it says', () => {
    expect(resolveRolloutOrigin({ source: 'onboarding' })).toBe('onboarding');
    expect(resolveRolloutOrigin({ source: 'onboarding', origin: 'hint' })).toBe('onboarding');
  });

  it('takes hint from an offer and calls everything else a choice', () => {
    expect(resolveRolloutOrigin({ source: 'dashboard', origin: 'hint' })).toBe('hint');
    expect(resolveRolloutOrigin({ source: 'chappi', origin: 'hint' })).toBe('hint');
    expect(resolveRolloutOrigin({ source: 'dashboard' })).toBe('choice');
    expect(resolveRolloutOrigin({ source: 'dashboard', origin: 'choice' })).toBe('choice');
    // Nobody else can claim onboarding.
    expect(resolveRolloutOrigin({ source: 'dashboard', origin: 'onboarding' })).toBe('choice');
  });
});

describe('readRolloutOrigin', () => {
  it('reads the stored origin', () => {
    expect(readRolloutOrigin({ origin: 'choice' })).toBe('choice');
    expect(readRolloutOrigin({ origin: 'hint', created_source: 'dashboard' })).toBe('hint');
  });

  it('infers only onboarding for older rows, and leaves the rest unknown', () => {
    expect(readRolloutOrigin({ created_source: 'onboarding' })).toBe('onboarding');
    expect(readRolloutOrigin({ created_source: 'dashboard' })).toBe('unknown');
    expect(readRolloutOrigin({})).toBe('unknown');
    expect(readRolloutOrigin(null)).toBe('unknown');
    expect(readRolloutOrigin({ origin: 'nonsense' })).toBe('unknown');
  });
});
