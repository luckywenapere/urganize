import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlanExpiry } from '@/lib/billing';

type PaystackWebhookPayload = {
  event?: string;
  data?: {
    reference?: string;
    customer?: {
      customer_code?: string;
    };
  };
};

const TRIAL_CLAIM_PLAN = 'trial_claim';

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

  // No matching payment — could be a trial tokenization or unknown reference.
  // Trial activation is handled by /api/payments/verify; just ack.
  if (!payment) {
    return NextResponse.json({ received: true, event: 'charge.success', reference, matched: false }, { status: 200 });
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

  // Upsert subscription
  const plan = payment.plan || 'monthly';
  const now = new Date();
  const expiresAt = getPlanExpiry(plan, now);
  const customerCode = payload.data?.customer?.customer_code || null;

  const { error: subError } = await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan,
        status: 'active',
        amount: payment.amount || 0,
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

  // Update profile
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ is_subscribed: true })
    .eq('id', userId);
  if (profileError) {
    console.error('[paystack-webhook] profile update error:', profileError.message);
  }

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
