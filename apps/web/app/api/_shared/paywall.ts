import { NextResponse } from 'next/server';
import { getSubscriptionSnapshot, type AccountStatus } from '@/lib/subscription-access';
import { isAllowlistedEmail } from '@/lib/paywall-allowlist';
import {
  READ_ONLY_REFUSAL_CODE,
  READ_ONLY_REFUSAL_MESSAGE,
  READ_ONLY_REFUSAL_STATUS,
  isHardPaywallEnabled,
  isReadOnlySafeMethod,
} from '@/lib/team-billing';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { getAppAccess } from '@/lib/access-gate-server';
import { NOT_APPROVED_REASON } from '@/lib/access-gate';

// 402 Payment Required is the right code for NO ACCESS. The frontend interceptor
// at apps/web/lib/access-redirect.ts catches it and routes to /locked.
//
// This module emits a second, different refusal: READ-ONLY mode, at 403. That
// one must NOT be a 402 precisely because of the interceptor above — see the
// read-only branch below.
export const ACCESS_REQUIRED_STATUS = 402;
export const ACCESS_REQUIRED_CODE = 'ACCESS_REQUIRED';

type LockReason = 'unpaid' | 'trial_expired' | 'expired' | 'team_trial_expired' | 'not_approved';

/**
 * CLOSED SIGN-UP (2026-10-15). The body an unapproved account gets from every
 * gated route. A 402, so the fetch interceptor (lib/access-redirect.ts) takes
 * the browser to /locked?reason=not_approved, the "You're on the list" screen.
 */
export function notApprovedResponse() {
  return NextResponse.json(
    {
      error: "You're on the list. We'll let you in soon.",
      code: ACCESS_REQUIRED_CODE,
      redirect: '/locked',
      reason: NOT_APPROVED_REASON satisfies LockReason,
    },
    { status: ACCESS_REQUIRED_STATUS }
  );
}

/**
 * Null when the account may use the app, else the 402 above. Runs before the
 * billing gate and regardless of whether billing is on: an unapproved account
 * is held whatever its team or trial state (it should have neither, since
 * ensureOwnedWorkspace refuses to make one). See lib/access-gate-server.ts.
 */
export async function requireApprovedAccount(userId: string, email?: string | null) {
  const access = await getAppAccess(userId, email);
  return access.allowed ? null : notApprovedResponse();
}

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
//
// `method` is the request's HTTP method, and it exists for read-only mode alone
// (see the branch below). The three call sites in app/api/_shared/auth.ts all
// have the NextRequest in hand and pass `request.method`. Omitting it counts as
// a write, which is the safe reading: every route-level caller that cannot name
// its method is a mutation route.
export async function requireActiveAccount(
  userId: string,
  email?: string | null,
  method?: string | null
) {
  // ── CLOSED SIGN-UP (2026-10-15) ─────────────────────────────────────────
  // Invite-only: an account nobody let in is held here, on every gated route,
  // before any billing question is asked.
  const held = await requireApprovedAccount(userId, email);
  if (held) return held;

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
      if (team.canWrite) return null;

      // ── READ-ONLY (payment failure, 2026-08-24) ─────────────────────────
      // This team paid us and their paid period lapsed without a successful
      // renewal. They keep every read, permanently; writes are refused. A
      // trial that merely expired never reaches here — it is walled below.
      //
      // 403, NOT 402, and that is the load-bearing detail: the fetch
      // interceptor in lib/access-redirect.ts redirects the browser to /locked
      // on any same-origin 402, so a 402 here would eject a read-only team
      // from the app on their first blocked save — the very wall this mode
      // replaces. The shape (a flat { error } at 403) matches
      // buildReadOnlyResponse in lib/tasks-server.ts, which already refuses a
      // guest's writes this way, so the mutation surfaces render it unchanged.
      if (isReadOnlySafeMethod(method)) return null;

      return NextResponse.json(
        {
          error: team.isOwnerOrAdmin
            ? READ_ONLY_REFUSAL_MESSAGE.owner
            : READ_ONLY_REFUSAL_MESSAGE.member,
          code: READ_ONLY_REFUSAL_CODE,
          readOnly: true,
        },
        { status: READ_ONLY_REFUSAL_STATUS }
      );
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
  email?: string | null,
  method?: string | null
) {
  return requireActiveAccount(userId, email, method);
}

export const PAYWALL_RESPONSE_CODE = ACCESS_REQUIRED_CODE;
