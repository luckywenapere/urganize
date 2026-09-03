import { describe, expect, it } from 'vitest';
import {
  EMBEDDED_ACTIONS_DAILY_CAP,
  decideEmbeddedActionsGuard,
  guardWindowStartIso,
  shouldAlertGuardTrip,
} from './guard';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('decideEmbeddedActionsGuard', () => {
  it('allows a run under the cap', () => {
    expect(decideEmbeddedActionsGuard({ count: 0, cap: 5 })).toEqual({ allowed: true });
    expect(decideEmbeddedActionsGuard({ count: 4, cap: 5 })).toEqual({ allowed: true });
  });

  it('refuses AT the cap, not only past it', () => {
    expect(decideEmbeddedActionsGuard({ count: 5, cap: 5 })).toEqual({
      allowed: false,
      message: 'UrgAns is busy. Try again in a bit.',
    });
  });

  it('refuses past the cap', () => {
    expect(decideEmbeddedActionsGuard({ count: 9, cap: 5 }).allowed).toBe(false);
  });

  it('defaults to EMBEDDED_ACTIONS_DAILY_CAP when no cap is given', () => {
    expect(decideEmbeddedActionsGuard({ count: EMBEDDED_ACTIONS_DAILY_CAP - 1 }).allowed).toBe(
      true
    );
    expect(decideEmbeddedActionsGuard({ count: EMBEDDED_ACTIONS_DAILY_CAP }).allowed).toBe(false);
  });
});

describe('guardWindowStartIso', () => {
  it('is exactly 24 hours before now', () => {
    const now = new Date('2026-09-03T12:00:00.000Z');
    expect(guardWindowStartIso(now)).toBe('2026-09-02T12:00:00.000Z');
  });
});

describe('shouldAlertGuardTrip', () => {
  const NOW = new Date('2026-09-03T12:00:00.000Z');

  it('alerts the first time, with no prior alert on record', () => {
    expect(shouldAlertGuardTrip({ lastAlertAtIso: null, now: NOW })).toBe(true);
  });

  it('does not alert again inside the 24h window', () => {
    expect(
      shouldAlertGuardTrip({
        lastAlertAtIso: new Date(NOW.getTime() - 1 * 60 * 60 * 1000).toISOString(),
        now: NOW,
      })
    ).toBe(false);
  });

  it('alerts again exactly at the 24h boundary', () => {
    expect(
      shouldAlertGuardTrip({
        lastAlertAtIso: new Date(NOW.getTime() - DAY_MS).toISOString(),
        now: NOW,
      })
    ).toBe(true);
  });

  it('alerts on an unparseable timestamp rather than swallowing the signal', () => {
    expect(shouldAlertGuardTrip({ lastAlertAtIso: 'nonsense', now: NOW })).toBe(true);
  });
});
