import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '../../releases/_shared';
import {
  getSubscriptionSnapshot,
  invalidateSubscriptionSnapshot,
} from '@/lib/subscription-access';
import { TRIAL_DAYS, isCardTrialEnabled } from '@/lib/trial-card';
import { isHardPaywallEnabled } from '@/lib/team-billing';

// POST /api/trial/start
// Starts the one-time 28-day trial for the logged-in user.
//
// Rules (in the order they're checked):
//   0. With NEXT_PUBLIC_FEATURE_CARD_TRIAL on, this no-card path is dark
//      (404 before auth, the EPK precedent) — the trial then requires a card
//      via /api/trial/start-checkout, and leaving this open would be a
//      one-POST bypass. Nothing calls it under the flag: onboarding skips it
//      and /locked's trial button routes to /start-trial instead. The promo
//      path (/api/promo/redeem) writes the trial fields directly and stays
//      card-free by design.
//   1. Must be authenticated.
//   2. Must not already have an active paid subscription (409).
//   3. Must not have already used the trial — trial_used flag is the single
//      source of truth, persists even if subscription/profile state changes (400).
//
// On success: profiles.trial_used=true, trial_started_at=now(),
// trial_ends_at=now()+28d. Writes go through the service-role admin client
// because the protective trigger in 20260528_payment_gating_trial_fields.sql
// blocks authenticated callers from setting these columns themselves.
// TRIAL_DAYS is shared with the card flow via lib/trial-card.ts so the two
// paths can never disagree about the trial length.

export async function POST(request: NextRequest) {
  if (isCardTrialEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  // Under the team trial + hard paywall, this route is a wall bypass: it is an
  // OPEN route that grants a 28-day PROFILE trial on nothing but "trial_used is
  // false", and the team resolver honours the owner's profile trial through
  // their subscription snapshot. So a walled owner could POST here once and
  // walk straight back into the product. Trials are team-scoped and granted at
  // team creation now; extending one is an admin action.
  if (isHardPaywallEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const userId = auth.user.id;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json(
      { error: 'Server environment is not configured' },
      { status: 500 }
    );
  }

  // Re-read profile via admin client so the trial_used check isn't bypassable
  // by a client that mutated its local snapshot.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('trial_used, trial_started_at, trial_ends_at, is_subscribed')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'Could not load account profile.' },
      { status: 500 }
    );
  }

  // Block if currently paid.
  const snapshot = await getSubscriptionSnapshot(userId);
  if (snapshot.accountStatus === 'paid') {
    return NextResponse.json(
      {
        error: 'Account already has paid access. No trial is needed.',
        accountStatus: snapshot.accountStatus,
      },
      { status: 409 }
    );
  }

  // Block if trial already used.
  if (profile.trial_used) {
    return NextResponse.json(
      {
        error: 'Free trial has already been used on this account.',
        accountStatus: snapshot.accountStatus,
        trialUsed: true,
        trialEndsAt: profile.trial_ends_at || null,
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      trial_used: true,
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Could not start trial.' },
      { status: 500 }
    );
  }

  // Re-fetch snapshot so the response carries the new truth (invalidate
  // first — the server-side snapshot cache must not serve the pre-trial
  // state to this or the next request on this instance).
  invalidateSubscriptionSnapshot(userId);
  const freshSnapshot = await getSubscriptionSnapshot(userId);

  return NextResponse.json({
    status: 'trial_started',
    accountStatus: freshSnapshot.accountStatus,
    trialStartedAt: freshSnapshot.trialStartedAt,
    trialEndsAt: freshSnapshot.trialEndsAt,
    trialDays: TRIAL_DAYS,
  });
}
