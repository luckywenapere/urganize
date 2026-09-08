import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import { isPricingV2Enabled } from '@/lib/entitlements';
import { resolveBillingInterval } from '@/lib/billing-plans';
import {
  PLAN_CHANGE_SOURCE,
  planChangeRefusalMessage,
  quotePlanChange,
  type PlanChangeQuote,
} from '@/lib/plan-change';
import { logBillingEvent } from '@/lib/billing-events-server';
import { notifyFounder } from '@/lib/billing-alerts-server';
import { invalidateSubscriptionSnapshot } from '@/lib/subscription-access';
import { invalidateTeamAccess } from '@/lib/team-billing-server';

// Moving a paying team between tiers.
//
// Paystack has NO plan-change endpoint. A change means disabling the old
// subscription and creating a replacement, and the founder does that by hand
// (founder call, 2026-08-24). So this route's job is to make the decision, take
// the money an upgrade owes, record what is now due at Paystack, and tell the
// founder — not to reshape the subscription itself. The alternative was the app
// disabling and recreating automatically, whose worst failure is a disabled
// subscription with no replacement: invisible until access lapses months later.
//
// THE ARITHMETIC IS NOT HERE. lib/plan-change.ts owns every judgement, because
// this route cannot be reached from a test without mocking Supabase and
// Paystack, and it decides how much real money is charged. This file executes
// the quote and nothing more.
//
// WHY THIS IS NOT `start-checkout` WITH A DIFFERENT BODY, which is the obvious
// shape and is wrong twice over. That route initializes a transaction WITH a
// plan code, so Paystack creates a SECOND subscription on the same customer —
// and `subscription.create` matches on `paystack_customer_code`, so the new
// code would overwrite the old one on our single row and orphan a subscription
// that is still billing. It also computes `expires_at` from scratch, which
// would throw away the period the team already paid for. Both are the opposite
// of what an upgrade means.
//
// OPEN ROUTE, deliberately, like cancel-trial beside it. A team in a grace
// window or one whose card just failed still has to be able to move plan; the
// paywall wrapper would refuse exactly the people most likely to want to.

export const dynamic = 'force-dynamic';

const PAYSTACK_INIT_URL = 'https://api.paystack.co/transaction/initialize';

type ChangePlanRequest = { plan?: unknown; interval?: unknown };

