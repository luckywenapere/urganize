// Self-serve checkout (2026-10-22): card checkout refuses a Paystack Plan whose
// price does not match the price we show. When a Plan code is passed to
// Paystack, the Plan's own amount is what gets charged, so a Plan env var that
// still points at an old Plan would advertise one price and charge another.
// That gap has shipped here five times; this check closes it for good.
//
// Pure decision first (tested), then a small cached reader. Server only.

import type { BillingInterval } from '@urganize/pricing';

const PAYSTACK_INTERVAL: Record<BillingInterval, string> = {
  monthly: 'monthly',
  semiannual: 'biannually',
  annual: 'annually',
};

export type PaystackPlanFacts = { amount: number | null; interval: string | null; currency: string | null };

/** True only when the Plan charges exactly this amount, on this interval, in NGN. */
export function planMatchesPrice(
  plan: PaystackPlanFacts | null,
  expected: { amountKobo: number; interval: BillingInterval; currency?: string }
): boolean {
  if (!plan) return false;
  if (plan.amount !== expected.amountKobo) return false;
  if (plan.interval !== PAYSTACK_INTERVAL[expected.interval]) return false;
  const currency = (expected.currency ?? 'NGN').toUpperCase();
  return (plan.currency ?? '').toUpperCase() === currency;
}

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; facts: PaystackPlanFacts }>();

/** Reads a Plan from Paystack. Null on any failure (the caller refuses). Only
 *  a successful read is cached, so a Plan fixed in the dashboard is seen within
 *  ten minutes and a Paystack blip is not remembered. */
export async function readPaystackPlan(code: string, secretKey: string): Promise<PaystackPlanFacts | null> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.facts;
  try {
    const response = await fetch(`https://api.paystack.co/plan/${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const json = (await response.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    const data = json?.data;
    if (!data) return null;
    const facts: PaystackPlanFacts = {
      amount: typeof data.amount === 'number' ? data.amount : null,
      interval: typeof data.interval === 'string' ? data.interval : null,
      currency: typeof data.currency === 'string' ? data.currency : null,
    };
    cache.set(code, { at: Date.now(), facts });
    return facts;
  } catch {
    return null;
  }
}

export const PLAN_NOT_READY_MESSAGE =
  "Card payment for this plan isn't ready yet. Pay by bank transfer, or try again later.";
