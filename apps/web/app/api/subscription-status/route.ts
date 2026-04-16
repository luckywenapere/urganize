import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../releases/_shared';
import {
  calculateTrialDaysLeft,
  getSubscriptionSnapshot,
} from '../../../lib/subscription-access';

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
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
  });
}
