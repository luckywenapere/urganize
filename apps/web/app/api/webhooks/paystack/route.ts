import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlanExpiry } from '@/lib/billing';

type PaystackWebhookPayload = {
  event?: string;
  data?: {
    reference?: string;
    amount?: number;
    customer?: {
      customer_code?: string;
      email?: string;
    };
  };
};

const TRIAL_CLAIM_PLAN = 'trial_claim';

// Amount (in kobo) of the standalone Paystack Payment Page used by the /locked
// page's "Pay ₦15,000" button. Payments through that page do not create a
// `payments` row in the app DB, so the webhook credits them via email match
// against profiles.email when the amount equals this constant.
const STANDALONE_ACCESS_AMOUNT_KOBO = 15_000_00;
const STANDALONE_ACCESS_PLAN = 'access';

const validateSignature = (rawBody: string, signature: string | null, secret: string): boolean => {
  if (!signature) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  return expected === signature;
};

const createAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
};

async function creditUser(
  supabaseAdmin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  plan: string,
  amountKobo: number,
  reference: string,
  customerCode: string | null,
  now: Date
) {
  const expiresAt = getPlanExpiry(plan, now);

  const { error: subError } = await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan,
        status: 'active',
        amount: amountKobo,
        paystack_reference: reference,
        paystack_customer_code: customerCode,
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id' }
    );
  if (subError) {
    console.error('[paystack-webhook] subscription upsert error:', subError.message);
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ is_subscribed: true, paid_at: now.toISOString() })
    .eq('id', userId);
  if (profileError) {
    console.error('[paystack-webhook] profile update error:', profileError.message);
  }
}

async function handleStandaloneAccessPayment(
  supabaseAdmin: NonNullable<ReturnType<typeof createAdminClient>>,
  payload: PaystackWebhookPayload,
  reference: string
) {
  const amount = Number(payload.data?.amount) || 0;
  if (amount !== STANDALONE_ACCESS_AMOUNT_KOBO) {
    return NextResponse.json(
      { received: true, event: 'charge.success', reference, matched: false, reason: 'amount_mismatch' },
      { status: 200 }
    );
  }

  const email = String(payload.data?.customer?.email || '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { received: true, event: 'charge.success', reference, matched: false, reason: 'no_customer_email' },
      { status: 200 }
    );
  }

  const { data: profile, error: profileLookupError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  if (profileLookupError) {
    console.error('[paystack-webhook] profile lookup error:', profileLookupError.message);
    return NextResponse.json(
      { received: true, event: 'charge.success', reference, matched: false, reason: 'profile_lookup_error' },
      { status: 200 }
    );
  }

  if (!profile?.id) {
    // Paid but unmatched — log loudly so it can be reconciled manually.
    console.warn('[paystack-webhook] standalone payment without matching profile', {
      reference,
      email,
      amount,
    });
    return NextResponse.json(
      { received: true, event: 'charge.success', reference, matched: false, reason: 'no_matching_profile' },
      { status: 200 }
    );
  }

  await creditUser(
    supabaseAdmin,
    profile.id,
    STANDALONE_ACCESS_PLAN,
    amount,
    reference,
    payload.data?.customer?.customer_code || null,
    new Date()
  );

  return NextResponse.json(
    { received: true, event: 'charge.success', reference, matched: true, via: 'standalone_email_match' },
    { status: 200 }
  );
}

async function handleChargeSuccess(payload: PaystackWebhookPayload) {
  const reference = payload.data?.reference;
  if (!reference) {
    return NextResponse.json({ received: true, event: 'charge.success', error: 'no reference' }, { status: 200 });
  }

  const supabaseAdmin = createAdminClient();
  if (!supabaseAdmin) {
    console.error('[paystack-webhook] Missing Supabase env vars');
    return NextResponse.json({ received: true, event: 'charge.success' }, { status: 200 });
  }

  // Look up the payment by reference
  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('payments')
    .select('id,user_id,plan,status,amount')
    .eq('reference', reference)
    .maybeSingle();

  if (paymentError) {
    console.error('[paystack-webhook] payment lookup error:', paymentError.message);
    return NextResponse.json({ received: true, event: 'charge.success' }, { status: 200 });
  }

  // No matching `payments` row. Two sub-cases:
  // (a) Standalone Paystack Payment Page checkout (the ₦15k locked-page button).
  //     Try to credit via customer email if the amount matches the access tier.
  // (b) Trial tokenization or unknown reference — fall through with matched: false.
  if (!payment) {
    return handleStandaloneAccessPayment(supabaseAdmin, payload, reference);
  }

  // Skip trial_claim — trial activation happens in /api/payments/verify
  if (payment.plan === TRIAL_CLAIM_PLAN) {
    return NextResponse.json({ received: true, event: 'charge.success', reference, plan: TRIAL_CLAIM_PLAN }, { status: 200 });
  }

  const userId = payment.user_id;
  if (!userId) {
    return NextResponse.json({ received: true, event: 'charge.success', reference, error: 'no user_id' }, { status: 200 });
  }

  // Mark payment as success if not already
  if (payment.status !== 'success') {
    const { error: updateError } = await supabaseAdmin
      .from('payments')
      .update({ status: 'success' })
      .eq('id', payment.id);
    if (updateError) {
      console.error('[paystack-webhook] payment update error:', updateError.message);
    }
  }

  await creditUser(
    supabaseAdmin,
    userId,
    payment.plan || 'monthly',
    payment.amount || 0,
    reference,
    payload.data?.customer?.customer_code || null,
    new Date()
  );

  return NextResponse.json({ received: true, event: 'charge.success', reference, persisted: true }, { status: 200 });
}

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

  const payload = (JSON.parse(rawBody || '{}') || {}) as PaystackWebhookPayload;
  const event = payload.event || '';

  if (event === 'charge.success') {
    return handleChargeSuccess(payload);
  }

  // Other events: ack without action
  return NextResponse.json({ received: true, event }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ status: 'Webhook endpoint active' }, { status: 200 });
}
