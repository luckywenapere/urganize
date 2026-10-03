import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlanExpiry } from '@/lib/billing';
import {
  advancePeriodEnd,
  getPaystackPlanCode,
  getPlanMinorUnit,
  identifyPlanByCode,
  isRecurringPlan,
  planCodeMatchesSubscription,
  type RecurringPlanId,
} from '@/lib/billing-plans';
import { invalidateSubscriptionSnapshot } from '@/lib/subscription-access';
import { isHardPaywallEnabled } from '@/lib/team-billing';
import { invalidateTeamAccess } from '@/lib/team-billing-server';
import { notifyFounder } from '@/lib/billing-alerts-server';
import { PLAN_CHANGE_SOURCE } from '@/lib/plan-change';
import { recordSubscriptionCharge, rewardReferrerOnFirstPayment } from '@/lib/referrals-server';
import {
  TRIAL_CARD_PLAN,
  buildDelayedSubscriptionPayload,
  computeTrialEnd,
  extractReusableAuthorization,
  isCardTrialPlan,
} from '@/lib/trial-card';
import { isPitchPaymentReference } from '@/lib/pitch-payments';
import { isCreditsReference } from '@/lib/credits/purchase';
import { settleCreditsPurchase } from '@/lib/credits/purchase-server';
import { handlePitchChargeEvent, handlePitchRefundEvent } from '@/lib/pitch-payments-server';

// ─────────────────────────────────────────────────────────────────────────────
// Paystack webhook — recurring billing edition.
//
// Events we handle:
//   charge.success         — initial purchase OR renewal of a recurring plan.
//                            Initial: look up payments by reference, credit
//                            the bound user_id, advance expires_at by one
//                            period. Renewal: reference is fresh per invoice
//                            and NOT in our payments table, so match the
//                            subscription by paystack_subscription_code and
//                            extend expires_at.
//   subscription.create    — Paystack created a subscription object after
//                            our initial charge. Store the subscription_code
//                            on the user's subscriptions row so future
//                            renewal charge.success events can match.
//   subscription.disable   — Customer cancelled or Paystack disabled after
//                            failed retries. Mark status='cancelled' but
//                            KEEP expires_at — the user paid for the current
//                            period and keeps access until it lapses.
//   invoice.payment_failed — Renewal attempt failed. Mark past_due, log, alert
//                            the founder, no immediate revoke. Paystack retries
//                            3× over ~72h; if all fail, subscription.disable
//                            lands. Grace period is implicit: the user has
//                            access until expires_at, which is the end of the
//                            period they already paid for. Under the hard
//                            paywall, a lapse from here lands in READ-ONLY
//                            rather than at the wall — they have paid us before.
//
// What we no longer do:
//   - Email-match standalone payments. The old ₦15,000 hosted-page flow has
//     been removed; the homepage `/pay` redirect is gone, the locked page
//     points at the app-initiated checkout, and no new 'access' rows are
//     created. The 3 grandfathered 'access' customers keep their access
//     through subscription-access.ts's snapshot resolver until their existing
//     expires_at lapses; this webhook never needs to write to their rows.
// ─────────────────────────────────────────────────────────────────────────────

type PaystackAuthorization = {
  authorization_code?: string;
  signature?: string;
  reusable?: boolean;
};

type PaystackPlanRef = {
  plan_code?: string;
  name?: string;
};

type PaystackCustomerRef = {
  customer_code?: string;
  email?: string;
};

type PaystackSubscriptionRef = {
  subscription_code?: string;
  status?: string;
};

type PaystackWebhookPayload = {
  event?: string;
  data?: {
    // charge.success / invoice.* shape
    reference?: string;
    amount?: number;
    authorization?: PaystackAuthorization;
    customer?: PaystackCustomerRef;
    plan?: PaystackPlanRef | string;
    subscription?: PaystackSubscriptionRef;
    metadata?: Record<string, unknown>;
    // subscription.create / subscription.disable shape
    subscription_code?: string;
    plan_code?: string;
    next_payment_date?: string;
    status?: string;
  };
};

const validateSignature = (rawBody: string, signature: string | null, secret: string): boolean => {
  if (!signature) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  // Constant-time compare to avoid signature-timing oracle. Lengths must
  // match before timingSafeEqual; mismatched lengths short-circuit false.
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
};

const createAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
};

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const ack = (body: Record<string, unknown>) =>
  NextResponse.json({ received: true, ...body }, { status: 200 });

const planRef = (raw: PaystackWebhookPayload['data']): PaystackPlanRef | null => {
  const plan = raw?.plan;
  if (!plan) return null;
  if (typeof plan === 'string') {
    // Some Paystack events deliver just the plan_code string.
    return { plan_code: plan };
  }
  return plan;
};

// ─── credit-user helpers ─────────────────────────────────────────────────────

/**
 * The billing interval start-checkout recorded on the payments row.
 *
 * Narrowed rather than cast: this comes out of a jsonb column, so it is
 * `unknown` as far as the type system is concerned, and anything that is not
 * exactly 'monthly' or 'annual' must become null so the resolver falls back to
 * plan-name inference instead of trusting a malformed value.
 */
function readSelectedInterval(
  paystackResponse: Record<string, unknown> | null
): 'monthly' | 'annual' | null {
  const value = paystackResponse?.selected_interval;
  return value === 'monthly' || value === 'annual' ? value : null;
}

