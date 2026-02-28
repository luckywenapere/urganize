import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlanExpiry, resolveExpectedAmount } from '@/lib/billing';

type SafeMetadata = Record<string, string | number | boolean | null | undefined>;

const isPrimitive = (value: unknown): value is string | number | boolean | null | undefined => {
  return value == null || ['string', 'number', 'boolean'].includes(typeof value);
};

const normalizeMetadata = (value: unknown): SafeMetadata => {
  if (!value || typeof value !== 'object') return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => isPrimitive(entry))
    .map(([key, entry]) => [key, entry as string | number | boolean | null | undefined]);
  return Object.fromEntries(entries);
};

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get('reference');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!reference) {
    return NextResponse.json({ error: 'No reference provided' }, { status: 400 });
  }

  if (!supabaseUrl || !serviceRoleKey || !paystackSecretKey) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const existingPaymentResult = await supabaseAdmin
      .from('payments')
      .select('id,plan,status')
      .eq('reference', reference)
      .maybeSingle();

    if (existingPaymentResult.error) throw existingPaymentResult.error;

    if (existingPaymentResult.data?.status === 'success') {
      return NextResponse.json({
        status: 'success',
        plan: existingPaymentResult.data.plan,
        reference,
        already_verified: true,
      });
    }

    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
      },
    });

    const verifyPayload = await verifyResponse.json();
    if (!verifyPayload?.status || verifyPayload?.data?.status !== 'success') {
      return NextResponse.json(
        { status: 'failed', message: verifyPayload?.message || 'Payment verification failed' },
        { status: 400 }
      );
    }

    const paymentData = verifyPayload.data;
    const amount = Number(paymentData.amount || 0) / 100;
    const metadata = normalizeMetadata(paymentData.metadata);
    const plan = typeof metadata.plan === 'string' ? metadata.plan : 'monthly';
    const expectedAmount = resolveExpectedAmount(plan, metadata);

    if (!expectedAmount) {
      return NextResponse.json({ error: 'Unknown billing plan' }, { status: 400 });
    }

    if (Math.abs(amount - expectedAmount) > 1) {
      return NextResponse.json(
        {
          error: 'Payment amount mismatch',
          expected: expectedAmount,
          received: amount,
        },
        { status: 400 }
      );
    }

    const customerEmail =
      String(paymentData.customer?.email || paymentData.customer_email || paymentData.metadata?.email || '')
        .trim()
        .toLowerCase();

    if (!customerEmail) {
      return NextResponse.json({ error: 'Could not resolve customer email' }, { status: 400 });
    }

    const profileResult = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', customerEmail)
      .maybeSingle();
    if (profileResult.error) throw profileResult.error;

    if (!profileResult.data?.id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const paymentMode = metadata.payment_mode === 'split' ? 'split' : 'full';
    const subscriptionStatus = 'active';
    const expiresAt = getPlanExpiry(plan, new Date());

    if (!existingPaymentResult.data) {
      const paymentInsert = await supabaseAdmin.from('payments').insert({
        user_id: profileResult.data.id,
        amount,
        reference,
        status: 'success',
        plan,
        paystack_response: paymentData,
      });
      if (paymentInsert.error) throw paymentInsert.error;
    }

    const subscriptionUpsert = await supabaseAdmin
      .from('subscriptions')
      .upsert(
        {
          user_id: profileResult.data.id,
          plan,
          status: subscriptionStatus,
          amount,
          paystack_reference: reference,
          paystack_customer_code: paymentData.customer?.customer_code || null,
          started_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );
    if (subscriptionUpsert.error) throw subscriptionUpsert.error;

    const profileUpdate = await supabaseAdmin
      .from('profiles')
      .update({ is_subscribed: true })
      .eq('id', profileResult.data.id);
    if (profileUpdate.error) throw profileUpdate.error;

    return NextResponse.json({
      status: 'success',
      plan,
      amount,
      expected_amount: expectedAmount,
      payment_mode: paymentMode,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
