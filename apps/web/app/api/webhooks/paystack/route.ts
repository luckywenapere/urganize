import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlanExpiry } from '@/lib/billing';
import {
  advancePeriodEnd,
  identifyPlanByCode,
  isRecurringPlan,
  type RecurringPlanId,
} from '@/lib/billing-plans';
import { invalidateSubscriptionSnapshot } from '@/lib/subscription-access';

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
    .select('id,user_id,plan,status,amount')
    .eq('reference', reference)
    .maybeSingle();

  if (paymentLookupError) {
    console.error('[paystack-webhook] payments lookup error:', paymentLookupError.message);
    return ack({ event: 'charge.success', error: 'payments_lookup_failed' });
  }

  if (payment?.user_id && payment.plan) {
    const userId = payment.user_id;
    const planString = String(payment.plan);

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
