/**
 * The activation rule, as a pure function.
 *
 * Activated = a first REAL rollout created AND one teammate invited, both
 * within ACTIVATION_WINDOW_DAYS of signup (founder call 2026-10-01: 3 days,
 * was 7). It fires as the server event `activated`, once per account.
 *
 * ONCE PER ACCOUNT WITHOUT STORING ANYTHING. The event is captured only by the
 * action that COMPLETES the pair, and the two completing actions exclude each
 * other:
 *   - a rollout completes it only if it is the first real rollout AND an
 *     invite already exists;
 *   - an invite completes it only if it is the first invite AND a real rollout
 *     already exists.
 * Whichever came second fires, and only the very first of each kind can be
 * "first", so a third, fourth or fifth action can never fire it again.
 *
 * A TEST ROLLOUT NEVER COUNTS. It is the practice path (lib/test-release.ts),
 * and an account that only looked around has not activated. This is a
 * deliberate difference from `time_to_first_release`, which counts them.
 *
 * A minted invite LINK does not count either; only a person actually joining
 * does. With team logins on, a link is generated for every new rollout, so
 * counting the mint would mark every account activated.
 */

export const ACTIVATION_WINDOW_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ActivationTrigger = 'release' | 'invite';

export type ActivationInput = {
  /** What just happened. */
  trigger: ActivationTrigger;
  /** When the account was created, in ms. */
  signupMs: number;
  nowMs: number;
  /** Real (non-test) rollouts the account owns, counting a just-created one. */
  releaseCount: number;
  /** Teammates invited or joined, counting a just-created one. */
  inviteCount: number;
};

export type ActivationDecision =
  | { activated: false }
  | { activated: true; secondsSinceSignup: number; completedBy: ActivationTrigger };

export function isWithinActivationWindow(signupMs: number, eventMs: number): boolean {
  if (!Number.isFinite(signupMs) || !Number.isFinite(eventMs)) return false;
  const elapsed = eventMs - signupMs;
  // A clock that puts the event before signup is not evidence of anything.
  if (elapsed < 0) return false;
  return elapsed <= ACTIVATION_WINDOW_DAYS * DAY_MS;
}

export function decideActivation(input: ActivationInput): ActivationDecision {
  if (!isWithinActivationWindow(input.signupMs, input.nowMs)) return { activated: false };

  const completes =
    input.trigger === 'release'
      ? input.releaseCount === 1 && input.inviteCount >= 1
      : input.inviteCount === 1 && input.releaseCount >= 1;
  if (!completes) return { activated: false };

  return {
    activated: true,
    secondsSinceSignup: Math.max(0, Math.round((input.nowMs - input.signupMs) / 1000)),
    completedBy: input.trigger,
  };
}
