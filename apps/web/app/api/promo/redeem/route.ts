import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '../../releases/_shared';
import {
  getSubscriptionSnapshot,
  invalidateSubscriptionSnapshot,
} from '@/lib/subscription-access';

// POST /api/promo/redeem  { code }
// Redeems a partnership promo code for the logged-in user, granting a fixed
// free-access window. This is an OPEN route (like /api/trial/start) — it must
// work while the caller is locked/unpaid.
//
// Mechanism: reuses the trial machinery. On success we write
// profiles.trial_ends_at = now + free_days via the service-role admin client
// (the protective trigger in 20260528_payment_gating_trial_fields.sql blocks
// authenticated/anon writes), and resolveSnapshot() grants trial access off
// trial_ends_at > now. No change to the access model.
//
// Rules (in order):
//   1. Must be authenticated.
//   2. Must not already have paid access (409 — no perk needed).
//   3. Must not have already redeemed a promo on this account (409) — stops
//      one account consuming multiple cap slots.
//   4. Code must be valid: active, not expired, under its redemption cap. The
//      claim is atomic (claim_promo_code RPC) so the cap can't be over-issued.
//
// The 60-day window OVERRIDES any prior trial: we overwrite trial_ends_at even
// when trial_used is already true, so a participant who tried Urganize before
// still gets the full partnership window.

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const userId = auth.user.id;

  let rawCode = '';
  try {
    const body = (await request.json()) as { code?: unknown };
    rawCode = typeof body.code === 'string' ? body.code : '';
  } catch {
    // fall through to the empty-code guard below
  }
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: 'Enter a promo code.' }, { status: 400 });
  }

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json(
      { error: 'Server environment is not configured' },
      { status: 500 }
    );
  }

  // Block if currently paid — a paid account has full access already.
  const snapshot = await getSubscriptionSnapshot(userId);
  if (snapshot.accountStatus === 'paid') {
    return NextResponse.json(
      {
        error: 'Your account already has full access — no code needed.',
        accountStatus: snapshot.accountStatus,
      },
      { status: 409 }
    );
  }

  // Re-read the profile via admin so the per-user guard can't be bypassed by a
  // client mutating its local snapshot.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('promo_code')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'Could not load account profile.' },
      { status: 500 }
    );
  }

  if (profile.promo_code) {
    return NextResponse.json(
      { error: 'A promo code has already been redeemed on this account.' },
      { status: 409 }
    );
  }

  // Atomic claim: validity + cap + increment in one statement (see migration).
  const { data: claim, error: claimError } = await admin
    .rpc('claim_promo_code', { p_code: code })
    .maybeSingle<{ free_days: number; label: string | null }>();

  if (claimError) {
    return NextResponse.json(
      { error: 'Could not redeem the code. Please try again.' },
      { status: 500 }
    );
  }

  if (!claim) {
    return NextResponse.json(
      { error: 'This code is invalid, expired, or fully claimed.' },
      { status: 400 }
    );
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + claim.free_days * 24 * 60 * 60 * 1000);

  // Grant the window. Overwrites trial_ends_at even if trial_used is already
  // true — the partnership perk overrides a prior self-serve trial.
  const { error: updateError } = await admin
    .from('profiles')
    .update({
      trial_used: true,
      trial_started_at: now.toISOString(),
      trial_ends_at: endsAt.toISOString(),
      promo_code: code,
      promo_redeemed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Could not apply your free access.' },
      { status: 500 }
    );
  }

  // Refresh the cached snapshot so this and the next request see the grant.
  invalidateSubscriptionSnapshot(userId);
  const freshSnapshot = await getSubscriptionSnapshot(userId);

  return NextResponse.json({
    status: 'promo_redeemed',
    accountStatus: freshSnapshot.accountStatus,
    trialEndsAt: freshSnapshot.trialEndsAt,
    freeDays: claim.free_days,
    label: claim.label,
  });
}