async function applyInitialOrManualCharge(
  admin: AdminClient,
  userId: string,
  plan: RecurringPlanId | 'access' | 'custom',
  amountMinorUnit: number,
  reference: string,
  customerCode: string | null,
  subscriptionCode: string | null,
  now: Date,
  /** The interval the customer chose at checkout, from
   *  payments.paystack_response.selected_interval. Null for a legacy plan id,
   *  whose name already carries its interval. Persisting it is what lets every
   *  future RENEWAL know the period: a renewal has no payments row to read, so
   *  the subscription row is the only place this fact can live. */
  billingInterval: 'monthly' | 'annual' | null = null
) {
  const expiresAt = getPlanExpiry(plan, now, billingInterval);

  const { error: subError } = await admin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan,
        billing_interval: billingInterval,
        // A fresh purchase supersedes anything that was waiting. Without this,
        // a team whose period lapsed with a downgrade pending would re-activate
        // on the tier they just bought and then be silently moved off it at the
        // next renewal by a request they made months ago.
        pending_plan: null,
        pending_billing_interval: null,
        pending_change_requested_at: null,
        status: 'active',
        amount: amountMinorUnit,
        paystack_reference: reference,
        paystack_customer_code: customerCode,
        paystack_subscription_code: subscriptionCode,
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id' }
    );
  if (subError) {
    console.error('[paystack-webhook] subscription upsert error:', subError.message);
  }

  // THE PROFILE WRITE IS LOAD-BEARING, AND IT USED TO BE FIRE-AND-FORGET.
  //
  // `paid_at` is the read-only discriminator: `lapsedFromPayment` reads exactly
  // this field to decide, when a period ends unpaid, whether the team gets
  // read-only (kept every read, forever) or the full wall. So a subscription row
  // saying `active` with `paid_at` still null is not a cosmetic gap — it is a
  // customer who paid us, and who will be walled instead of read-only when their
  // renewal eventually fails. The old code logged that and returned 200, which
  // told Paystack the delivery succeeded and guaranteed it would never be retried.
  //
  // One retry, then surface it. Both writes above and here are idempotent (an
  // upsert on user_id, and an absolute-valued update), so a Paystack redelivery
  // is safe and is the only mechanism that can still repair this.
  let profileError = (
    await admin
      .from('profiles')
      .update({ is_subscribed: true, paid_at: now.toISOString() })
      .eq('id', userId)
  ).error;

  if (profileError) {
    console.error(
      '[paystack-webhook] profile update error, retrying once:',
      profileError.message
    );
    profileError = (
      await admin
        .from('profiles')
        .update({ is_subscribed: true, paid_at: now.toISOString() })
        .eq('id', userId)
    ).error;
  }

  // Reported to the caller rather than swallowed. The subscription row is
  // already correct, so access is granted either way and the customer is not
  // blocked — what a redelivery buys us is the stamp that decides how they are
  // treated months later.
  const profileWriteFailed = Boolean(profileError);
  if (profileWriteFailed) {
    console.error(
      '[paystack-webhook] profile update failed twice; asking Paystack to redeliver:',
      profileError?.message
    );
  }

  invalidateSubscriptionSnapshot(userId);
  // The team resolver caches positive answers per user; this user just became
  // paid, but their TEAMMATES may hold a cached walled answer. Their negatives
  // were never cached (positive-only), so they resolve fresh on the next
  // request — only the payer's own entry needs clearing.
  invalidateTeamAccess(userId);

  // A team just paid. Fire-and-forget after the credit has landed: the founder
  // wants to know, but an alert must never turn a successful payment into a
  // failed webhook. Guarded by the flag so nothing changes while it is off.
  if (isHardPaywallEnabled()) {
    void (async () => {
      try {
        const workspaceResult = await admin
          .from('workspaces')
          .select('id')
          .eq('owner_id', userId)
          .maybeSingle();
        const workspaceId = (workspaceResult.data as { id: string } | null)?.id;
        if (!workspaceId) return;
        await notifyFounder(admin, {
          kind: 'checkout_completed',
          workspaceId,
          ownerUserId: userId,
          actorUserId: userId,
          planViewed: plan,
          metadata: { plan, amountMinorUnit, reference },
        });
      } catch {
        // Never surface: the money is already credited.
      }
    })();
  }

  return { profileWriteFailed };
}

/** The `source` start-checkout or change-plan wrote into the payments jsonb.
 *  Narrowed rather than cast: it comes out of a jsonb column. */
function readChargeSource(paystackResponse: Record<string, unknown> | null): string | null {
  const value = paystackResponse?.source;
  return typeof value === 'string' ? value : null;
}

/**
 * A plan-change top-up cleared. Apply the new tier and leave the period alone.
 *
 * THE THREE THINGS THIS DOES NOT DO are the design:
 *   - It does not touch `expires_at`. The team paid the DIFFERENCE for the days
 *     they already own; moving the end date would be charging them for a period
 *     twice.
 *   - It does not touch `paystack_subscription_code`, which change-plan already
 *     cleared. Restoring it here would let the founder's disable (part of the
 *     manual swap) stamp status 'cancelled' over a perfectly healthy row.
 *   - It does not create or alter anything at Paystack. The swap is the
 *     founder's, and the alert below is what tells them it is owed.
 *
 * Idempotent: a re-delivered charge.success writes the same values.
 */
