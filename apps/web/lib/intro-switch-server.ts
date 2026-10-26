import type { SupabaseClient } from '@supabase/supabase-js';
import { getIntroPrice, INTRO_MONTHS } from '@urganize/pricing';
import { getTierPaystackPlanCode, isSelfServeTier } from './billing-plans';
import { notifyFounder } from './billing-alerts-server';
import { disablePaystackSubscription } from './paystack-subscription-server';

// After a card team's 6th starting-price payment, move it onto the full-price
// Plan (founder, 2026-10-26). Called by the Paystack webhook.
//
// A Paystack subscription cannot change its Plan, so this starts a new one on
// the full-price Plan with the same card, first charged when the current
// period ends, and stops the old one.
//
// ORDER MATTERS. The new code is written to our row BEFORE the old subscription
// is disabled: handleSubscriptionDisable marks whatever row holds the disabled
// code as cancelled, and that must not be this team.
//
// If anything fails the founder is told to do the switch by hand, the same
// "swap" step plan changes already use. The starting-price Plans are minted with
// invoice_limit 6, so a failed switch never means a 7th cheap month: the old
// subscription simply ends and the team renews on the wall at full price.

const PAYSTACK_SUBSCRIPTION_URL = 'https://api.paystack.co/subscription';

export async function switchToFullPrice(
  admin: SupabaseClient,
  input: {
    userId: string;
    plan: string;
    customerCode: string | null;
    authorizationCode: string | null;
    oldSubscriptionCode: string | null;
    /** When the new subscription's first charge falls: the end of the period
     *  just paid. */
    startAt: string | null;
  }
): Promise<{ ok: boolean; reason?: string }> {
  const fail = async (reason: string) => {
    console.error('[intro-switch] switch to full price failed:', reason, input.userId);
    await tellFounder(admin, input, reason).catch(() => undefined);
    return { ok: false, reason };
  };

  if (!isSelfServeTier(input.plan) || !getIntroPrice(input.plan)) return { ok: false, reason: 'no_starting_price' };
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return fail('PAYSTACK_SECRET_KEY not set');
  const fullPlanCode = getTierPaystackPlanCode(input.plan, 'monthly');
  if (!fullPlanCode) return fail(`full-price Plan for ${input.plan} not set`);
  if (!input.customerCode || !input.authorizationCode) return fail('no customer or card authorization on the charge');

  let newCode: string | null = null;
  try {
    const response = await fetch(PAYSTACK_SUBSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: input.customerCode,
        plan: fullPlanCode,
        authorization: input.authorizationCode,
        ...(input.startAt ? { start_date: input.startAt } : {}),
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
      data?: { subscription_code?: string };
    };
    if (!response.ok || !payload.status || !payload.data?.subscription_code) {
      return fail(payload.message || `Paystack answered ${response.status}`);
    }
    newCode = payload.data.subscription_code;
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'could not reach Paystack');
  }

  const { error: writeError } = await admin
    .from('subscriptions')
    .update({ paystack_subscription_code: newCode, updated_at: new Date().toISOString() })
    .eq('user_id', input.userId);
  if (writeError) return fail(`new subscription ${newCode} made but not saved: ${writeError.message}`);

  if (input.oldSubscriptionCode && input.oldSubscriptionCode !== newCode) {
    const stopped = await disablePaystackSubscription(
      admin,
      { paystack_subscription_code: input.oldSubscriptionCode, paystack_reference: null },
      secretKey
    );
    if (!stopped.ok) return fail(`new subscription ${newCode} started, old ${input.oldSubscriptionCode} not stopped: ${stopped.error}`);
  }
  return { ok: true };
}

async function tellFounder(
  admin: SupabaseClient,
  input: { userId: string; plan: string; oldSubscriptionCode: string | null; startAt: string | null },
  reason: string
): Promise<void> {
  const workspace = await admin.from('workspaces').select('id').eq('owner_id', input.userId).maybeSingle();
  const workspaceId = (workspace.data as { id: string } | null)?.id;
  if (!workspaceId) return;
  await notifyFounder(admin, {
    kind: 'plan_change_requested',
    workspaceId,
    ownerUserId: input.userId,
    actorUserId: null,
    planViewed: input.plan,
    note: `Starting price ended after ${INTRO_MONTHS} months. Swap the Paystack subscription to the full-price ${input.plan} Plan before ${input.startAt ?? 'the next charge'}. Automatic switch failed: ${reason}`,
    metadata: { direction: 'intro_ended', oldSubscriptionCode: input.oldSubscriptionCode, reason },
  });
}
