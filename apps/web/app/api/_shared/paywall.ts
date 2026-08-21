import { NextResponse } from 'next/server';
import { getSubscriptionSnapshot, type AccountStatus } from '@/lib/subscription-access';
import { isAllowlistedEmail } from '@/lib/paywall-allowlist';
import { isHardPaywallEnabled } from '@/lib/team-billing';
import { getTeamAccessForUser } from '@/lib/team-billing-server';

// 402 Payment Required is the right code here. The frontend interceptor at
// apps/web/lib/access-redirect.ts catches it and routes to /locked.
export const ACCESS_REQUIRED_STATUS = 402;
export const ACCESS_REQUIRED_CODE = 'ACCESS_REQUIRED';

type LockReason = 'unpaid' | 'trial_expired' | 'expired' | 'team_trial_expired';

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
  // ── TEAM TRIAL + HARD PAYWALL (NEXT_PUBLIC_FEATURE_HARD_PAYWALL) ────────
  // When on, access is a TEAM question, not a per-user one: a team gets 14
  // days from creation, then the wall, and every member inherits the owner's
  // paid status (see lib/team-billing-server.ts). This branch supersedes the
  // free-era early return below and the per-user gate under it.
  //
  // The resolver applies a 15-minute grace past trial expiry so an in-flight
  // save is never lost and a background poll cannot yank someone mid-edit;
  // the client-side gate uses exact time and moves them on their next
  // navigation. See TEAM_TRIAL_EXPIRY_GRACE_MS.
  //
  // Curator-only accounts never arrive here: blockCuratorAccount 403s them in
  // requireActiveAuthenticatedUser BEFORE this call, and the curator routes
  // use requireCuratorUser, which never gates. The curator side stays free.
  if (isHardPaywallEnabled()) {
    if (isAllowlistedEmail(email)) {
      console.log(
        `[paywall-allowlist] bypass: user=${userId} email=${email?.trim().toLowerCase()}`
      );
      return null;
    }

    const team = await getTeamAccessForUser(userId, email);
    if (team.hasAccess) {
      return null;
    }

    return NextResponse.json(
      {
        error: 'This team needs an active plan.',
        code: ACCESS_REQUIRED_CODE,
        redirect: '/locked',
        reason: 'team_trial_expired' satisfies LockReason,
        // Legacy fields kept so existing consumers of this body (the fetch
        // interceptor's reason extraction, the auth-store bounce) keep working
        // unchanged rather than needing a parallel shape.
        accountStatus: 'expired' satisfies AccountStatus,
        trialUsed: true,
      },
      { status: ACCESS_REQUIRED_STATUS }
    );
  }

  // ── PAYWALL OFF (founder decision, 2026-07-23) ──────────────────────────
  // The app is free while the founders talk to every prospective team
  // directly (marketing /pricing now books a demo instead of selling
  // self-serve). Every authenticated account passes; no route returns 402
  // and nothing routes users to /locked. The billing plumbing (Paystack
  // webhook, checkout, verify, subscription-status, the /locked page
  // itself) stays in the codebase dormant.
  //
  // To restore the paywall: delete this early return — the original gate
  // below (allowlist → subscription snapshot → 402) is unchanged — and
  // re-enable the login bounce in lib/auth-store.ts
  // (ensureActiveAccessOrRedirect).
  if (userId) return null;

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
