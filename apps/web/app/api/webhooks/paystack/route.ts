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
  type RecurringPlanId,
} from '@/lib/billing-plans';
import { invalidateSubscriptionSnapshot } from '@/lib/subscription-access';
import { isHardPaywallEnabled } from '@/lib/team-billing';
import { invalidateTeamAccess } from '@/lib/team-billing-server';
import { notifyFounder } from '@/lib/billing-alerts-server';
import {
  TRIAL_CARD_PLAN,
  buildDelayedSubscriptionPayload,
  computeTrialEnd,
  extractReusableAuthorization,
  isCardTrialPlan,
} from '@/lib/trial-card';

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
//   invoice.payment_failed — Renewal attempt failed. Mark past_due, log,
//                            no immediate revoke. Paystack retries 3× over
//                            ~72h; if all fail, subscription.disable lands.
//                            Grace period is implicit: the user has access
//                            until expires_at, which is the end of the
//                            period they already paid for.
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

async function applyInitialOrManualCharge(
  admin: AdminClient,
  userId: string,
  plan: RecurringPlanId | 'access' | 'custom',
  amountMinorUnit: number,
  reference: string,
  customerCode: string | null,
  subscriptionCode: string | null,
  now: Date
) {
  const expiresAt = getPlanExpiry(plan, now);

  const { error: subError } = await admin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan,
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

  const { error: profileError } = await admin
    .from('profiles')
    .update({ is_subscribed: true, paid_at: now.toISOString() })
    .eq('id', userId);
  if (profileError) {
    console.error('[paystack-webhook] profile update error:', profileError.message);
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
}

async function applyRenewal(
  admin: AdminClient,
  userId: string,
  plan: RecurringPlanId,
  currentExpiresAt: string | null,
  amountMinorUnit: number,
  reference: string,
  now: Date
) {
  // Renewal extends from the CURRENT expires_at (not now) so a renewal that
  // arrives a day late doesn't shorten the user's paid window. `advancePeriodEnd`
  // handles the "current end is in the past" edge (e.g. after a long pause)
  // by basing forward from now instead.
  const currentEnd = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const nextEnd = advancePeriodEnd(plan, currentEnd, now);

  const { error: subError } = await admin
    .from('subscriptions')
    .update({
      status: 'active',
      amount: amountMinorUnit,
      paystack_reference: reference,
      expires_at: nextEnd.toISOString(),
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
      await applyInitialOrManualCharge(
        admin,
        userId,
        planString,
        amountMinorUnit,
        reference,
        customerCode,
        subscriptionCode,
        now
      );
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
      await applyInitialOrManualCharge(
        admin,
        userId,
        planString,
        amountMinorUnit,
        reference,
        customerCode,
        null,
        now
      );
      return ack({ event: 'charge.success', reference, matched: 'manual_or_legacy', plan: planString });
    }

    console.warn('[paystack-webhook] payment row with unrecognized plan:', planString);
    return ack({ event: 'charge.success', reference, matched: false, reason: 'unknown_plan' });
  }

  // 2. RENEWAL — no payments row for this reference (Paystack generates a
  //    fresh reference per invoice). Match the subscription by
  //    subscription_code (preferred) then customer_code (fallback).
  const renewalSubscriptionCode = subscriptionRef?.subscription_code || null;
  let subscriptionLookup: { data: { id: string; user_id: string; plan: string; expires_at: string | null } | null; error: { message: string } | null } | null = null;

  if (renewalSubscriptionCode) {
    subscriptionLookup = await admin
      .from('subscriptions')
      .select('id,user_id,plan,expires_at')
      .eq('paystack_subscription_code', renewalSubscriptionCode)
      .maybeSingle();
  }

  if ((!subscriptionLookup || !subscriptionLookup.data) && customerCode) {
    subscriptionLookup = await admin
      .from('subscriptions')
      .select('id,user_id,plan,expires_at')
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

  const incomingPlanIdentified = identifyPlanByCode(incomingPlanCode);
  if (incomingPlanIdentified && incomingPlanIdentified.plan !== subRow.plan) {
    // Plan changed under us (Paystack-side migration?). Log but continue
    // — extend by the stored plan's period to match the contract the user
    // agreed to at signup. If this becomes a real workflow we can add a
    // plan-switch path later.
    console.warn('[paystack-webhook] renewal plan_code differs from stored plan', {
      stored: subRow.plan,
      incoming: incomingPlanIdentified.plan,
    });
  }

  await applyRenewal(
    admin,
    subRow.user_id,
    subRow.plan,
    subRow.expires_at,
    amountMinorUnit,
    reference,
    now
  );

  return ack({
    event: 'charge.success',
    reference,
    matched: 'renewal',
    plan: subRow.plan,
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
  // renewal charge.success, access naturally ends.
  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('paystack_subscription_code', subscriptionCode);

  if (error) {
    console.error('[paystack-webhook] invoice.payment_failed update error:', error.message);
  }

  console.warn('[paystack-webhook] invoice.payment_failed', { subscription_code: subscriptionCode });
  return ack({ event: 'invoice.payment_failed', subscription_code: subscriptionCode });
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
