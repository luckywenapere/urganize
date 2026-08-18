import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../releases/_shared';
import { createAdminClient } from '@/app/api/_shared/auth';
import {
  calculateTrialDaysLeft,
  getSubscriptionSnapshot,
  type SubscriptionSnapshot,
} from '../../../lib/subscription-access';
import { isAllowlistedEmail } from '@/lib/paywall-allowlist';
import { isCardTrialEnabled, resolveCardTrialRequirement } from '@/lib/trial-card';

// cardTrialRequired — the card-before-trial gate signal (NEXT_PUBLIC_FEATURE_CARD_TRIAL).
//
// True only for a NEW signup (profiles.created_at >= TRIAL_CARD_SIGNUP_CUTOFF)
// with no access, no trial used, a non-curator role, and no active non-owner
// workspace membership (an invited teammate rides the workspace they were
// invited into and must never be asked to pay for it — membership rows are the
// truth here, since role alone is unreliable: existing accounts accepting
// invites keep their old role, while owner rows exist for everyone via the
// lazy workspace bootstrap and are excluded by role != 'owner').
//
// Short-circuits to false unless the snapshot already reads unpaid+untrialed,
// so the two extra admin reads cost nothing for paid/trial/expired accounts.
// Every read failure fails OPEN (false) — the isFirstReleaseRequired doctrine:
// a wrong `true` walls someone out of the product.
async function computeCardTrialRequired(
  userId: string,
  supabaseUrl: string,
  snapshot: SubscriptionSnapshot
): Promise<boolean> {
  if (!isCardTrialEnabled()) return false;
  if (snapshot.accountStatus !== 'unpaid' || snapshot.trialUsed || snapshot.hasAccess) {
    return false;
  }

  const cutoffIso = process.env.TRIAL_CARD_SIGNUP_CUTOFF;
  if (!cutoffIso?.trim()) {
    // Misconfiguration is otherwise invisible: the gate silently never fires.
    console.warn(
      '[trial-card] NEXT_PUBLIC_FEATURE_CARD_TRIAL is on but TRIAL_CARD_SIGNUP_CUTOFF is unset — the login-time gate is inert.'
    );
    return false;
  }

  const admin = createAdminClient(supabaseUrl);
  if (!admin) return false;

  try {
    const [profileResult, membershipResult] = await Promise.all([
      admin.from('profiles').select('created_at, role').eq('id', userId).maybeSingle(),
      admin
        .from('workspace_members')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .neq('role', 'owner')
        .limit(1),
    ]);

    if (profileResult.error || !profileResult.data) return false;
    if (membershipResult.error) return false;

    return resolveCardTrialRequirement({
      enabled: true,
      cutoffIso,
      createdAtIso: profileResult.data.created_at ? String(profileResult.data.created_at) : null,
      accountStatus: snapshot.accountStatus,
      trialUsed: snapshot.trialUsed,
      hasAccess: snapshot.hasAccess,
      role: profileResult.data.role ? String(profileResult.data.role) : null,
      isWorkspaceMember: (membershipResult.data?.length ?? 0) > 0,
    });
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  // Allowlist bypass — surface allowlisted users to the frontend as paid so
  // every consumer of this endpoint (auth-store redirect, /locked page,
  // subscription-access browser fetch) naturally skips lockout UI.
  if (isAllowlistedEmail(auth.user.email)) {
    console.log(
      `[paywall-allowlist] bypass via subscription-status: user=${auth.user.id} email=${auth.user.email?.trim().toLowerCase()}`
    );
    return NextResponse.json({
      status: 'active',
      hasAccess: true,
      trialEndsAt: null,
      trialDaysLeft: 0,
      expiresAt: null,
      plan: 'allowlist',
      rawStatus: 'allowlisted',
      accountStatus: 'paid',
      trialUsed: false,
      trialStartedAt: null,
      paidAt: null,
      allowlisted: true,
      cardTrialRequired: false,
    });
  }

  const snapshot = await getSubscriptionSnapshot(auth.user.id);
  const cardTrialRequired = await computeCardTrialRequired(
    auth.user.id,
    auth.supabaseUrl,
    snapshot
  );

  return NextResponse.json({
    status: snapshot.status,
    hasAccess: snapshot.hasAccess,
    trialEndsAt: snapshot.trialEndsAt,
    trialDaysLeft: calculateTrialDaysLeft(snapshot.trialEndsAt),
    expiresAt: snapshot.expiresAt,
    plan: snapshot.plan,
    rawStatus: snapshot.rawStatus,
    accountStatus: snapshot.accountStatus,
    trialUsed: snapshot.trialUsed,
    trialStartedAt: snapshot.trialStartedAt,
    paidAt: snapshot.paidAt,
    cardTrialRequired,
  });
}
