// Pure decision logic for the first-login push prompt (2026-08-21).
//
// WHY A SOFT ASK EXISTS AT ALL. Push has been fully wired and configured in
// production since 2026-07-23 (VAPID keys set, FCM set, two daily crons
// firing) and the only way to switch it on was a row buried in
// Settings -> Notifications, so almost nobody ever did: an audit on
// 2026-08-21 found ONE row in push_subscriptions and ZERO in
// device_push_tokens, against ~40 deadline notifications a day being
// generated and delivered to nothing but the in-app bell.
//
// WHY THE DECISION LIVES HERE AND NOT IN THE COMPONENT. Getting a permission
// ask wrong is not recoverable: a browser hands out exactly one prompt per
// origin, and once the user answers "Block" (or the OS prompt is dismissed
// enough times) the API refuses to ask again, forever, with no way back
// except the user finding the site settings themselves. So the "may we ask?"
// question is a pure function with a unit test around it, not an if-chain
// tangled up in effects and refs. vitest collects lib/**/*.test.ts, which is
// the other half of why it is here (see push-prompt.test.ts).

import type { PushPermissionState, PushStatus } from './push';

/** How long "Not now" holds: one week (founder call, 2026-11-27, was 30 days).
 * People who have not turned notifications on are reminded weekly. Read
 * through readPersistedState's maxAgeMs, so the record simply expires and the
 * ask returns — this is a deliberate
 * deviation from the AndroidAppBanner / InviteTeamBanner house rule that a
 * dismissal is forever. Rationale: those two point at things the user can
 * reach any time; this one is the difference between a deadline reminder
 * arriving and not existing. */
export const PUSH_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const PUSH_PROMPT_SNOOZE_VERSION = 1;

/** Keyed per USER, not per device. The subscription row is per (user, device)
 * server-side, so a second account signing in on the same browser genuinely
 * has no push and deserves its own one-time ask. */
export function pushPromptSnoozeKey(userId: string): string {
  return `urganize.push-prompt.snoozed.${userId}`;
}

export type PushPromptDecision =
  | 'ask' // show the soft ask; its button is the gesture that opens the OS prompt
  | 'auto-enable' // permission is already granted — subscribe silently, show nothing
  | 'remind-blocked' // the browser or phone blocks notifications: say how to undo it, no prompt
  | 'skip'; // nothing to do, and in some cases nothing we are ALLOWED to do

/**
 * The whole gate, in order. Every branch above the last one is a case where
 * showing a card would be either useless or actively harmful.
 *
 *  - unsupported: no PushManager, or no VAPID key configured. There is no
 *    permission to grant.
 *  - blocked / denied: the browser will not prompt again, so a card with a
 *    "Turn on" button would silently do nothing. Instead, once a week, a card
 *    that only tells the person where to switch it back on themselves.
 *  - enabled: already subscribed on this device.
 *  - granted but not subscribed: the user said yes at some point and we lost
 *    the subscription (cleared site data, a rotated key, a failed sync).
 *    Re-subscribing needs no prompt and therefore needs no card — the same
 *    passive re-register NativePushBridge already does for native.
 *  - default: the one state where a prompt is possible. Ask unless the user
 *    has said "Not now" in the last week, or answered onboarding's opt-in
 *    step on this device in the last week.
 */
export function decidePushPrompt(input: {
  status: PushStatus;
  permission: PushPermissionState;
  snoozed: boolean;
  /** Onboarding's "Stay on top of your next move" step was shown on this
   * device in the last week (URG-251 Part 2). The person already answered
   * there, so the soft ask waits out the same week a "Not now" does; a
   * granted device is still repaired silently. */
  askedInOnboarding?: boolean;
}): PushPromptDecision {
  if (input.status === 'unsupported') return 'skip';
  if (input.status === 'blocked' || input.permission === 'denied') {
    return input.snoozed ? 'skip' : 'remind-blocked';
  }
  if (input.status === 'enabled') return 'skip';
  if (input.permission === 'granted') return 'auto-enable';
  if (input.askedInOnboarding) return 'skip';
  return input.snoozed ? 'skip' : 'ask';
}