async function handlePlanChangeCharge(
  admin: AdminClient,
  payment: { id: string; user_id: string; plan: string; amount?: number | null; paystack_response: Record<string, unknown> | null },
  reference: string,
  now: Date
) {
  const targetPlan = String(payment.plan);
  const interval = readSelectedInterval(payment.paystack_response);
  const nowIso = now.toISOString();

  const { error: subError } = await admin
    .from('subscriptions')
    .update({
      plan: targetPlan,
      billing_interval: interval,
      // Whatever was waiting is now in effect, so the pending record is spent.
      pending_plan: null,
      pending_billing_interval: null,
      pending_change_requested_at: nowIso,
      status: 'active',
      paystack_reference: reference,
      updated_at: nowIso,
    })
    .eq('user_id', payment.user_id);
  if (subError) {
    // Logged, not retried. The money is taken and the payments row records what
    // it was for, so the founder can reconcile from the ledger — and returning
    // non-200 would only make Paystack redeliver into the same failure.
    console.error('[paystack-webhook] plan change subscription update error:', subError.message);
  }

  invalidateSubscriptionSnapshot(payment.user_id);
  invalidateTeamAccess(payment.user_id);

  const workspaceId = readWorkspaceId(payment.paystack_response);
  if (workspaceId) {
    void (async () => {
      try {
        await notifyFounder(admin, {
          kind: 'plan_change_requested',
          workspaceId,
          ownerUserId: payment.user_id,
          actorUserId: payment.user_id,
          planViewed: targetPlan,
          note: `Prorated upgrade to ${targetPlan} has been PAID and applied. Swap their Paystack subscription to the ${targetPlan} plan before ${String(payment.paystack_response?.period_ends_at ?? 'the next charge')} or the next renewal bills the old price.`,
          metadata: {
            direction: 'upgrade',
            from: payment.paystack_response?.change_from ?? null,
            to: targetPlan,
            interval,
            reference,
            paid: true,
            oldSubscriptionCode: payment.paystack_response?.old_subscription_code ?? null,
          },
        });
      } catch {
        // Never surface: the upgrade is already applied.
      }
    })();
  }

  // The top-up is a subscription payment like any other, so it goes in the
  // ledger referral commission is worked out from. Best effort: never throws.
  await recordSubscriptionCharge(admin, {
    userId: payment.user_id,
    reference,
    amountKobo: Number(payment.amount) || 0,
    plan: targetPlan,
    source: 'plan_change',
    chargedAt: now,
  });

  return ack({ event: 'charge.success', reference, matched: 'plan_change', plan: targetPlan });
}

/** The workspace id change-plan stashed in the jsonb, for the founder alert. */
function readWorkspaceId(paystackResponse: Record<string, unknown> | null): string | null {
  const value = paystackResponse?.workspace_id;
  return typeof value === 'string' && value.trim() ? value : null;
}

async function applyRenewal(
  admin: AdminClient,
  userId: string,
  plan: RecurringPlanId,
  currentExpiresAt: string | null,
  amountMinorUnit: number,
  reference: string,
  now: Date,
  /** subscriptions.billing_interval, read on the same row as the plan. Without
   *  it a tier subscription cannot be extended correctly, because the plan name
   *  does not say whether a period is a month or a year. */
  billingInterval: string | null = null,
  /** A downgrade the team agreed to, waiting for this moment. See below. */
  pending: { plan: string | null; interval: string | null } = { plan: null, interval: null }
) {
  // Renewal extends from the CURRENT expires_at (not now) so a renewal that
  // arrives a day late doesn't shorten the user's paid window. `advancePeriodEnd`
  // handles the "current end is in the past" edge (e.g. after a long pause)
  // by basing forward from now instead.
  //
  // THIS IS WHERE A DOWNGRADE LANDS, and it is the only place it can. A
  // downgrade charges nothing and takes nothing away early: the team keeps the
  // tier they paid for until the period they paid for ends, which is exactly
  // now. The period is advanced using the OUTGOING plan's interval, because
  // that is what the charge that just cleared was for — a self-serve change
  // cannot cross intervals anyway, so the two agree in practice.
  const currentEnd = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const nextEnd = advancePeriodEnd(plan, currentEnd, now, billingInterval);

  const applyPending = Boolean(pending.plan);

  const { error: subError } = await admin
    .from('subscriptions')
    .update({
      status: 'active',
      amount: amountMinorUnit,
      paystack_reference: reference,
      expires_at: nextEnd.toISOString(),
      ...(applyPending
        ? {
            plan: pending.plan,
            billing_interval: pending.interval ?? billingInterval,
            pending_plan: null,
            pending_billing_interval: null,
            pending_change_requested_at: null,
          }
        : {}),
      updated_at: now.toISOString(),
    })
    .eq('user_id', userId);
  if (subError) {
    console.error('[paystack-webhook] renewal subscription update error:', subError.message);
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({ is_subscribed: true, paid_at: now.toISOString() })
    .eq('id', userId);
  if (profileError) {
    console.error('[paystack-webhook] renewal profile update error:', profileError.message);
  }

  invalidateSubscriptionSnapshot(userId);
}

// ─── card-before-trial (NEXT_PUBLIC_FEATURE_CARD_TRIAL) ─────────────────────
//
// The ₦100 card-verification charge reserved by /api/trial/start-checkout.
// Order of operations is load-bearing:
//   1. Idempotency: a row no longer 'pending' was already handled — ack and
//      never re-create the subscription or re-refund.
//   2. Claim via compare-and-set (status='success' WHERE status='pending' with
//      .select()). Keeps the repo's flip-first shape while making everything
//      downstream at-most-once: two concurrent deliveries would otherwise BOTH
//      create a delayed Paystack subscription = double charge on day 28.
//   3-4. Validate the selected plan + the reusable authorization. Failures
//      here mark the row 'failed' (with a reason), refund, and leave
//      trial_used untouched so the user can retry with another card.
//   5. Create the Paystack subscription with start_date = trial end — this is
//      what bills the card when the trial lapses. Failure → same fail path.
//   6-7. subscriptions row (status 'trialing' → snapshot path 2 grants trial
//      access) + profile trial fields (service-role required — the protective
//      trigger blocks self-writes). NOT is_subscribed / paid_at: nothing has
//      been bought yet.
//   9. Refund LAST, log-only: a refund hiccup must never fail a flow whose
//      trial is already live.
//
// Deliberately NO feature-flag check here: money already moved, so in-flight
// events must process even after a flag-off rollback.

type TrialCardPaymentRow = {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  amount: number;
  paystack_response: Record<string, unknown> | null;
};

const PAYSTACK_SUBSCRIPTION_URL = 'https://api.paystack.co/subscription';
const PAYSTACK_REFUND_URL = 'https://api.paystack.co/refund';

async function refundTrialCardCharge(
  reference: string,
  secretKey: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(PAYSTACK_REFUND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transaction: reference }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
    };
    if (!response.ok || !payload?.status) {
      const message = payload?.message || `refund HTTP ${response.status}`;
      console.error('[trial-card] refund failed (log-only):', reference, message);
      return { ok: false, message };
    }
    return { ok: true, message: payload.message || 'refund initiated' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'refund request failed';
    console.error('[trial-card] refund failed (log-only):', reference, message);
    return { ok: false, message };
  }
}

