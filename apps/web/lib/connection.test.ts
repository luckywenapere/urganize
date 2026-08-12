import { describe, expect, it } from 'vitest';
import { shouldBackgroundPrefetch } from './connection';

describe('shouldBackgroundPrefetch', () => {
  it('honors Data Saver — an explicit "stop spending my bytes"', () => {
    expect(shouldBackgroundPrefetch({ saveData: true })).toBe(false);
    // Even on a fast connection: the user asked, the speed is irrelevant.
    expect(shouldBackgroundPrefetch({ saveData: true, effectiveType: '4g' })).toBe(false);
  });

  it('skips prefetching on 2g-class connections', () => {
    expect(shouldBackgroundPrefetch({ effectiveType: '2g' })).toBe(false);
    expect(shouldBackgroundPrefetch({ effectiveType: 'slow-2g' })).toBe(false);
  });

  it('prefetches on 3g and better', () => {
    expect(shouldBackgroundPrefetch({ effectiveType: '3g' })).toBe(true);
    expect(shouldBackgroundPrefetch({ effectiveType: '4g' })).toBe(true);
  });

  it('treats saveData: false as no objection', () => {
    expect(shouldBackgroundPrefetch({ saveData: false, effectiveType: '3g' })).toBe(true);
  });

  // Fails OPEN on purpose: navigator.connection is Chromium-only, and
  // treating "unknown" as constrained would silently disable prefetching for
  // every Safari and Firefox user.
  it('prefetches when the connection API is absent', () => {
    expect(shouldBackgroundPrefetch(null)).toBe(true);
    expect(shouldBackgroundPrefetch({})).toBe(true);
  });

  it('ignores an unrecognized effectiveType rather than blocking', () => {
    expect(shouldBackgroundPrefetch({ effectiveType: '5g' })).toBe(true);
  });
});
