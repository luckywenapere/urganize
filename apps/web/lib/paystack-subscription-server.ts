// Paystack subscription disable / enable, shared by the trial cancel, the paid
// cancel and the pause (2026-10-14). Server only.
//
// Lifted out of app/api/billing/cancel-trial/route.ts unchanged in behaviour:
// Paystack's disable and enable calls both need the subscription's
// email_token. Primary source: the payments row's jsonb audit trail written by
// the webhook. Fallback: fetch the subscription from Paystack.
//
// Disable is how every cancel in this codebase works: status -> 'cancelled' but
// expires_at is KEPT, so access runs to the end of the period (resolveSnapshot
// treats cancelled + not expired as access) and no further charge happens.
//
// Enable is used for exactly one thing: undoing a cancel or a pause while the
// paid period is STILL RUNNING. The subscription's next payment date is then
// still in the future, so Paystack simply charges on it as it would have. Once
// the period has ended the app never re-enables; the owner pays through a
// normal checkout instead, so no money moves without them there.

import type { SupabaseClient } from '@supabase/supabase-js';

const PAYSTACK_SUBSCRIPTION_URL = 'https://api.paystack.co/subscription';

export type PaystackSubscriptionRow = {
  paystack_subscription_code: string | null;
  paystack_reference: string | null;
};

export type PaystackToggleResult = { ok: true } | { ok: false; error: string; status: number };

export async function resolvePaystackEmailToken(
  admin: SupabaseClient,
  subscription: PaystackSubscriptionRow,
  secretKey: string
): Promise<string | null> {
  const code = String(subscription.paystack_subscription_code || '').trim();
  if (!code) return null;

  if (subscription.paystack_reference) {
    const { data: paymentRow } = await admin
      .from('payments')
      .select('paystack_response')
      .eq('reference', subscription.paystack_reference)
      .maybeSingle();
    const stored = (paymentRow?.paystack_response as Record<string, unknown> | null)?.email_token;
    if (typeof stored === 'string' && stored.trim()) return stored.trim();
  }

  try {
    const response = await fetch(`${PAYSTACK_SUBSCRIPTION_URL}/${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      status?: boolean;
      data?: { email_token?: string };
    };
    if (response.ok && payload?.status && payload.data?.email_token) return payload.data.email_token;
  } catch {
    // fall through
  }
  return null;
}

async function toggle(
  action: 'disable' | 'enable',
  code: string,
  token: string,
  secretKey: string
): Promise<PaystackToggleResult> {
  try {
    const response = await fetch(`${PAYSTACK_SUBSCRIPTION_URL}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, token }),
    });
    const payload = (await response.json().catch(() => ({}))) as { status?: boolean; message?: string };
    if (response.ok && payload?.status) return { ok: true };
    // Disabling an already-disabled subscription (or enabling an active one)
    // IS the goal, so treat Paystack's "not active" / "already" as success.
    const message = payload?.message || '';
    if (action === 'disable' && /not\s*active|already/i.test(message)) return { ok: true };
    if (action === 'enable' && /already\s*active/i.test(message)) return { ok: true };
    return {
      ok: false,
      status: 502,
      error: message || (action === 'disable' ? 'Could not cancel the upcoming charge.' : 'Could not restart the plan.'),
    };
  } catch {
    return { ok: false, status: 502, error: 'Could not reach the payment provider. Try again.' };
  }
}

/** Stop the next charge. Resolves the email token itself. */
export async function disablePaystackSubscription(
  admin: SupabaseClient,
  subscription: PaystackSubscriptionRow,
  secretKey: string
): Promise<PaystackToggleResult> {
  const code = String(subscription.paystack_subscription_code || '').trim();
  if (!code) return { ok: false, status: 400, error: 'No subscription to cancel on this account.' };
  const token = await resolvePaystackEmailToken(admin, subscription, secretKey);
  if (!token) {
    return {
      ok: false,
      status: 502,
      error: 'Could not resolve the subscription token. Contact support and the charge will be stopped manually.',
    };
  }
  return toggle('disable', code, token, secretKey);
}

/** Undo a disable while the paid period is still running. See the header. */
export async function enablePaystackSubscription(
  admin: SupabaseClient,
  subscription: PaystackSubscriptionRow,
  secretKey: string
): Promise<PaystackToggleResult> {
  const code = String(subscription.paystack_subscription_code || '').trim();
  if (!code) return { ok: false, status: 400, error: 'No subscription to restart on this account.' };
  const token = await resolvePaystackEmailToken(admin, subscription, secretKey);
  if (!token) return { ok: false, status: 502, error: 'Could not restart the plan. Contact support.' };
  return toggle('enable', code, token, secretKey);
}
