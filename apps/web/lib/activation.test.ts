import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_WINDOW_DAYS,
  decideActivation,
  isWithinActivationWindow,
  type ActivationInput,
  type ActivationTrigger,
} from './activation';

const DAY = 24 * 60 * 60 * 1000;
const SIGNUP = Date.UTC(2026, 9, 1, 12, 0, 0);

function input(over: Partial<ActivationInput> = {}): ActivationInput {
  return {
    trigger: 'release',
    signupMs: SIGNUP,
    nowMs: SIGNUP + DAY,
    releaseCount: 1,
    inviteCount: 1,
    ...over,
  };
}

describe('the window', () => {
  it('is three days', () => {
    expect(ACTIVATION_WINDOW_DAYS).toBe(3);
  });

  it('includes exactly three days and excludes a second past', () => {
    expect(isWithinActivationWindow(SIGNUP, SIGNUP + 3 * DAY)).toBe(true);
    expect(isWithinActivationWindow(SIGNUP, SIGNUP + 3 * DAY + 1000)).toBe(false);
  });

  it('is no longer seven days', () => {
    expect(isWithinActivationWindow(SIGNUP, SIGNUP + 5 * DAY)).toBe(false);
  });

  it('refuses an event before signup and non-finite times', () => {
    expect(isWithinActivationWindow(SIGNUP, SIGNUP - 1)).toBe(false);
    expect(isWithinActivationWindow(Number.NaN, SIGNUP)).toBe(false);
    expect(isWithinActivationWindow(SIGNUP, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('decideActivation: the rollout completes the pair', () => {
  it('fires when the first real rollout lands after an invite', () => {
    const d = decideActivation(input({ trigger: 'release', releaseCount: 1, inviteCount: 1 }));
    expect(d).toEqual({
      activated: true,
      secondsSinceSignup: 86400,
      completedBy: 'release',
    });
  });

  it('does not fire without an invite', () => {
    expect(decideActivation(input({ trigger: 'release', inviteCount: 0 })).activated).toBe(false);
  });

  it('does not fire for a second rollout', () => {
    expect(decideActivation(input({ trigger: 'release', releaseCount: 2 })).activated).toBe(false);
  });
});

describe('decideActivation: the invite completes the pair', () => {
  it('fires when the first invite lands after a real rollout', () => {
    const d = decideActivation(input({ trigger: 'invite', releaseCount: 1, inviteCount: 1 }));
    expect(d.activated).toBe(true);
    if (d.activated) expect(d.completedBy).toBe('invite');
  });

  it('does not fire without a real rollout', () => {
    expect(decideActivation(input({ trigger: 'invite', releaseCount: 0 })).activated).toBe(false);
  });

  it('does not fire for a second invite', () => {
    expect(decideActivation(input({ trigger: 'invite', inviteCount: 2 })).activated).toBe(false);
  });
});

describe('once per account', () => {
  // Counts only go up, so the pair (1 rollout, 1 invite) is reached by exactly
  // one action. Replay every ordering of up to five actions and count fires.
  function fires(actions: ActivationTrigger[]): number {
    let releaseCount = 0;
    let inviteCount = 0;
    let fired = 0;
    for (const trigger of actions) {
      if (trigger === 'release') releaseCount += 1;
      else inviteCount += 1;
      if (decideActivation(input({ trigger, releaseCount, inviteCount })).activated) fired += 1;
    }
    return fired;
  }

  it('fires exactly once when both kinds happen, in any order', () => {
    const orders = (n: number): ActivationTrigger[][] =>
      n === 0
        ? [[]]
        : orders(n - 1).flatMap((o) => [
            [...o, 'release' as const],
            [...o, 'invite' as const],
          ]);
    for (let n = 2; n <= 5; n += 1) {
      for (const order of orders(n)) {
        const both = order.includes('release') && order.includes('invite');
        expect(fires(order)).toBe(both ? 1 : 0);
      }
    }
  });
});

describe('outside the window', () => {
  it('never fires, whichever action completes the pair', () => {
    const late = SIGNUP + 3 * DAY + 60_000;
    expect(decideActivation(input({ trigger: 'release', nowMs: late })).activated).toBe(false);
    expect(decideActivation(input({ trigger: 'invite', nowMs: late })).activated).toBe(false);
  });
});
