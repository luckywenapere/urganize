import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import { getPaystackPlanCode } from '@/lib/billing-plans';
import { getSubscriptionSnapshot } from '@/lib/subscription-access';
import {
  TRIAL_CARD_PLAN,
  TRIAL_CARD_SOURCE,
  isCardTrialEnabled,
  isCardTrialPlan,
  resolveTrialVerificationKobo,
} from '@/lib/trial-card';

// POST /api/trial/start-checkout — card-before-trial (NEXT_PUBLIC_FEATURE_CARD_TRIAL).
//
// Mirrors billing/start-checkout's shape (server-generated reference, payments
// row reserved BEFORE the Paystack call, rollback + 502 on init failure) with
// three deliberate differences:
//   1. The amount is the small card-VERIFICATION charge (default ₦100, floor
//      ₦50 — Paystack's documented tokenization minimum), refunded by the
//      webhook after setup. NGN only: USD checkout has never worked (no USD
//      Paystack Plans exist on this account).
//   2. channels is pinned to ['card'] — bank transfer/USSD don't yield a
//      reusable authorization, and a reusable card authorization is the whole
//      point.
//   3. NO top-level `plan` param on the init call. A plan param would make
//      Paystack charge the full plan price immediately and start billing now;
//      instead the webhook creates the subscription itself with
//      start_date = trial end, so the first real debit lands when the trial
//      lapses. The user's chosen plan rides in paystack_response.selected_plan
//      (server-written — the webhook's trusted source) and in metadata for
//      support tooling.
//
// Open-route auth (getAuthenticatedUser, not requireActiveAuthenticatedUser):
// the caller is unpaid by definition — this route IS how they get access.

type StartTrialCheckoutRequest = {
  plan?: unknown;
};

const PAYSTACK_INIT_URL = 'https://api.paystack.co/transaction/initialize';

function generateReference(): string {
  // Same `urganize_<timestamp>_<random>` convention as billing/start-checkout
  // so support tooling that filters by prefix keeps working. Server-generated
  // so the reference can't be controlled by a malicious client (the webhook
  // treats reference as a trusted index).
  const ts = Date.now();
  const rand = Math.random().toString(16).slice(2, 10);
  return `urganize_${ts}_${rand}`;
}

function resolveCallbackUrl(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = configured || new URL(request.url).origin;
  return `${base.replace(/\/$/, '')}/payment/callback`;
}

export async function POST(request: NextRequest) {
  // Flag gate first, before auth — a dark feature must not confirm it exists
  // (the EPK/pitching 404 precedent).
  if (!isCardTrialEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const userId = auth.user.id;
  const userEmail = String(auth.user.email || '').trim().toLowerCase();
  if (!userEmail) {
    return NextResponse.json(
      { error: 'No email on file. Please complete account setup before starting your trial.' },
      { status: 400 }
    );
  }

  let body: StartTrialCheckoutRequest = {};
  try {
    body = (await request.json()) as StartTrialCheckoutRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const plan = body.plan;
  if (!isCardTrialPlan(plan)) {
    return NextResponse.json(
      { error: 'plan must be "monthly" or "annual".' },
      { status: 400 }
    );
  }

  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecretKey) {
    return NextResponse.json(
      { error: 'Payment provider is not configured on the server.' },
      { status: 500 }
    );
  }

  // Fail fast on the plan code: the webhook needs it later to create the
  // delayed subscription, and discovering it's missing AFTER taking someone's
  // ₦100 would strand the flow mid-way.
  const planCode = getPaystackPlanCode(plan, 'NGN');
  if (!planCode) {
    return NextResponse.json(
      {
        error: `Paystack plan code not configured for ${plan}/NGN. Set the matching PAYSTACK_PLAN_* env var.`,
      },
      { status: 500 }
    );
  }

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json(
      { error: 'Server environment is not configured.' },
      { status: 500 }
    );
  }

  // Eligibility mirrors /api/trial/start: trial_used is the single source of
  // truth (re-read via admin so a client-mutated snapshot can't bypass it),
  // and an account with live access has nothing to start.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('trial_used')
    .eq('id', userId)
    .maybeSingle();
  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'Could not load account profile.' },
      { status: 500 }
    );
  }
  if (profile.trial_used) {
    return NextResponse.json(
      { error: 'Free trial has already been used on this account.', trialUsed: true },
      { status: 400 }
    );
  }

  const snapshot = await getSubscriptionSnapshot(userId);
  if (snapshot.accountStatus === 'paid' || snapshot.hasAccess) {
    return NextResponse.json(
      {
        error: 'Account already has access. No trial is needed.',
        accountStatus: snapshot.accountStatus,
      },
      { status: 409 }
    );
  }

  const verificationKobo = resolveTrialVerificationKobo(
    process.env.TRIAL_CARD_VERIFICATION_AMOUNT_NGN
  );
  const reference = generateReference();
  const callbackUrl = resolveCallbackUrl(request);

  // Reserve the payments row BEFORE talking to Paystack (the
  // billing/start-checkout rationale: an orphan pending row is harmless, a
  // charge.success with no row to look up is a silently dropped event).
  // selected_plan lives in the jsonb because payments.plan carries the
  // sentinel — the webhook must never confuse a ₦100 card check with a
  // purchase of `plan`.
  const paymentInsert = await admin.from('payments').insert({
    user_id: userId,
    amount: verificationKobo,
    reference,
    status: 'pending',
    plan: TRIAL_CARD_PLAN,
    paystack_response: {
      source: TRIAL_CARD_SOURCE,
      currency: 'NGN',
      selected_plan: plan,
    },
  });
  if (paymentInsert.error) {
    console.error('[trial/start-checkout] payments insert failed:', paymentInsert.error.message);
    return NextResponse.json({ error: 'Could not start trial checkout.' }, { status: 500 });
  }

  const paystackResponse = await fetch(PAYSTACK_INIT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: userEmail,
      amount: verificationKobo,
      reference,
      currency: 'NGN',
      channels: ['card'],
      callback_url: callbackUrl,
      metadata: {
        user_id: userId,
        plan,
        currency: 'NGN',
        source: TRIAL_CARD_SOURCE,
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
    await admin.from('payments').delete().eq('reference', reference);
    return NextResponse.json(
      { error: initPayload?.message || 'Could not initialize Paystack checkout.' },
      { status: 502 }
    );
  }

  return NextResponse.json({
    authorizationUrl: initPayload.data.authorization_url,
    accessCode: initPayload.data.access_code || '',
    reference: initPayload.data.reference || reference,
  });
}
