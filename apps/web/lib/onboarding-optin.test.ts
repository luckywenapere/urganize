import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markPushAskedInOnboarding, wasPushAskedInOnboarding } from './onboarding-optin';

const WEEK = 7 * 24 * 60 * 60 * 1000;

// vitest runs in plain Node here, so window and localStorage are stubbed with
// a Map, the approach lib/credit-prefill.test.ts uses.
function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
  return store;
}

describe('wasPushAskedInOnboarding', () => {
  beforeEach(() => {
    stubStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is false when the step was never shown', () => {
    expect(wasPushAskedInOnboarding()).toBe(false);
    expect(wasPushAskedInOnboarding(WEEK)).toBe(false);
  });

  it('counts the step as an answer for a week, then lets the weekly ask return', () => {
    const shownAt = 1_000_000_000_000;
    markPushAskedInOnboarding(shownAt);
    expect(wasPushAskedInOnboarding(WEEK, shownAt + WEEK - 1)).toBe(true);
    expect(wasPushAskedInOnboarding(WEEK, shownAt + WEEK)).toBe(false);
  });

  it('with no window, any time counts', () => {
    markPushAskedInOnboarding(1);
    expect(wasPushAskedInOnboarding(undefined, 10 * WEEK)).toBe(true);
  });

  it('treats a value that is not a timestamp as asked, never as a reason to show more', () => {
    const store = stubStorage();
    markPushAskedInOnboarding(1);
    const key = [...store.keys()][0];
    store.set(key, 'yes');
    expect(wasPushAskedInOnboarding(WEEK, 10 * WEEK)).toBe(true);
  });
});
