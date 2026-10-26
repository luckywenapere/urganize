// Onboarding rules, the server half (2026-10-26). A clearance is the founder's
// payment link: one email may pay for one plan and period. Service role only.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSelfServePurchase, type BillingInterval, type PricingTierId } from '@urganize/pricing';

type Admin = SupabaseClient;

/** True when this person already pays for exactly this plan and period, which
 *  makes the payment a renewal of something that began with a call. */
async function isRenewal(
  admin: Admin,
  userId: string,
  plan: PricingTierId,
  period: BillingInterval
): Promise<boolean> {
  const { data, error } = await admin
    .from('subscriptions')
    .select('plan,billing_interval')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return false;
  const row = data as { plan: string | null; billing_interval: string | null };
  return row.plan === plan && row.billing_interval === period;
}

/** Self-serve plans need no clearance. Anything else needs an unused one for
 *  exactly this email, plan and period, or must be a renewal of the same plan
 *  and period. Fails closed: a database error says no. */
export async function mayPay(
  admin: Admin,
  input: { userId: string; email: string; plan: PricingTierId; period: BillingInterval }
): Promise<boolean> {
  if (isSelfServePurchase(input.plan, input.period)) return true;
  if (await isRenewal(admin, input.userId, input.plan, input.period)) return true;
  const email = input.email.trim().toLowerCase();
  if (!email) return false;
  const { data, error } = await admin
    .from('checkout_clearances')
    .select('id')
    .eq('email', email)
    .eq('plan', input.plan)
    .eq('period', input.period)
    .is('used_at', null)
    .limit(1);
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

/** Every call-led plan and period this person may pay for right now, as
 *  "plan:period". The checkout page reads it to choose between paying and booking. */
export async function allowedCallLed(admin: Admin, input: { userId: string; email: string }): Promise<string[]> {
  const out = new Set<string>();
  const email = input.email.trim().toLowerCase();
  if (email) {
    const { data } = await admin
      .from('checkout_clearances')
      .select('plan,period')
      .eq('email', email)
      .is('used_at', null);
    for (const row of (data as { plan: string; period: string }[] | null) ?? []) out.add(`${row.plan}:${row.period}`);
  }
  const { data: sub } = await admin
    .from('subscriptions')
    .select('plan,billing_interval')
    .eq('user_id', input.userId)
    .maybeSingle();
  const row = sub as { plan: string | null; billing_interval: string | null } | null;
  if (row?.plan && row.billing_interval) out.add(`${row.plan}:${row.billing_interval}`);
  return [...out];
}

export async function grantClearance(
  admin: Admin,
  input: { email: string; plan: PricingTierId; period: BillingInterval; clearedBy: string }
): Promise<boolean> {
  const { error } = await admin.from('checkout_clearances').insert({
    email: input.email.trim().toLowerCase(),
    plan: input.plan,
    period: input.period,
    cleared_by: input.clearedBy,
  });
  return !error;
}

/** Stamps the oldest unused clearance used once the payment clears. Never throws. */
export async function consumeClearance(
  admin: Admin,
  input: { email: string; plan: string; period: string }
): Promise<void> {
  try {
    const email = input.email.trim().toLowerCase();
    const { data } = await admin
      .from('checkout_clearances')
      .select('id')
      .eq('email', email)
      .eq('plan', input.plan)
      .eq('period', input.period)
      .is('used_at', null)
      .order('created_at', { ascending: true })
      .limit(1);
    const id = (data as { id: string }[] | null)?.[0]?.id;
    if (id) await admin.from('checkout_clearances').update({ used_at: new Date().toISOString() }).eq('id', id);
  } catch {
    // The payment already cleared; a missed stamp only leaves the link reusable.
  }
}
