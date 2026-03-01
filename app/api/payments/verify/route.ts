import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlanExpiry, resolveExpectedAmount } from '@/lib/billing';

type SafeMetadata = Record<string, string | number | boolean | null | undefined>;
type TrialEligibilityPayload = {
  uid: string;
  plan: string;
  exp: number;
  fp: string;
};

const TRIAL_DAYS = 30;
const TRIAL_CLAIM_PLAN = 'trial_claim';
const TRIAL_TOKENIZATION_PURPOSE = 'trial_tokenization';
const DEFAULT_TOKENIZATION_AMOUNT = 100;

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

const normalizeEmail = (value: string): string => String(value || '').trim().toLowerCase();

const hashWithSalt = (value: string, salt: string): string => {
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
};

const addDays = (input: Date, days: number): Date => {
  const next = new Date(input);
  next.setDate(next.getDate() + days);
  return next;
};

const resolvePaystackPlanCode = (selectedPlan: string): string | null => {
  const map: Record<string, string | undefined> = {
    monthly: process.env.PAYSTACK_PLAN_MONTHLY_CODE,
    '8months': process.env.PAYSTACK_PLAN_8MONTHS_CODE,
    yearly: process.env.PAYSTACK_PLAN_YEARLY_CODE,
    group_monthly: process.env.PAYSTACK_PLAN_GROUP_MONTHLY_CODE,
    group_yearly: process.env.PAYSTACK_PLAN_GROUP_YEARLY_CODE,
  };
  const code = map[selectedPlan];
  return typeof code === 'string' && code.trim() ? code.trim() : null;
};

const verifyEligibilityToken = (token: string, secret: string): TrialEligibilityPayload | null => {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;

  const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (expectedSignature !== signature) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TrialEligibilityPayload;
    if (!parsed?.uid || !parsed?.plan || !parsed?.exp || !parsed?.fp) return null;
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
};

