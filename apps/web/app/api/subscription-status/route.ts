import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../releases/_shared';
import {
  calculateTrialDaysLeft,
  getSubscriptionSnapshot,
} from '../../../lib/subscription-access';
import { isAllowlistedEmail } from '@/lib/paywall-allowlist';

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
    });
  }

  const snapshot = await getSubscriptionSnapshot(auth.user.id);

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
  });
}