async function failTrialCardCharge(
  admin: AdminClient,
  payment: TrialCardPaymentRow,
  reference: string,
  secretKey: string,
  reason: string,
  detail?: string
) {
  const refund = await refundTrialCardCharge(reference, secretKey);
  const { error } = await admin
    .from('payments')
    .update({
      status: 'failed',
      paystack_response: {
        ...(payment.paystack_response || {}),
        failure_reason: reason,
        failure_detail: detail || null,
        refund,
      },
    })
    .eq('id', payment.id);
  if (error) {
    console.error('[trial-card] failed-state update error:', error.message);
  }
  console.warn('[trial-card] charge failed:', { reference, reason, detail });
  return ack({ event: 'charge.success', reference, matched: 'trial_card', failed: reason });
}

async function handleTrialCardCharge(
  admin: AdminClient,
  payment: TrialCardPaymentRow,
  payload: PaystackWebhookPayload,
  reference: string,
  now: Date
) {
  // 1. Idempotency — success AND failed rows are terminal for this reference.
  if (payment.status !== 'pending') {
    return ack({ event: 'charge.success', reference, matched: 'trial_card', skipped: payment.status });
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY || '';

  // 2. Claim (compare-and-set). Zero rows back = a concurrent delivery won the
  // race — ack and do nothing. A DB error leaves the row 'pending' so
  // Paystack's retry reprocesses cleanly.
  const claim = await admin
    .from('payments')
    .update({ status: 'success' })
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id');
  if (claim.error) {
    console.error('[trial-card] claim update error:', claim.error.message);
    return ack({ event: 'charge.success', reference, matched: 'trial_card', error: 'claim_failed' });
  }
  if (!claim.data || claim.data.length === 0) {
    return ack({ event: 'charge.success', reference, matched: 'trial_card', skipped: 'claimed_elsewhere' });
  }

  // 3. Resolve the plan the user picked at checkout time (server-written into
  // the jsonb by start-checkout — the trusted source).
  const selectedPlan = payment.paystack_response?.selected_plan;
  const planCode = isCardTrialPlan(selectedPlan)
    ? getPaystackPlanCode(selectedPlan, 'NGN')
    : null;
  if (!isCardTrialPlan(selectedPlan) || !planCode) {
    return failTrialCardCharge(
      admin,
      payment,
      reference,
      secretKey,
      'plan_unresolvable',
      `selected_plan=${String(selectedPlan)}`
    );
  }

  // 4. The card must be reusable — otherwise it cannot be billed at trial end
  // and the whole promise of this flow is void. The user is refunded and can
  // retry with a different card (trial_used is only ever set on success).
  const authorization = extractReusableAuthorization(payload.data?.authorization);
  const customerCode = payload.data?.customer?.customer_code || null;
  if (!authorization || !customerCode) {
    return failTrialCardCharge(
      admin,
      payment,
      reference,
      secretKey,
      'card_not_reusable'
    );
  }

  // 5. Create the delayed Paystack subscription — start_date = trial end is
  // Paystack's documented free-trial mechanism. On day 28 it charges the saved
  // card; that charge.success arrives with a fresh reference, matches our
  // subscriptions row by paystack_subscription_code, and the existing renewal
  // path flips the account to paid. Trial→paid conversion is zero new code.
  const trialEnd = computeTrialEnd(now);
  let subscriptionCode: string | null = null;
  let emailToken: string | null = null;
  try {
    const response = await fetch(PAYSTACK_SUBSCRIPTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        buildDelayedSubscriptionPayload({
          customerCode,
          planCode,
          authorizationCode: authorization.authorizationCode,
          startDate: trialEnd,
        })
      ),
    });
    const subPayload = (await response.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
      data?: { subscription_code?: string; email_token?: string };
    };
    if (!response.ok || !subPayload?.status || !subPayload.data?.subscription_code) {
      return failTrialCardCharge(
        admin,
        payment,
        reference,
        secretKey,
        'subscription_create_failed',
        subPayload?.message || `HTTP ${response.status}`
      );
    }
    subscriptionCode = subPayload.data.subscription_code;
    emailToken = subPayload.data.email_token || null;
  } catch (error) {
    return failTrialCardCharge(
      admin,
      payment,
      reference,
      secretKey,
      'subscription_create_failed',
      error instanceof Error ? error.message : 'request failed'
    );
  }

  const userId = payment.user_id;

  // 6. The trialing subscriptions row — snapshot path 2 ('trialing' + not
  // expired) grants trial access. amount records what WILL be charged at
  // trial end. Errors past this point log CRITICAL and continue: the remote
  // Paystack subscription already exists, so bailing here helps nobody — the
  // profile trial fields below are a redundant access path, and the founder
  // reconciles from the log + the jsonb audit trail.
  const { error: subError } = await admin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan: selectedPlan,
        status: 'trialing',
        amount: getPlanMinorUnit(selectedPlan, 'NGN'),
        paystack_reference: reference,
        paystack_customer_code: customerCode,
        paystack_subscription_code: subscriptionCode,
        started_at: now.toISOString(),
        expires_at: trialEnd.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id' }
    );
  if (subError) {
    console.error('[trial-card] CRITICAL subscription upsert error (remote subscription exists, reconcile manually):', {
      reference,
      subscription_code: subscriptionCode,
      message: subError.message,
    });
  }

  // 7. Profile trial fields — the same three columns /api/trial/start writes.
  // NOT is_subscribed / paid_at: nothing has been bought yet.
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      trial_used: true,
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', userId);
  if (profileError) {
    console.error('[trial-card] CRITICAL profile trial-fields update error:', {
      reference,
      message: profileError.message,
    });
  }

  // 8.
  invalidateSubscriptionSnapshot(userId);

  // 9. Refund the verification charge — last and log-only.
  const refund = await refundTrialCardCharge(reference, secretKey);

  // 10. Audit trail: everything the cancel route and support need lives on the
  // payments row's jsonb (no new columns). email_token is what
  // POST /subscription/disable requires; the raw authorization (incl.
  // signature) is kept verbatim for future card-dedupe work.
  const { error: auditError } = await admin
    .from('payments')
    .update({
      paystack_response: {
        ...(payment.paystack_response || {}),
        authorization: authorization.raw,
        customer_code: customerCode,
        subscription_code: subscriptionCode,
        email_token: emailToken,
        trial_ends_at: trialEnd.toISOString(),
        refund,
      },
    })
    .eq('id', payment.id);
  if (auditError) {
    console.error('[trial-card] audit-trail update error:', auditError.message);
  }

  return ack({
    event: 'charge.success',
    reference,
    matched: 'trial_card',
    plan: selectedPlan,
    trial_ends_at: trialEnd.toISOString(),
  });
}