const createScheduledPaystackSubscription = async ({
  paystackSecretKey,
  planCode,
  customerCode,
  authorizationCode,
  trialEnd,
}: {
  paystackSecretKey: string;
  planCode: string;
  customerCode: string;
  authorizationCode: string;
  trialEnd: Date;
}) => {
  const response = await fetch('https://api.paystack.co/subscription', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer: customerCode,
      plan: planCode,
      authorization: authorizationCode,
      start_date: trialEnd.toISOString(),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || 'Could not schedule post-trial subscription');
  }

  return payload?.data || {};
};

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get('reference');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  const trialSalt = process.env.TRIAL_CLAIMS_SALT || serviceRoleKey || '';
  const tokenizationAmount = Math.max(50, Number(process.env.TRIAL_TOKENIZATION_AMOUNT_NGN || DEFAULT_TOKENIZATION_AMOUNT));

  if (!reference) {
    return NextResponse.json({ error: 'No reference provided' }, { status: 400 });
  }

  if (!supabaseUrl || !serviceRoleKey || !paystackSecretKey || !trialSalt) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const existingPaymentResult = await supabaseAdmin
      .from('payments')
      .select('id,plan,status,user_id')
      .eq('reference', reference)
      .maybeSingle();

    if (existingPaymentResult.error) throw existingPaymentResult.error;

    if (existingPaymentResult.data?.status === 'success') {
      if (existingPaymentResult.data.plan === TRIAL_CLAIM_PLAN && existingPaymentResult.data.user_id) {
        const { data: activeSubscription } = await supabaseAdmin
          .from('subscriptions')
          .select('plan,status,expires_at')
          .eq('user_id', existingPaymentResult.data.user_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return NextResponse.json({
          status: 'success',
          plan: activeSubscription?.plan || null,
          reference,
          trialing: activeSubscription?.status === 'trialing',
          trial_ends_at: activeSubscription?.expires_at || null,
          already_verified: true,
        });
      }

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
    const purpose = String(metadata.purpose || '');

    const customerEmail = normalizeEmail(
      String(paymentData.customer?.email || paymentData.customer_email || paymentData.metadata?.email || '')
    );
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

    if (purpose === TRIAL_TOKENIZATION_PURPOSE) {
      const selectedPlan = String(metadata.selected_plan || '').trim();
      const paystackPlanCode = resolvePaystackPlanCode(selectedPlan);
      if (!paystackPlanCode) {
        return NextResponse.json({ error: 'Selected plan is not configured for trial billing.' }, { status: 400 });
      }

      if (Math.abs(amount - tokenizationAmount) > 1) {
        return NextResponse.json(
          {
            error: 'Card authorization amount mismatch',
            expected: tokenizationAmount,
            received: amount,
          },
          { status: 400 }
        );
      }

      const eligibilityToken = String(metadata.eligibility_token || '');
      const eligibility = verifyEligibilityToken(eligibilityToken, trialSalt);
      if (!eligibility) {
        return NextResponse.json({ error: 'Trial authorization token expired or invalid.' }, { status: 401 });
      }
      if (eligibility.uid !== profileResult.data.id || eligibility.plan !== selectedPlan) {
        return NextResponse.json({ error: 'Trial authorization payload mismatch.' }, { status: 401 });
      }

      const authorizationCode = String(paymentData.authorization?.authorization_code || '').trim();
      const authorizationSignature = String(paymentData.authorization?.signature || '').trim();
      const customerCode = String(paymentData.customer?.customer_code || '').trim();
      const authorizationReusable = Boolean(paymentData.authorization?.reusable);

      if (!authorizationCode || !customerCode || !authorizationReusable) {
        return NextResponse.json(
          { error: 'Card authorization is not reusable. Please retry with a reusable debit/credit card.' },
          { status: 400 }
        );
      }

      const emailHash = hashWithSalt(customerEmail, trialSalt);
      const stableCardToken = authorizationSignature || authorizationCode;
      const cardHash = hashWithSalt(stableCardToken, trialSalt);
      const fingerprintHash = eligibility.fp;

      const [priorEmailClaim, priorCardClaim, priorFingerprintClaim, existingSubscription] = await Promise.all([
        supabaseAdmin
          .from('payments')
          .select('id')
          .eq('plan', TRIAL_CLAIM_PLAN)
          .contains('paystack_response', { trial_email_hash: emailHash, source: 'free_trial_tokenization' })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('payments')
          .select('id')
          .eq('plan', TRIAL_CLAIM_PLAN)
          .contains('paystack_response', { trial_card_hash: cardHash, source: 'free_trial_tokenization' })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('payments')
          .select('id')
          .eq('plan', TRIAL_CLAIM_PLAN)
          .contains('paystack_response', { trial_fingerprint_hash: fingerprintHash, source: 'free_trial_tokenization' })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('subscriptions')
          .select('id')
          .eq('user_id', profileResult.data.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (
        priorEmailClaim.error ||
        priorCardClaim.error ||
        priorFingerprintClaim.error ||
        existingSubscription.error
      ) {
        throw new Error('Could not verify strict trial eligibility');
      }

      if (priorEmailClaim.data?.id || priorCardClaim.data?.id || priorFingerprintClaim.data?.id) {
        return NextResponse.json({ error: 'Free trial already redeemed.' }, { status: 409 });
      }

      if (existingSubscription.data?.id) {
        return NextResponse.json(
          { error: 'A subscription already exists for this account.' },
          { status: 409 }
        );
      }

      const trialStartedAt = new Date();
      const trialEndsAt = addDays(trialStartedAt, TRIAL_DAYS);
      const paystackSubscription = await createScheduledPaystackSubscription({
        paystackSecretKey,
        planCode: paystackPlanCode,
        customerCode,
        authorizationCode,
        trialEnd: trialEndsAt,
      });

      const claimInsert = await supabaseAdmin.from('payments').insert({
        user_id: profileResult.data.id,
        amount,
        reference,
        status: 'success',
        plan: TRIAL_CLAIM_PLAN,
        paystack_response: {
          source: 'free_trial_tokenization',
          selected_plan: selectedPlan,
          trial_days: TRIAL_DAYS,
          trial_started_at: trialStartedAt.toISOString(),
          trial_ends_at: trialEndsAt.toISOString(),
          trial_email_hash: emailHash,
          trial_card_hash: cardHash,
          trial_fingerprint_hash: fingerprintHash,
          paystack_customer_code: customerCode,
          paystack_subscription_code: paystackSubscription?.subscription_code || null,
          paystack_email_token: paystackSubscription?.email_token || null,
          paystack_subscription_status: paystackSubscription?.status || null,
          verification_snapshot: paymentData,
        },
      });
      if (claimInsert.error) throw claimInsert.error;

      const subscriptionUpsert = await supabaseAdmin
        .from('subscriptions')
        .upsert(
          {
            user_id: profileResult.data.id,
            plan: selectedPlan,
            status: 'trialing',
            amount: 0,
            paystack_reference: reference,
            paystack_customer_code: customerCode,
            started_at: trialStartedAt.toISOString(),
            expires_at: trialEndsAt.toISOString(),
            updated_at: trialStartedAt.toISOString(),
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
        plan: selectedPlan,
        amount,
        trialing: true,
        trial_days: TRIAL_DAYS,
        trial_ends_at: trialEndsAt.toISOString(),
      });
    }

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
