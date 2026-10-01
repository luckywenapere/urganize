import { describe, expect, it } from 'vitest';
import { APP_LOCK_GRACE_MS, shouldLockAfterBackground } from '@urganize/native-bridge';

import { describeAppLock } from './app-lock';

describe('describeAppLock', () => {
  it('offers to turn it on when the phone can check and it is off', () => {
    const copy = describeAppLock({ supported: true, enabled: false });
    expect(copy.action).toBe('Turn on');
    expect(copy.description).toMatch(/Face ID/);
  });

  it('offers to turn it off when it is on', () => {
    expect(describeAppLock({ supported: true, enabled: true }).action).toBe('Turn off');
  });

  it('offers nothing to press when the phone cannot check, and says what to do', () => {
    const copy = describeAppLock({ supported: false, enabled: false });
    expect(copy.action).toBeNull();
    expect(copy.description).toMatch(/passcode/);
  });

  it('keeps the house rules: no em dash, no banned words', () => {
    for (const status of [
      { supported: true, enabled: false },
      { supported: true, enabled: true },
      { supported: false, enabled: false },
    ]) {
      const copy = describeAppLock(status);
      const text = `${copy.title} ${copy.description}`;
      expect(text).not.toMatch(/\u2014/);
      expect(text).not.toMatch(/workspace/i);
    }
  });
});

describe('shouldLockAfterBackground', () => {
  const now = 1_000_000;

  it('never locks when the lock is off', () => {
    expect(shouldLockAfterBackground({ enabled: false, leftAtMs: null, nowMs: now })).toBe(false);
    expect(shouldLockAfterBackground({ enabled: false, leftAtMs: 0, nowMs: now })).toBe(false);
  });

  it('does not lock after a quick glance at a notification', () => {
    expect(shouldLockAfterBackground({ enabled: true, leftAtMs: now - 2_000, nowMs: now })).toBe(false);
  });

  it('locks once the person has been away as long as the grace period', () => {
    expect(
      shouldLockAfterBackground({ enabled: true, leftAtMs: now - APP_LOCK_GRACE_MS, nowMs: now })
    ).toBe(true);
    expect(
      shouldLockAfterBackground({ enabled: true, leftAtMs: now - APP_LOCK_GRACE_MS + 1, nowMs: now })
    ).toBe(false);
  });

  it('locks when it does not know when they left, the safe side', () => {
    expect(shouldLockAfterBackground({ enabled: true, leftAtMs: null, nowMs: now })).toBe(true);
  });

  it('locks if the clock went backwards rather than trusting it', () => {
    expect(shouldLockAfterBackground({ enabled: true, leftAtMs: now + 5_000, nowMs: now })).toBe(true);
  });

  it('honours a custom grace period', () => {
    expect(
      shouldLockAfterBackground({ enabled: true, leftAtMs: now - 6_000, nowMs: now, graceMs: 5_000 })
    ).toBe(true);
  });
});
