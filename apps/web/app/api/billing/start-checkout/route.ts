import { NextRequest, NextResponse } from 'next/server';
import { isPricingCurrency } from '@urganize/pricing';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/releases/_shared';
import { resolveCheckoutPurchase } from '@/lib/billing-plans';
import { isPricingV2Enabled } from '@/lib/entitlements';
import { isHardPaywallEnabled } from '@/lib/team-billing';
import { resolveCheckoutSubject } from '@/lib/billing-events';
import { logBillingEvent } from '@/lib/billing-events-server';
import { fetchPaystackInit } from '@/lib/paystack-init';
import { afterResponse } from '@/lib/after-response';
import { validatePromoCode } from '@/lib/self-serve-server';
import { PLAN_NOT_READY_MESSAGE, planMatchesPrice, readPaystackPlan } from '@/lib/paystack-plan-check';

// App-initiated Paystack subscription checkout.
//
// Why this exists:
//   The previous "Pay ₦15,000" flow redirected the browser to a Paystack-hosted
//   payment page. The app never learned which user clicked, only what email
//   they typed at Paystack. Customers who paid with a different email than
//   their app account never got credited — silent failure with no recovery
//   short of manual support.
//
//   This route inits the Paystack transaction server-side with both:
//     (a) metadata.user_id  — bound to the logged-in user, so the webhook can
//                             credit the correct account without email matching
//     (b) plan              — the Paystack plan code (PLN_xxx) so Paystack
//                             auto-creates a recurring subscription on first
//                             charge.success and bills the same card forward.
//
//   A `payments` row is reserved at this point with status='pending'. The
//   webhook flips it to 'success' when charge.success arrives. The
//   /payment/callback page can then read the row by reference to confirm
//   the UI state — but the webhook remains authoritative.
//
// Why authenticated (not open):
//   This is a *paid* purchase by a logged-in user. We need their user_id at
//   reservation time so the webhook can credit deterministically. Anonymous
//   "self-serve" recurring checkout is intentionally not supported — the
//   user must sign up first, then subscribe.

type StartCheckoutRequest = {
  plan?: unknown;
  currency?: unknown;
  /** 'monthly' | 'annual'. REQUIRED for a pricing-v2 tier plan and ignored for
   * a legacy plan id, because a tier does not encode its own interval. Without
   * it the webhook cannot tell how far to set expires_at, which is the whole
   * bug this argument exists to close. */
  interval?: unknown;
  /** Team the plan is being activated for (hard-paywall flow). When present,
   * the charge is credited to that team's owner. */
  workspaceId?: string;
  /** Self-serve checkout (2026-10-22): a partner or team code, checked here
   *  and tagged to the team once the payment clears. */
  promo?: unknown;
  /** True from the /checkout page, for the funnel numbers. */
  selfServe?: unknown;
};

type StartCheckoutResponse = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

function generateReference(): string {
  // `urganize_<timestamp>_<random>` — same convention as the (now-deleted)
  // client-side PaystackButton so support tooling that filters by prefix
  // keeps working. Server-generated so the reference can't be controlled
  // by a malicious client (lookups in the webhook treat reference as a
  // trusted index).
  const ts = Date.now();
  const rand = Math.random().toString(16).slice(2, 10);
  return `urganize_${ts}_${rand}`;
}

