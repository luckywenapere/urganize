/**
 * The subscription states Paystack will still RENEW: the card is charged at
 * the end of the period unless the subscription is disabled first.
 *
 * `subscriptions.status` is written from about a dozen places (the Paystack
 * webhook, the cancel flow, self-serve, admin, account deletion) with no single
 * transition rule. This module is where that rule starts: the question every
 * "stop the charge" path asks lives here once, so cancel and account deletion
 * cannot disagree about which rows still bill. `paused` is not a status (a
 * pause is `cancelled` plus the paused_* columns), so it is correctly absent.
 */
export const LIVE_SUBSCRIPTION_STATUSES = ['active', 'past_due', 'trialing'] as const;

export function isLiveSubscriptionStatus(status: unknown): boolean {
  return (
    typeof status === 'string' &&
    (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
  );
}