// ─── event handlers ──────────────────────────────────────────────────────────

async function handleChargeSuccess(payload: PaystackWebhookPayload) {
  const reference = payload.data?.reference;
  if (!reference) {
    return ack({ event: 'charge.success', error: 'no reference' });
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error('[paystack-webhook] Missing Supabase env vars');
    return ack({ event: 'charge.success' });
  }

  const now = new Date();
  const amountMinorUnit = Number(payload.data?.amount) || 0;
  const customerCode = payload.data?.customer?.customer_code || null;
  const subscriptionRef = payload.data?.subscription || null;
  const planRefObj = planRef(payload.data);
  const incomingPlanCode = planRefObj?.plan_code || null;

  // 1. INITIAL CHARGE — payments row exists with our reserved reference.
  //    This path covers the first charge of a new subscription. Plan is
  //    written on the payments row at start-checkout time and is the
  //    source of truth here.
  const { data: payment, error: paymentLookupError } = await admin
    .from('payments')
    .select('id,user_id,plan,status,amount,paystack_response')
    .eq('reference', reference)
    .maybeSingle();

  if (paymentLookupError) {
    console.error('[paystack-webhook] payments lookup error:', paymentLookupError.message);
    return ack({ event: 'charge.success', error: 'payments_lookup_failed' });
  }

  if (payment?.user_id && payment.plan) {
    const userId = payment.user_id;
    const planString = String(payment.plan);

    // Card-verification charge for the card-before-trial flow. MUST divert
    // before the generic flip/crediting below: the ₦100 card check is not a
    // purchase, and letting it fall through would mark the user subscribed.
    if (planString === TRIAL_CARD_PLAN) {
      return handleTrialCardCharge(admin, payment as TrialCardPaymentRow, payload, reference, now);
    }

    // A prorated plan-change top-up. MUST divert before the recurring branch
    // below for a different reason than the card check: `plan` here IS a real
    // tier id, so isRecurringPlan accepts it and applyInitialOrManualCharge
    // would upsert a fresh expires_at from getPlanExpiry — throwing away the
    // period the team already paid for, which is the one thing an upgrade
    // promises not to do. Keyed on the jsonb source, not on `plan`.
    if (readChargeSource(payment.paystack_response) === PLAN_CHANGE_SOURCE) {
      return handlePlanChangeCharge(admin, payment, reference, now);
    }

    // Flip the reserved row to success (idempotent — re-deliveries hit this).
    if (payment.status !== 'success') {
      const { error: updateError } = await admin
        .from('payments')
        .update({ status: 'success' })
        .eq('id', payment.id);
      if (updateError) {
        console.error('[paystack-webhook] payments status update error:', updateError.message);
      }
    }

    if (isRecurringPlan(planString)) {
      // First charge of a new recurring subscription. Paystack will fire
      // subscription.create shortly with the subscription_code; we may
      // already have it here in `data.subscription` though, so persist
      // either way and let subscription.create be idempotent.
      const subscriptionCode = subscriptionRef?.subscription_code || null;
      // The interval start-checkout wrote into the jsonb, which is the trusted
      // source here for the same reason `plan` is: both were written server-side
      // by us, not echoed back from Paystack. A tier plan needs it — its name
      // does not say whether the customer bought a month or a year — and a
      // legacy plan does not, so absent stays absent.
      const selectedInterval = readSelectedInterval(payment.paystack_response);
      const applied = await applyInitialOrManualCharge(
        admin,
        userId,
        planString,
        amountMinorUnit,
        reference,
        customerCode,
        subscriptionCode,
        now,
        selectedInterval
      );
      // A failed `paid_at` stamp is the one thing here worth a redelivery — see
      // the block inside applyInitialOrManualCharge. 500 rather than ack, so
      // Paystack retries; every write on this path is idempotent, and the
      // customer already has access from the subscription row either way.
      if (applied.profileWriteFailed) {
        return NextResponse.json(
          { error: 'Could not record the payment fully. Please redeliver.' },
          { status: 500 }
        );
      }
      // Recorded only once the charge has fully applied: a delivery that asked
      // for a redelivery above has not earned anyone anything yet, and the ledger
      // is idempotent on the reference, so the redelivery records it then.
      await recordSubscriptionCharge(admin, {
        userId,
        reference,
        amountKobo: amountMinorUnit,
        plan: planString,
        source: 'initial',
        chargedAt: now,
      });
      // The team that invited this one earns credits for a first payment. Idempotent
      // on the invited team, so a redelivery cannot pay it twice.
      await rewardReferrerOnFirstPayment(admin, { payerUserId: userId, reference });
      return ack({
        event: 'charge.success',
        reference,
        matched: 'initial_recurring',
        plan: planString,
      });
    }

    // Fallback for non-recurring plan strings written into payments
    // (legacy or future admin paths). Credit using the existing expiry
    // logic in lib/billing.ts. No subscription_code persistence (these
    // aren't recurring on the Paystack side).
    if (planString === 'access' || planString === 'custom') {
      const applied = await applyInitialOrManualCharge(
        admin,
        userId,
        planString,
        amountMinorUnit,
        reference,
        customerCode,
        null,
        now
      );
      if (applied.profileWriteFailed) {
        return NextResponse.json(
          { error: 'Could not record the payment fully. Please redeliver.' },
          { status: 500 }
        );
      }
      return ack({ event: 'charge.success', reference, matched: 'manual_or_legacy', plan: planString });
    }

    console.warn('[paystack-webhook] payment row with unrecognized plan:', planString);
    return ack({ event: 'charge.success', reference, matched: false, reason: 'unknown_plan' });
  }

  // 2. RENEWAL — no payments row for this reference (Paystack generates a
  //    fresh reference per invoice). Match the subscription by
  //    subscription_code (preferred) then customer_code (fallback).
  const renewalSubscriptionCode = subscriptionRef?.subscription_code || null;
  let subscriptionLookup: {
    data: {
      id: string;
      user_id: string;
      plan: string;
      expires_at: string | null;
      billing_interval: string | null;
      pending_plan: string | null;
      pending_billing_interval: string | null;
    } | null;
    error: { message: string } | null;
  } | null = null;

  if (renewalSubscriptionCode) {
    subscriptionLookup = await admin
      .from('subscriptions')
      .select('id,user_id,plan,expires_at,billing_interval,pending_plan,pending_billing_interval')
      .eq('paystack_subscription_code', renewalSubscriptionCode)
      .maybeSingle();
  }

  if ((!subscriptionLookup || !subscriptionLookup.data) && customerCode) {
    subscriptionLookup = await admin
      .from('subscriptions')
      .select('id,user_id,plan,expires_at,billing_interval,pending_plan,pending_billing_interval')
      .eq('paystack_customer_code', customerCode)
      .maybeSingle();
  }

  if (subscriptionLookup?.error) {
    console.error('[paystack-webhook] subscription lookup error:', subscriptionLookup.error.message);
    return ack({ event: 'charge.success', reference, matched: false, reason: 'subscription_lookup_failed' });
  }

  const subRow = subscriptionLookup?.data;
  if (!subRow?.user_id) {
    // Unmatched charge. Could be a payment for an account we don't know
    // about, or a payment made before we shipped this code. Log loud and
    // ack 200 — Paystack will keep retrying if we 5xx, which we don't want
    // for an event we genuinely can't match.
    console.warn('[paystack-webhook] unmatched charge.success', {
      reference,
      amount: amountMinorUnit,
      customer_code: customerCode,
      subscription_code: renewalSubscriptionCode,
      plan_code: incomingPlanCode,
    });
    return ack({ event: 'charge.success', reference, matched: false, reason: 'no_subscription_match' });
  }

  // Resolve the plan for the renewal. Prefer the persisted plan on our
  // subscriptions row (set at first-charge time, when we trusted the start-
  // checkout flow). Use the incoming plan_code only as a sanity check.
  if (!isRecurringPlan(subRow.plan)) {
    console.warn('[paystack-webhook] renewal targeted non-recurring plan row:', subRow.plan);
    return ack({ event: 'charge.success', reference, matched: false, reason: 'non_recurring_subscription' });
  }

  // Sanity check only, and FORWARD-resolving on purpose: because the Label tier
  // reuses the legacy monthly/annual Paystack Plans by design, reverse-mapping
  // the incoming code would report a mismatch on every single Label renewal.
  // See planCodeMatchesSubscription.
  if (
    !planCodeMatchesSubscription({
      code: incomingPlanCode,
      plan: subRow.plan,
      storedInterval: subRow.billing_interval,
    })
  ) {
    // Plan changed under us (Paystack-side migration?). Log but continue
    // — extend by the stored plan's period to match the contract the user
    // agreed to at signup. If this becomes a real workflow we can add a
    // plan-switch path later.
    console.warn('[paystack-webhook] renewal plan_code differs from stored plan', {
      stored: subRow.plan,
      stored_interval: subRow.billing_interval,
      incoming_code: incomingPlanCode,
      incoming_identified: identifyPlanByCode(incomingPlanCode)?.plan ?? null,
    });
  }

  await applyRenewal(
    admin,
    subRow.user_id,
    subRow.plan,
    subRow.expires_at,
    amountMinorUnit,
    reference,
    now,
    subRow.billing_interval,
    { plan: subRow.pending_plan, interval: subRow.pending_billing_interval }
  );

  await recordSubscriptionCharge(admin, {
    userId: subRow.user_id,
    reference,
    amountKobo: amountMinorUnit,
    plan: subRow.pending_plan ?? subRow.plan,
    source: 'renewal',
    chargedAt: now,
  });

  return ack({
    event: 'charge.success',
    reference,
    matched: 'renewal',
    // The plan it ENDED on: a pending downgrade applies at this moment, so
    // reporting subRow.plan would name the tier they just left.
    plan: subRow.pending_plan ?? subRow.plan,
  });
}

