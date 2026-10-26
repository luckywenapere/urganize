// Onboarding rules (founder, 2026-10-26). Pure rules and copy, safe for the client.
// The server half (the database) is lib/call-led-server.ts.
//
// Solo and Manager on the monthly plan are paid for with no call. Label, and
// every 6-month or yearly plan, start with an onboarding call, and the founder
// sends the payment link afterwards. Nobody pays before that call.

import { isCheckoutPlan, type CheckoutPlan } from './self-serve';
import {
  isBillingInterval,
  isSelfServePurchase,
  type BillingInterval,
  type PricingTierId,
} from '@urganize/pricing';

export const CALL_REQUIRED_ERROR =
  'This plan starts with an onboarding call. Book a call and we will send your payment link after it.';

/** True when this plan and period are paid for only after the onboarding call. */
export function needsOnboardingCall(plan: PricingTierId, period: BillingInterval): boolean {
  return !isSelfServePurchase(plan, period);
}

/** "Book a call" on every button that would otherwise be a way to pay. */
export const BOOK_CALL_LABEL = 'Book a call';

/** Checks the admin's "Send payment link" form. */
export function parseSendPaymentLink(
  body: unknown
): { ok: true; value: { email: string; plan: CheckoutPlan; period: BillingInterval } } | { ok: false; error: string } {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter their email.' };
  if (!isCheckoutPlan(input.plan)) return { ok: false, error: 'Pick a plan.' };
  if (!isBillingInterval(input.period)) return { ok: false, error: 'Pick a period.' };
  return { ok: true, value: { email, plan: input.plan, period: input.period } };
}