function generateReference(): string {
  // Same convention as start-checkout so support tooling filtering by prefix
  // keeps working, with its own infix so a proration charge is identifiable at
  // a glance in the Paystack dashboard.
  return `urganize_change_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function resolveCallbackUrl(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = configured || new URL(request.url).origin;
  return `${base.replace(/\/$/, '')}/payment/callback`;
}

export async function POST(request: NextRequest) {
  // Tier-only feature: quotePlanChange refuses every legacy plan anyway, so
  // with the flag off there is nothing this route could do but refuse.
  if (!isPricingV2Enabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as ChangePlanRequest;
  const targetPlan = typeof body.plan === 'string' ? body.plan : '';
  const targetInterval = typeof body.interval === 'string' ? body.interval : '';
  if (!targetPlan || !targetInterval) {
    return NextResponse.json(
      { error: 'plan and interval are both required.' },
      { status: 400 }
    );
  }

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  // OWNER ONLY. Money rows are keyed to the team owner (subscriptions.user_id),
  // so a change requested by an admin teammate would either edit the wrong row
  // or need the owner's row edited on their behalf without their knowledge.
  // Same reasoning as start-checkout crediting the owner rather than the payer.
  const workspaceResult = await admin
    .from('workspaces')
    .select('id, owner_id')
    .eq('owner_id', auth.user.id)
    .maybeSingle();
  const workspace = workspaceResult.data as { id: string; owner_id: string } | null;
  if (!workspace) {
    return NextResponse.json(
      { error: 'Only the person who owns the team can change its plan.' },
      { status: 403 }
    );
  }

  const subscriptionResult = await admin
    .from('subscriptions')
    .select('id, plan, billing_interval, status, expires_at, paystack_subscription_code, amount')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  const subscription = subscriptionResult.data as {
    id: string;
    plan: string | null;
    billing_interval: string | null;
    status: string | null;
    expires_at: string | null;
    paystack_subscription_code: string | null;
    /** Kobo. The last full period charge, which is what a period of this
     *  subscription costs — see isGrandfatheredRate. */
    amount: number | null;
  } | null;

  if (!subscription) {
    return NextResponse.json(
      { error: 'There is no active plan to change yet. Activate a plan first.' },
      { status: 400 }
    );
  }

  const now = new Date();
  const quote: PlanChangeQuote = quotePlanChange({
    currentPlan: subscription.plan,
    currentInterval: resolveBillingInterval({
      plan: subscription.plan,
      storedInterval: subscription.billing_interval,
    }),
    targetTier: targetPlan,
    targetInterval,
    periodEndsAt: subscription.expires_at,
    // What a period of this subscription actually costs. The 2026-09-08 reprice
    // moved every tier's list price, so pricing a change off the package alone
    // would quote anyone who bought before it against a number they have never
    // paid. See isGrandfatheredRate.
    currentPaidMinorUnit: subscription.amount,
    now,
  });

  if (quote.kind === 'refused') {
    return NextResponse.json(
      { error: planChangeRefusalMessage(quote.reason), reason: quote.reason },
      { status: 400 }
    );
  }

  // Clearing the stored subscription code is what stops the founder's own
  // Paystack action corrupting this row. `handleSubscriptionDisable` stamps
  // status 'cancelled' on whatever row matches the disabled code — so when the
  // founder disables the old subscription as part of the swap, an un-cleared
  // code would turn a healthy upgraded team into one whose Settings reads
  // "Cancelled, access until ...". A renewal arriving in the meantime still
  // matches: the webhook falls back to paystack_customer_code.
  const clearOldCode = { paystack_subscription_code: null as string | null };
  const nowIso = now.toISOString();

  const notify = async (note: string, metadata: Record<string, unknown>) => {
    invalidateSubscriptionSnapshot(auth.user.id);
    invalidateTeamAccess(auth.user.id);
    await notifyFounder(admin, {
      kind: 'plan_change_requested',
      workspaceId: workspace.id,
      ownerUserId: auth.user.id,
      actorUserId: auth.user.id,
      planViewed: quote.targetTier,
      note,
      metadata,
    });
  };

  // ── Downgrade: nothing is charged and nothing is taken away early ──────────
  if (quote.kind === 'downgrade') {
    const { error } = await admin
      .from('subscriptions')
      .update({
        ...clearOldCode,
        pending_plan: quote.targetTier,
        pending_billing_interval: quote.interval,
        pending_change_requested_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', subscription.id);
    if (error) {
      console.error('[billing/change-plan] pending downgrade write failed:', error.message);
      return NextResponse.json({ error: 'Could not record the change.' }, { status: 500 });
    }

    await notify(
      `Downgrade to ${quote.targetTier} (${quote.interval}), effective ${quote.effectiveAt}. Swap the Paystack subscription BEFORE that date or the next charge is at the old, higher price.`,
      {
        direction: 'downgrade',
        from: subscription.plan,
        to: quote.targetTier,
        interval: quote.interval,
        effectiveAt: quote.effectiveAt,
        oldSubscriptionCode: subscription.paystack_subscription_code,
      }
    );

    return NextResponse.json({
      kind: 'downgrade',
      targetPlan: quote.targetTier,
      effectiveAt: quote.effectiveAt,
    });
  }

  // ── Upgrade with nothing chargeable: grant it ─────────────────────────────
  // Late in a period the prorated difference falls below what Paystack will
  // process. See MIN_CHARGEABLE_MINOR_UNIT — charging it would hand the team a
  // broken checkout to buy a few days.
  if (quote.amountMinorUnit === 0) {
    const { error } = await admin
      .from('subscriptions')
      .update({
        ...clearOldCode,
        plan: quote.targetTier,
        billing_interval: quote.interval,
        pending_plan: null,
        pending_billing_interval: null,
        pending_change_requested_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', subscription.id);
    if (error) {
      console.error('[billing/change-plan] free upgrade write failed:', error.message);
      return NextResponse.json({ error: 'Could not apply the change.' }, { status: 500 });
    }

    await notify(
      `Upgrade to ${quote.targetTier} (${quote.interval}), applied with no charge because only ${quote.daysRemaining} day(s) remained. Swap the Paystack subscription before ${quote.periodEndsAt}.`,
      {
        direction: 'upgrade',
        from: subscription.plan,
        to: quote.targetTier,
        interval: quote.interval,
        amountMinorUnit: 0,
        periodEndsAt: quote.periodEndsAt,
        oldSubscriptionCode: subscription.paystack_subscription_code,
      }
    );

    return NextResponse.json({
      kind: 'upgrade_applied',
      targetPlan: quote.targetTier,
      amountMinorUnit: 0,
      periodEndsAt: quote.periodEndsAt,
    });
  }

  // ── Upgrade with a prorated charge ────────────────────────────────────────
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecretKey) {
    return NextResponse.json(
      { error: 'Payment provider is not configured on the server.' },
      { status: 500 }
    );
  }

  const userEmail = String(auth.user.email || '').trim().toLowerCase();
  if (!userEmail) {
    return NextResponse.json({ error: 'No email on file.' }, { status: 400 });
  }

  const reference = generateReference();
  // Reserved BEFORE talking to Paystack, the start-checkout reasoning: an orphan
  // pending row is harmless (the webhook credits nothing on 'pending'), whereas
  // a charge with no row to look up is a payment we would silently drop.
  const paymentInsert = await admin.from('payments').insert({
    user_id: auth.user.id,
    amount: quote.amountMinorUnit,
    reference,
    status: 'pending',
    // The TARGET tier, so the webhook applies the right one without re-quoting.
    plan: quote.targetTier,
    paystack_response: {
      source: PLAN_CHANGE_SOURCE,
      currency: 'NGN',
      selected_interval: quote.interval,
      change_from: subscription.plan,
      // Echoed so the webhook does not have to trust an incoming date and so
      // the audit trail records what the team was actually quoted.
      period_ends_at: quote.periodEndsAt,
      days_remaining: quote.daysRemaining,
      workspace_id: workspace.id,
      old_subscription_code: subscription.paystack_subscription_code,
    },
  });
  if (paymentInsert.error) {
    console.error('[billing/change-plan] payments insert failed:', paymentInsert.error.message);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }

  // NO `plan` PARAM, and that is the whole point of using initialize here: a
  // plan code would have Paystack open a second recurring subscription. This is
  // a one-off top-up charge, the same shape the card-verification charge uses.
  const paystackResponse = await fetch(PAYSTACK_INIT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: userEmail,
      amount: quote.amountMinorUnit,
      reference,
      currency: 'NGN',
      channels: ['card'],
      callback_url: resolveCallbackUrl(request),
      metadata: {
        user_id: auth.user.id,
        plan: quote.targetTier,
        interval: quote.interval,
        currency: 'NGN',
        source: PLAN_CHANGE_SOURCE,
        workspace_id: workspace.id,
      },
    }),
  });

  const initPayload = (await paystackResponse.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; access_code?: string; reference?: string };
  };

  if (!paystackResponse.ok || !initPayload?.status || !initPayload.data?.authorization_url) {
    // Drop the reservation, matching start-checkout: a pending row for a
    // checkout that never opened is noise in the ledger.
    await admin.from('payments').delete().eq('reference', reference);
    console.error('[billing/change-plan] paystack init failed:', initPayload?.message);
    return NextResponse.json(
      { error: initPayload?.message || 'Could not start checkout.' },
      { status: 502 }
    );
  }

  await logBillingEvent(admin, {
    workspaceId: workspace.id,
    ownerUserId: auth.user.id,
    actorUserId: auth.user.id,
    type: 'checkout_started',
    metadata: {
      source: PLAN_CHANGE_SOURCE,
      from: subscription.plan,
      to: quote.targetTier,
      interval: quote.interval,
      amountMinorUnit: quote.amountMinorUnit,
      reference,
    },
  });

  return NextResponse.json({
    kind: 'upgrade_checkout',
    targetPlan: quote.targetTier,
    amountMinorUnit: quote.amountMinorUnit,
    daysRemaining: quote.daysRemaining,
    periodEndsAt: quote.periodEndsAt,
    authorizationUrl: initPayload.data.authorization_url,
    reference,
  });
}