async function handleSubscriptionCreate(payload: PaystackWebhookPayload) {
  const admin = createAdminClient();
  if (!admin) return ack({ event: 'subscription.create' });

  const subscriptionCode = payload.data?.subscription_code || null;
  const customerCode = payload.data?.customer?.customer_code || null;

  if (!subscriptionCode || !customerCode) {
    return ack({ event: 'subscription.create', matched: false, reason: 'missing_codes' });
  }

  // Stamp the subscription_code onto whichever subscriptions row already
  // belongs to this customer (created by handleChargeSuccess on the
  // initial charge). Idempotent — re-deliveries write the same value.
  const { error } = await admin
    .from('subscriptions')
    .update({
      paystack_subscription_code: subscriptionCode,
      updated_at: new Date().toISOString(),
    })
    .eq('paystack_customer_code', customerCode);

  if (error) {
    console.error('[paystack-webhook] subscription.create update error:', error.message);
    return ack({ event: 'subscription.create', matched: false, reason: 'update_failed' });
  }

  return ack({ event: 'subscription.create', subscription_code: subscriptionCode });
}

async function handleSubscriptionDisable(payload: PaystackWebhookPayload) {
  const admin = createAdminClient();
  if (!admin) return ack({ event: 'subscription.disable' });

  const subscriptionCode = payload.data?.subscription_code || null;
  if (!subscriptionCode) {
    return ack({ event: 'subscription.disable', matched: false, reason: 'no_subscription_code' });
  }

  // Mark cancelled but KEEP expires_at. The user paid for the current
  // period and keeps access until it lapses — this is the grace period.
  // Snapshot resolver treats 'cancelled' + not expired as paid.
  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('paystack_subscription_code', subscriptionCode);

  if (error) {
    console.error('[paystack-webhook] subscription.disable update error:', error.message);
    return ack({ event: 'subscription.disable', matched: false, reason: 'update_failed' });
  }

  return ack({ event: 'subscription.disable', subscription_code: subscriptionCode });
}

