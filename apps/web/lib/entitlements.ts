import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSubscriptionSnapshot } from './subscription-access';
import { isAllowlistedEmail } from './paywall-allowlist';

// URG-178: free core + paid tier. core_release_task (release creation, task
// assignment/completion, seeing task owners, team assignment) is NEVER
// gated and isn't represented here at all — see the routes that switched
// from requireActiveAuthenticatedUser/requireAuthenticatedAdmin to
// getAuthenticatedUser/getAuthenticatedAdmin. This module resolves ONLY the
// four paid-tier flags, read live from subscription state (not a static
// NEXT_PUBLIC_FEATURE_* build-time flag) so upgrading unlocks them without a
// deploy and a lapsed subscription re-locks them on the next request.
export type PaidFeatureFlag =
  | 'catalogView'
  | 'chappiAssistant'
  | 'fileManagement'
  | 'crossReleaseInsights';

export type Entitlements = Record<PaidFeatureFlag, boolean>;

export const ALL_ENTITLEMENTS_ON: Entitlements = {
  catalogView: true,
  chappiAssistant: true,
  fileManagement: true,
  crossReleaseInsights: true,
};

export const ALL_ENTITLEMENTS_OFF: Entitlements = {
  catalogView: false,
  chappiAssistant: false,
  fileManagement: false,
  crossReleaseInsights: false,
};

// Pure decision core (mirrors resolveSnapshot in subscription-access.ts) —
// both inputs already resolved to booleans by the I/O wrapper below, so this
// is directly unit-testable with no Supabase mocking. The allowlist bypass
// is handled by the wrapper before either DB read, not here (it has its own
// coverage in paywall-allowlist.test.ts).
//
// Trial accounts get the full paid-tier preview (same as any other
// hasAccess snapshot) — a 28-day trial exists specifically to preview what
// paying unlocks, not just to extend the free core the trial predates.
export function resolveEntitlements(
  isFoundingMember: boolean,
  snapshotHasAccess: boolean
): Entitlements {
  if (isFoundingMember || snapshotHasAccess) {
    return ALL_ENTITLEMENTS_ON;
  }
  return ALL_ENTITLEMENTS_OFF;
}

type FoundingMemberRow = { is_founding_member?: boolean | null };

// I/O wrapper. Callers already hold an adminClient from
// getAuthenticatedAdmin/requireAuthenticatedAdmin — reuse it rather than
// constructing a second Supabase client.
export async function getEntitlements(
  userId: string,
  email: string | null | undefined,
  adminClient: SupabaseClient
): Promise<Entitlements> {
  if (!userId) return ALL_ENTITLEMENTS_OFF;

  // Allowlist check first, same as requireActiveAccount — no DB read needed
  // for the internal test/dev bypass.
  if (isAllowlistedEmail(email)) {
    return ALL_ENTITLEMENTS_ON;
  }

  const [snapshot, profileResult] = await Promise.all([
    getSubscriptionSnapshot(userId),
    adminClient.from('profiles').select('is_founding_member').eq('id', userId).maybeSingle(),
  ]);

  const isFoundingMember = Boolean(
    (profileResult.data as FoundingMemberRow | null)?.is_founding_member
  );

  return resolveEntitlements(isFoundingMember, snapshot.hasAccess);
}

// 403, not the 402/redirect the whole-app paywall uses — these are
// individual features on an already-active account, not a locked account.
export function entitlementDeniedResponse(flag: PaidFeatureFlag) {
  return NextResponse.json(
    {
      error: 'Upgrade required for this feature.',
      code: 'ENTITLEMENT_REQUIRED',
      flag,
    },
    { status: 403 }
  );
}

// Auth + admin client + entitlement check in one call, for the common case
// (Chappi, assets). Returns { error } (403) when the account is
// authenticated but not entitled to `flag`; { entitlements } alongside the
// auth result when it is, so callers keep the same request's client instead
// of re-fetching entitlements again.
export async function requireEntitlement(
  flag: PaidFeatureFlag,
  userId: string,
  email: string | null | undefined,
  adminClient: SupabaseClient
) {
  const entitlements = await getEntitlements(userId, email, adminClient);
  if (!entitlements[flag]) {
    return { error: entitlementDeniedResponse(flag) };
  }
  return { entitlements };
}
