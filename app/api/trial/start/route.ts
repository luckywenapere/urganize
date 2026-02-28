import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const TRIAL_DAYS = 10;

const addDays = (input: Date, days: number): Date => {
  const next = new Date(input);
  next.setDate(next.getDate() + days);
  return next;
};

const normalizeEmail = (value: string): string => String(value || '').trim().toLowerCase();

const buildTrialEmailHash = (email: string, salt: string): string => {
  return crypto.createHash('sha256').update(`${salt}:${normalizeEmail(email)}`).digest('hex');
};

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const trialSalt = process.env.TRIAL_CLAIMS_SALT || serviceRoleKey || '';

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !trialSalt) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await supabaseUserClient.auth.getUser(token);

  if (userError || !user?.id || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const emailHash = buildTrialEmailHash(user.email, trialSalt);

  const { data: priorTrialClaim, error: claimLookupError } = await supabaseAdmin
    .from('payments')
    .select('id')
    .eq('plan', 'trial_claim')
    .contains('paystack_response', { trial_email_hash: emailHash, source: 'free_trial' })
    .limit(1)
    .maybeSingle();

  if (claimLookupError) {
    return NextResponse.json({ error: claimLookupError.message || 'Could not verify trial eligibility' }, { status: 500 });
  }

  if (priorTrialClaim?.id) {
    return NextResponse.json({ error: 'Free trial already used for this email.' }, { status: 409 });
  }

  const { data: existingSubscription, error: existingError } = await supabaseAdmin
    .from('subscriptions')
    .select('id,status,plan')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message || 'Could not verify trial eligibility' }, { status: 500 });
  }

  if (existingSubscription?.id) {
    return NextResponse.json(
      { error: 'Free trial already used or an active subscription already exists.' },
      { status: 409 }
    );
  }

  const now = new Date();
  const expiresAt = addDays(now, TRIAL_DAYS);
  const nowIso = now.toISOString();
  const expiresIso = expiresAt.toISOString();

  const claimReference = `trial_claim_${emailHash.slice(0, 32)}`;
  const { error: claimInsertError } = await supabaseAdmin.from('payments').insert({
    user_id: user.id,
    amount: 0,
    reference: claimReference,
    status: 'success',
    plan: 'trial_claim',
    paystack_response: {
      source: 'free_trial',
      trial_email_hash: emailHash,
      trial_days: TRIAL_DAYS,
      claimed_at: nowIso,
    },
  });

  if (claimInsertError) {
    const duplicateClaim = String(claimInsertError.message || '').toLowerCase().includes('duplicate');
    if (duplicateClaim) {
      return NextResponse.json({ error: 'Free trial already used for this email.' }, { status: 409 });
    }
    return NextResponse.json({ error: claimInsertError.message || 'Could not reserve free trial' }, { status: 500 });
  }

  const { error: subscriptionError } = await supabaseAdmin.from('subscriptions').upsert(
    {
      user_id: user.id,
      plan: 'trial',
      status: 'trialing',
      amount: 0,
      started_at: nowIso,
      expires_at: expiresIso,
      updated_at: nowIso,
    },
    { onConflict: 'user_id' }
  );

  if (subscriptionError) {
    return NextResponse.json({ error: subscriptionError.message || 'Could not start free trial' }, { status: 500 });
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ is_subscribed: true, updated_at: nowIso })
    .eq('id', user.id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message || 'Could not update profile' }, { status: 500 });
  }

  return NextResponse.json({
    status: 'trialing',
    trial_days: TRIAL_DAYS,
    started_at: nowIso,
    expires_at: expiresIso,
  });
}
