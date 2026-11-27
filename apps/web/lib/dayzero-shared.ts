// Day Zero (#1393): the bits the browser needs too. No node:crypto here, so the
// activation page and the AppShell claimer can import it. Rules live in
// lib/dayzero.ts.

/** The plan a license grants: Solo Plus, as the locked Day Zero deal page
 * says (founder call, 2026-11-27, #1419). It was Pro (`manager`) from #1393. */
export const DAYZERO_PLAN = 'solo_plus' as const;

/** httpOnly: the signed license. */
export const DAYZERO_CLAIM_COOKIE = 'urg_dz_license';
/** Readable by the page: only says "a license is waiting", never which. */
export const DAYZERO_PENDING_COOKIE = 'urg_dz_pending';
export const DAYZERO_CLAIM_TTL_SECONDS = 60 * 60;

// ── The plan an account gets ────────────────────────────────────────────────

/** Paid plans a lifetime Solo Plus license should NOT override: they already
 * give as much or more. Solo is smaller, so Solo Plus wins there. Legacy
 * single-price plans map to Label (lib/entitlements.ts), so they stay. */
const PLANS_AT_OR_ABOVE_SOLO_PLUS = new Set([
  'solo_plus',
  'manager',
  'pro',
  'label',
  'enterprise',
  'monthly',
  'annual',
  'yearly',
  'access',
  'custom',
  'founding',
]);

/** Is this paid plan already at or above what a license gives? Then the
 * license changes nothing, and cancelling the card plan would be a downgrade. */
export function planCoversLifetime(plan: string | null | undefined): boolean {
  return PLANS_AT_OR_ABOVE_SOLO_PLUS.has(plan ?? '');
}

type SnapshotLike = {
  status: string;
  hasAccess: boolean;
  plan: string | null;
  accountStatus: string;
  expiresAt: string | null;
  trialEndsAt: string | null;
};

/**
 * Fold an active license into a subscription snapshot. A paid snapshot on a
 * plan at or above Solo Plus is left alone; everything else (no plan, a trial,
 * a lapse, Solo) becomes paid on Solo Plus with no end date.
 */
export function applyLifetimeLicense<T extends SnapshotLike>(
  snapshot: T,
  hasActiveLicense: boolean
): T & { lifetime: boolean } {
  if (!hasActiveLicense) return { ...snapshot, lifetime: false };
  const paidAlready =
    snapshot.hasAccess && snapshot.accountStatus === 'paid' && planCoversLifetime(snapshot.plan);
  if (paidAlready) return { ...snapshot, lifetime: false };
  return {
    ...snapshot,
    status: 'active',
    hasAccess: true,
    plan: DAYZERO_PLAN,
    accountStatus: 'paid',
    expiresAt: null,
    trialEndsAt: null,
    lifetime: true,
  };
}

/** Did this person already have a live card plan when they activated? Then the
 * founder cancels it by hand (founder call, 2026-11-26): we never stop a
 * Paystack subscription on our own. */
export function hasLiveCardPlan(
  row: { status: string | null; expires_at: string | null; paystack_subscription_code?: string | null } | null,
  nowMs = Date.now()
): boolean {
  if (!row) return false;
  if (row.status !== 'active' && row.status !== 'past_due') return false;
  const ends = row.expires_at ? Date.parse(row.expires_at) : NaN;
  if (Number.isFinite(ends) && ends <= nowMs) return false;
  return true;
}

// ── What the activation page shows ──────────────────────────────────────────

/** The answer POST /api/dayzero/claim gives the page. */
export type DayzeroClaimState =
  /** Attached (or already attached to this account). Solo Plus is on. */
  | 'attached'
  /** Checked and active, but nobody is signed in. Waiting in the cookie. */
  | 'needs_account'
  /** Attached to a different account. */
  | 'other_account'
  /** The code was used, expired, or the license is not active. */
  | 'expired'
  /** No code and nothing waiting. */
  | 'nothing'
  /** Something on our side or Day Zero's failed. */
  | 'error';
