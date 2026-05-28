import { NextResponse } from 'next/server';
import { getSubscriptionSnapshot, type AccountStatus } from '@/lib/subscription-access';
import { isAllowlistedEmail } from '@/lib/paywall-allowlist';

// 402 Payment Required is the right code here. The frontend interceptor at
// apps/web/lib/access-redirect.ts catches it and routes to /locked.
export const ACCESS_REQUIRED_STATUS = 402;
export const ACCESS_REQUIRED_CODE = 'ACCESS_REQUIRED';

type LockReason = 'unpaid' | 'trial_expired' | 'expired';

const reasonForStatus = (status: AccountStatus, trialUsed: boolean): LockReason => {
  if (status === 'expired') {
    return trialUsed ? 'trial_expired' : 'expired';
  }
  return 'unpaid';
};

// Returns null when the user has access (paid, active trial, or allowlisted).
// Returns a 402 NextResponse with { redirect, reason } when blocked.
//
// `email` is optional but recommended: passing it lets the allowlist check
// short-circuit before any DB read. Auth helpers (requireActiveAuthenticatedUser
// in releases/_shared.ts, tasks-server.ts, ui-drafts/_shared.ts,
// plans/_shared.ts) all forward it through. Routes calling this inline should
// pass `user.email` from their auth result.
export async function requireActiveAccount(
  userId: string,
  email?: string | null
) {
  // Allowlist check first — before any DB work — per the spec.
  if (isAllowlistedEmail(email)) {
    console.log(
      `[paywall-allowlist] bypass: user=${userId} email=${email?.trim().toLowerCase()}`
    );
    return null;
  }

  const snapshot = await getSubscriptionSnapshot(userId);
  if (snapshot.hasAccess) {
    return null;
  }

  const reason = reasonForStatus(snapshot.accountStatus, snapshot.trialUsed);
  return NextResponse.json(
    {
      error: 'Active subscription or trial required.',
      code: ACCESS_REQUIRED_CODE,
      redirect: '/locked',
      reason,
      accountStatus: snapshot.accountStatus,
      trialUsed: snapshot.trialUsed,
    },
    { status: ACCESS_REQUIRED_STATUS }
  );
}

// Legacy alias. Existing call sites (releases/collaborators, organization/members,
// workspace/members/invite) accept `feature` and `message` options that are now
// ignored since the global gate took over. The optional `email` argument was
// added so allowlist bypass propagates through the legacy path too.
type LegacyOptions = { feature: string; message: string };
export async function requirePaidAccess(
  userId: string,
  _options?: LegacyOptions,
  email?: string | null
) {
  return requireActiveAccount(userId, email);
}

export const PAYWALL_RESPONSE_CODE = ACCESS_REQUIRED_CODE;