function resolveCallbackUrl(request: NextRequest): string {
  // Prefer the explicit NEXT_PUBLIC_APP_URL so dev branches don't try to
  // call back to a stale Vercel preview deployment. Falls back to the
  // request origin (covers local development without env config).
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = configured || new URL(request.url).origin;
  return `${base.replace(/\/$/, '')}/payment/callback`;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const userId = auth.user.id;
  const userEmail = String(auth.user.email || '').trim().toLowerCase();
  if (!userEmail) {
    return NextResponse.json(
      { error: 'No email on file. Please complete account setup before subscribing.' },
      { status: 400 }
    );
  }

  let body: StartCheckoutRequest = {};
  try {
    body = (await request.json()) as StartCheckoutRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const currency = body.currency;
  if (!isPricingCurrency(currency)) {
    return NextResponse.json(
      { error: 'currency must be "NGN" or "USD".' },
      { status: 400 }
    );
  }

  // Which Paystack Plan, how much, and (for a tier) which interval to record.
  // The decision lives in lib/billing-plans.ts so it can be unit tested — it is
  // what decides the amount and the term a customer's card is charged for, and
  // this route is unreachable from a test without mocking Supabase and fetch.
  const purchase = resolveCheckoutPurchase({
    plan: body.plan,
    currency,
    interval: body.interval,
    pricingV2: isPricingV2Enabled(),
  });
  if (!purchase.ok) {
    return NextResponse.json({ error: purchase.error }, { status: purchase.status });
  }
  const { planId, planCode, amountMinorUnit, interval: selectedInterval } = purchase;

  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecretKey) {
    return NextResponse.json(
      { error: 'Payment provider is not configured on the server.' },
      { status: 500 }
    );
  }

  // A tier's Plan must charge exactly what we show (lib/paystack-plan-check.ts).
  // A Plan env var still pointing at an old price is refused, never charged.
  if (selectedInterval) {
    const plan = await readPaystackPlan(planCode, paystackSecretKey);
    if (!planMatchesPrice(plan, { amountKobo: amountMinorUnit, interval: selectedInterval, currency })) {
      console.error('[billing/start-checkout] plan price mismatch', { plan: planId, interval: selectedInterval });
      return NextResponse.json({ error: PLAN_NOT_READY_MESSAGE, code: 'plan_not_ready' }, { status: 409 });
    }
  }

  const reference = generateReference();
  const callbackUrl = resolveCallbackUrl(request);

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  if (!admin) {
    return NextResponse.json(
      { error: 'Server environment is not configured.' },
      { status: 500 }
    );
  }

  // Team checkout (NEXT_PUBLIC_FEATURE_HARD_PAYWALL). The wall sends the team's
  // id, and the charge is credited to the team's OWNER rather than to whoever
  // clicked. This is what keeps the untouched Paystack webhook correct: it
  // credits payments.user_id / metadata.user_id, and access resolves from the
  // owner's snapshot, so crediting a paying ADMIN would take the money and
  // leave the team walled. Members and guests are refused here; the wall shows
  // them the notify-admin path instead of a picker they cannot use.
  // With the flag off, or with no workspaceId, this is a no-op and the
  // requester pays for themselves exactly as before.
  let subjectUserId = userId;
  if (isHardPaywallEnabled() && body.workspaceId) {
    const workspaceResult = await admin
      .from('workspaces')
      .select('id, owner_id')
      .eq('id', body.workspaceId)
      .maybeSingle();

    const workspace = workspaceResult.data as { id: string; owner_id: string | null } | null;
    if (!workspace?.owner_id) {
      return NextResponse.json({ error: 'That team could not be found.' }, { status: 404 });
    }

    const membershipResult = await admin
      .from('workspace_members')
      .select('role, status')
      .eq('workspace_id', workspace.id)
      .eq('user_id', userId)
      .maybeSingle();

    const membership = membershipResult.data as { role: string | null; status: string | null } | null;
    const subject = resolveCheckoutSubject({
      flagOn: true,
      requesterId: userId,
      workspace: { ownerId: workspace.owner_id },
      membershipRole: membership?.role ?? null,
      membershipStatus: membership?.status ?? null,
    });

    if ('error' in subject) {
      return NextResponse.json({ error: subject.error }, { status: 403 });
    }
    subjectUserId = subject.subjectUserId;
  }

  // A code is checked now (so a wrong one is said on the page, not lost), and
  // carried to the webhook, which tags the team once it exists.
  let promoCode: string | null = null;
  if (body.promo !== undefined && body.promo !== null && body.promo !== '') {
    const promo = await validatePromoCode(admin, body.promo);
    if (!promo.ok) return NextResponse.json({ error: promo.message }, { status: 400 });
    promoCode = promo.code;
  }
  const selfServe = body.selfServe === true;

  // Reserve the payments row BEFORE talking to Paystack. If the Paystack
  // call fails we'll have an orphan pending row, which is harmless — the
  // webhook never credits 'pending' references, and the row gives support
  // a paper trail. If we wrote AFTER Paystack and the DB write failed,
  // the webhook would have nothing to look up and would silently drop the
  // charge.success event (the renewal-matching path can't kick in until
  // subscription.create has populated paystack_subscription_code).
  const paymentInsert = await admin.from('payments').insert({
    user_id: subjectUserId,
    amount: amountMinorUnit,
    reference,
    status: 'pending',
    plan: planId,
    paystack_response: {
      source: 'recurring_start_checkout',
      currency,
      // The interval hop from checkout to the webhook. Only written for a tier
      // purchase: a legacy row's plan name already carries its interval, and
      // omitting the key keeps those rows byte-identical to before.
      ...(selectedInterval ? { selected_interval: selectedInterval } : {}),
      ...(body.workspaceId ? { workspace_id: body.workspaceId } : {}),
      ...(subjectUserId !== userId ? { paid_by_user_id: userId } : {}),
      ...(promoCode ? { promo_code: promoCode } : {}),
      ...(selfServe ? { self_serve: true } : {}),
    },
  });
  if (paymentInsert.error) {
    console.error('[billing/start-checkout] payments insert failed:', paymentInsert.error.message);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }

  const paystackResponse = await fetchPaystackInit({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: userEmail,
      amount: amountMinorUnit,
      reference,
      currency,
      plan: planCode,
      callback_url: callbackUrl,
      // metadata.user_id is the canonical bind. The webhook reads it via
      // the verified Paystack transaction (looked up by reference) and
      // credits that exact account, no email matching.
      //
      // Under the team flow this is the team OWNER, not necessarily the person
      // paying: access resolves from the owner's subscription, so crediting a
      // paying admin would take the money and leave the team walled. The
      // `email` above stays the payer's, since it is their card and their
      // receipt.
      metadata: {
        user_id: subjectUserId,
        plan: planId,
        // Recorded for support: the Plan code alone does not say which tier a
        // reused Paystack Plan was sold as.
        ...(selectedInterval ? { interval: selectedInterval } : {}),
        currency,
        source: 'recurring_start_checkout',
        ...(body.workspaceId ? { workspace_id: body.workspaceId } : {}),
        ...(subjectUserId !== userId ? { paid_by_user_id: userId } : {}),
      },
    }),
  });

  const initPayload = (await paystackResponse.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: {
      authorization_url?: string;
      access_code?: string;
      reference?: string;
    };
  };

  if (!paystackResponse.ok || !initPayload?.status || !initPayload.data?.authorization_url) {
    // Roll the pending row back so the user can retry on a fresh
    // reference. Errors here are logged but not surfaced — the user-facing
    // response already conveys the failure.
    await admin.from('payments').delete().eq('reference', reference);
    return NextResponse.json(
      { error: initPayload?.message || 'Could not initialize Paystack checkout.' },
      { status: 502 }
    );
  }

  // Funnel step: they reached Paystack. Fire-and-forget, after the checkout is
  // real, so a ledger hiccup can never cost someone their checkout.
  if (isHardPaywallEnabled() && body.workspaceId) {
    const checkoutWorkspaceId = body.workspaceId;
    afterResponse('checkout started record', () =>
      logBillingEvent(admin, {
        workspaceId: checkoutWorkspaceId,
        ownerUserId: subjectUserId,
        actorUserId: userId,
        type: 'checkout_started',
        metadata: { plan: planId, interval: selectedInterval, currency, reference, amountMinorUnit },
      })
    );
  }

  const response: StartCheckoutResponse = {
    authorizationUrl: initPayload.data.authorization_url,
    accessCode: initPayload.data.access_code || '',
    reference: initPayload.data.reference || reference,
  };
  return NextResponse.json(response);
}