async function handleInvoicePaymentFailed(payload: PaystackWebhookPayload) {
  const admin = createAdminClient();
  if (!admin) return ack({ event: 'invoice.payment_failed' });

  const subscriptionCode = payload.data?.subscription?.subscription_code || null;
  if (!subscriptionCode) {
    return ack({ event: 'invoice.payment_failed', matched: false, reason: 'no_subscription_code' });
  }

  // Mark past_due — informational only. Snapshot resolver lets past_due
  // + not expired keep access (the user paid for THIS period; the failed
  // charge is for the NEXT). When expires_at lapses without a successful
  // renewal charge.success, access ends — and under the hard paywall that team
  // lands in READ-ONLY rather than at the wall, because they have paid us before
  // (lapsedFromPayment in lib/team-billing.ts).
  //
  // `user_id` is selected so the founder can be told. It is the only extra cost
  // here and it is why this handler can alert at all.
  const { data, error } = await admin
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('paystack_subscription_code', subscriptionCode)
    .select('user_id')
    .maybeSingle();

  if (error) {
    console.error('[paystack-webhook] invoice.payment_failed update error:', error.message);
  }

  // Tell the founder NOW rather than when the period lapses. This is the only
  // point in the whole billing system where a churn event is both known and
  // still cheap to fix: retries are pending, the customer still has full access,
  // and a message about a card takes a minute. Fire-and-forget, guarded by the
  // flag, and swallowing everything — an alert must never fail a webhook, or
  // Paystack retries an event we already handled.
  const affectedUserId = (data as { user_id: string | null } | null)?.user_id ?? null;
  if (isHardPaywallEnabled() && affectedUserId) {
    void (async () => {
      try {
        const workspaceResult = await admin
          .from('workspaces')
          .select('id')
          .eq('owner_id', affectedUserId)
          .maybeSingle();
        const workspaceId = (workspaceResult.data as { id: string } | null)?.id;
        if (!workspaceId) return;
        await notifyFounder(admin, {
          kind: 'payment_failed',
          workspaceId,
          ownerUserId: affectedUserId,
          actorUserId: null,
          metadata: { subscriptionCode },
        });
      } catch {
        // Never surface: past_due is already recorded.
      }
    })();
  }

  console.warn('[paystack-webhook] invoice.payment_failed', { subscription_code: subscriptionCode });
  return ack({ event: 'invoice.payment_failed', subscription_code: subscriptionCode });
}

