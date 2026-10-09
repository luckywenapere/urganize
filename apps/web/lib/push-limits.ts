/**
 * Time limits for sending pushes (2026-10-09, v1.92.11).
 *
 * Neither push transport had a timeout. A push service that accepted the
 * connection and then went quiet held the sender open for as long as the
 * platform would let it. Two things were exposed to that:
 *
 *  - Every task assignment awaits its push inside the request that made it, so
 *    one slow endpoint left somebody's save hanging.
 *  - The morning notification cron flushed pushes first and the email outbox
 *    second, inside one 60 second function. A stuck push ate the clock and the
 *    emails never went (the onboarding sequence rides that cron).
 *
 * Pure so the sums can be tested without a clock.
 */

/** How long one push to one device may take before it is given up on. */
export const PUSH_SEND_TIMEOUT_MS = 8_000;

/** What the notification cron plans to use of its 60 second function limit. */
export const NOTIFICATION_CRON_BUDGET_MS = 50_000;

/** How long the cron's push flush may keep starting new sends. */
export const PUSH_FLUSH_BUDGET_MS = 15_000;

/** The most the email outbox drain is ever given. */
export const EMAIL_DRAIN_MAX_MS = 40_000;

/**
 * One email send aborts after 10 seconds (lib/email/transport.ts), and a drain
 * only checks its budget between sends, so it can run this far past it.
 */
export const EMAIL_SEND_SLACK_MS = 10_000;

/**
 * How long the email drain may run once the push flush has used `elapsedMs`.
 * Never more than {@link EMAIL_DRAIN_MAX_MS}, never negative, and always leaves
 * room for the one send in flight when it stops.
 */
export function emailBudgetMs(elapsedMs: number): number {
  const spent = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : NOTIFICATION_CRON_BUDGET_MS;
  const left = NOTIFICATION_CRON_BUDGET_MS - spent - EMAIL_SEND_SLACK_MS;
  return Math.max(0, Math.min(EMAIL_DRAIN_MAX_MS, left));
}
