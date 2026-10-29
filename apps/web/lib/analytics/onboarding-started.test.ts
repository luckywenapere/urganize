import { afterEach, describe, expect, it, vi } from 'vitest';

// #854 review: markOnboardingStarted ran before the team check's try block,
// so a blocked localStorage (private modes, some in-app browsers) threw and
// left the team screen loading forever. It must never throw, and must still
// count once per page life.
describe('onboarding_started with blocked storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('does not throw, and the elapsed time reads as unknown', async () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    vi.stubGlobal('window', { localStorage: blocked, location: { href: 'https://x' } });
    const analytics = await import('./client');
    expect(() => analytics.markOnboardingStarted('auth')).not.toThrow();
    expect(() => analytics.markOnboardingStarted('google')).not.toThrow();
    expect(analytics.getOnboardingElapsedSeconds()).toBeNull();
  });
});