// ─── curator pitch payments ──────────────────────────────────────────────────
//
// Pitch checkouts (2026-09-25) carry references that start with
// PITCH_REFERENCE_PREFIX, so they are recognised on the reference alone and
// routed away before any subscription handling reads them. They never touch
// the payments table. The work lives in lib/pitch-payments-server.ts; these two
// wrappers only turn its answer into a response.
//
// NOT BEHIND THE FEATURE FLAG, on the cancel-trial precedent: a pitch somebody
// paid for must still settle, and its refund still land, if paid pitching is
// switched off afterwards. With nothing ever paid, neither finds a row.
//
// Unlike the rest of this file, a pitch charge that fails for a TRANSIENT
// reason answers 500, so Paystack redelivers it. Its event row is recorded
// before processing and only marked processed once it succeeds, so a
// redelivery is processed again rather than skipped.

async function handlePitchCharge(payload: PaystackWebhookPayload) {
  const admin = createAdminClient();
  if (!admin) {
    console.error('[paystack-webhook] Missing Supabase env vars for a pitch charge');
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }
  const result = await handlePitchChargeEvent(admin, (payload.data || {}) as Record<string, unknown>);
  return NextResponse.json(result.body, { status: result.status });
}

async function handlePitchRefund(event: string, payload: PaystackWebhookPayload) {
  const admin = createAdminClient();
  if (!admin) return ack({ event });
  const result = await handlePitchRefundEvent(admin, event, (payload.data || {}) as Record<string, unknown>);
  return NextResponse.json(result.body, { status: result.status });
}

// ─── UrgAns credit purchases ─────────────────────────────────────────────────
//
// A credit pack checkout carries a reference that starts with
// CREDITS_REFERENCE_PREFIX, so it is recognised on the reference alone and routed
// away before any subscription handling reads it. It never touches the payments
// table: the ledger row, keyed on the reference, is the record.
//
// The body of this webhook is only a claim. settleCreditsPurchase asks Paystack
// itself whether the transaction was paid and checks it against the pack table
// to the kobo before a credit is written (lib/credits/purchase.ts).
//
// NOT BEHIND THE FEATURE FLAG, on the pitch-payments precedent: a pack somebody
// paid for must still be credited if purchasing is switched off afterwards.
//
// A TRANSIENT failure answers 500 so Paystack redelivers. Everything else answers
// 200: a mismatch will not get better by being sent again, and is logged loudly.

async function handleCreditsCharge(payload: PaystackWebhookPayload) {
  const admin = createAdminClient();
  if (!admin) {
    console.error('[paystack-webhook] Missing Supabase env vars for a credits charge');
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }
  const reference = String(payload.data?.reference || '');
  const outcome = await settleCreditsPurchase(admin, reference, 'webhook');
  if (outcome.state === 'error' && outcome.transient) {
    return NextResponse.json({ error: 'Try again' }, { status: 500 });
  }
  return ack({ event: 'charge.success', credits: outcome.state });
}

// ─── entrypoint ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecretKey) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = req.headers.get('x-paystack-signature');
  const rawBody = await req.text();

  if (!validateSignature(rawBody, signature, paystackSecretKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: PaystackWebhookPayload;
  try {
    payload = JSON.parse(rawBody || '{}') as PaystackWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = payload.event || '';

  if (event === 'charge.success' && isPitchPaymentReference(payload.data?.reference)) {
    return handlePitchCharge(payload);
  }
  if (event === 'charge.success' && isCreditsReference(payload.data?.reference)) {
    return handleCreditsCharge(payload);
  }
  // Refunds from any other flow (the card-trial check) are acknowledged there.
  if (event.startsWith('refund.')) {
    return handlePitchRefund(event, payload);
  }

  switch (event) {
    case 'charge.success':
      return handleChargeSuccess(payload);
    case 'subscription.create':
      return handleSubscriptionCreate(payload);
    case 'subscription.disable':
      return handleSubscriptionDisable(payload);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(payload);
    case 'invoice.create':
    case 'invoice.update':
    default:
      // Acknowledge unhandled events so Paystack doesn't retry.
      return ack({ event });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Webhook endpoint active' }, { status: 200 });
}
