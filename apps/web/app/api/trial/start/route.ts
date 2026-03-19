import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TRIAL_DAYS = 30;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const TRIAL_CLAIM_PLAN = 'trial_claim';
const DEFAULT_TOKENIZATION_AMOUNT = 100;
const PLAN_IDS = new Set(['monthly', '8months', 'yearly', 'group_monthly', 'group_yearly']);

type EligibilityTokenPayload = {
  uid: string;
  plan: string;
  exp: number;
  fp: string;
};

const normalizeEmail = (value: string): string => String(value || '').trim().toLowerCase();

const hashWithSalt = (value: string, salt: string): string => {
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
};

const resolveClientIp = (req: NextRequest): string => {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const candidate = forwarded.split(',').map((part) => part.trim()).find(Boolean);
  if (candidate) return candidate;
  return req.headers.get('x-real-ip') || 'unknown-ip';
};

const signToken = (payload: EligibilityTokenPayload, secret: string): string => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
};

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const trialSalt = process.env.TRIAL_CLAIMS_SALT || serviceRoleKey || '';
  const tokenizationAmount = Math.max(50, Number(process.env.TRIAL_TOKENIZATION_AMOUNT_NGN || DEFAULT_TOKENIZATION_AMOUNT));

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !trialSalt) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const requestedPlan = String((body as Record<string, unknown>).plan || '').trim();
  if (!PLAN_IDS.has(requestedPlan)) {
    return NextResponse.json({ error: 'Select a valid plan before starting trial.' }, { status: 400 });
  }

  const deviceHashInput = String((body as Record<string, unknown>).trial_device_id_hash || '').trim();
  const userAgent = req.headers.get('user-agent') || 'unknown-agent';
  const ip = resolveClientIp(req);

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await supabaseUserClient.auth.getUser(token);

  if (userError || !user?.id || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const emailHash = hashWithSalt(normalizeEmail(user.email), trialSalt);
  const fingerprintSeed = `${deviceHashInput || 'no-device'}|${ip}|${userAgent}`;
  const fingerprintHash = hashWithSalt(fingerprintSeed, trialSalt);

  const [priorEmailClaim, priorFingerprintClaim, existingSubscription] = await Promise.all([
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
      .contains('paystack_response', { trial_fingerprint_hash: fingerprintHash, source: 'free_trial_tokenization' })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('subscriptions')
      .select('id,status')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (priorEmailClaim.error || priorFingerprintClaim.error || existingSubscription.error) {
    return NextResponse.json({ error: 'Could not verify trial eligibility' }, { status: 500 });
  }

  if (priorEmailClaim.data?.id) {
    return NextResponse.json({ error: 'Free trial already used for this email.' }, { status: 409 });
  }

  if (priorFingerprintClaim.data?.id) {
    return NextResponse.json({ error: 'Free trial already used on this device/network.' }, { status: 409 });
  }

  if (existingSubscription.data?.id) {
    return NextResponse.json(
      { error: 'A subscription already exists for this account.' },
      { status: 409 }
    );
  }

  const tokenPayload: EligibilityTokenPayload = {
    uid: user.id,
    plan: requestedPlan,
    exp: Date.now() + TOKEN_TTL_MS,
    fp: fingerprintHash,
  };

  const eligibilityToken = signToken(tokenPayload, trialSalt);

  return NextResponse.json({
    status: 'eligible',
    trial_days: TRIAL_DAYS,
    tokenization_amount_ngn: tokenizationAmount,
    eligibility_token: eligibilityToken,
    consent_required: true,
  });
}
