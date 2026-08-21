// Team trial + hard paywall (NEXT_PUBLIC_FEATURE_HARD_PAYWALL) — pure logic.
//
// A team gets 14 days of full access from the moment it is created, then the
// wall goes up: no read-only mode, no partial access, nothing deleted. The wall
// lifts on payment, a comp, or an extended trial.
//
// WHAT LIVES WHERE. Billing has always been per-user in this codebase
// (subscriptions.user_id UNIQUE, the trial fields on profiles) and rewiring the
// money path would be high risk for no benefit. So:
//   * the OWNER's subscription snapshot answers "is this team paid?"
//   * the TEAM's own row (workspaces.trial_ends_at / comped_at / billing_plan)
//     answers "is this team trialing, comped, or on a deal?"
// resolveTeamAccess combines them; combineTeamAccess handles a person who
// belongs to several teams. Everything here is pure — no I/O, no DB, no React —
// so the gate, the wall, the pill and the admin panel all read one implementation
// and can be unit-tested without a database. The I/O half is
// lib/team-billing-server.ts.
//
// DELIBERATELY SEPARATE FROM lib/trial-card.ts. That module is the superseded
// card-before-trial funnel (card first, 28-day trial after, auto-charge at the
// end), which is the opposite shape of this one and stays dark behind its own
// flag. Nothing here imports it, and TEAM_TRIAL_DAYS is intentionally not
// trial-card's TRIAL_DAYS.

/** The team trial length. 14 days, per the founder's spec. Deliberately NOT
 * lib/trial-card.ts's TRIAL_DAYS (28) — that constant belongs to the
 * superseded card-first funnel and is load-bearing copy on other surfaces. */
export const TEAM_TRIAL_DAYS = 14;

/** The trial indicator appears at this many days left or fewer. Calm and
 * non-blocking until then: a countdown from day 14 would be nagging, not
 * informative. */
export const TEAM_TRIAL_PILL_THRESHOLD_DAYS = 10;

/**
 * Server-side grace past trial_ends_at, for the mid-session-expiry rule ("do
 * not destroy unsaved work; gate on next navigation").
 *
 * Why a grace window at all: apps/web/lib/access-redirect.ts redirects the
 * browser on ANY same-origin 402, and the notifications bell polls on a timer
 * through a gated route. Without grace, a trial lapsing while someone is
 * mid-edit produces a 402 from a background GET within seconds and yanks them
 * off the page. With it, no request 402s for 15 minutes, so in-flight saves
 * land and the user is moved by the CLIENT gate on their next navigation
 * instead. Applies ONLY to trial expiry — never to a lapsed paid subscription
 * or a withdrawn comp, where there is no in-flight work to protect.
 *
 * Clients pass graceMs: 0 so the pill and the wall tell the exact truth.
 */
export const TEAM_TRIAL_EXPIRY_GRACE_MS = 15 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Feature switch. Function form (the isCardTrialEnabled / isEpkFeatureEnabled
 * precedent) so it works inlined into a client bundle and read at request time
 * on the server, and so tests can stub the env. */
export const isHardPaywallEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_HARD_PAYWALL === 'true';

/** The billing columns added to `workspaces` by
 * 20260821120000_team_trial_hard_paywall.sql, camelCased at the read boundary. */
export type WorkspaceBillingFields = {
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  compedAt: string | null;
  /** Deal marker only ('founding' | 'custom'), never an access grant. */
  billingPlan: string | null;
  /** Agreed rate in kobo, for founding/custom deals. Display is admin-only. */
  billingLockedAmount: number | null;
};

export type TeamAccessState =
  /** Owner holds a paid subscription (or is allowlisted). */
  | 'paid'
  /** Admin-granted indefinite free access. */
  | 'comped'
  /** Inside the 14 days. */
  | 'trial'
  /** Past the trial but inside TEAM_TRIAL_EXPIRY_GRACE_MS (server only). */
  | 'grace'
  /** The wall. */
  | 'walled';

export type TeamAccessReason =
  | 'owner_paid'
  | 'owner_allowlisted'
  | 'comped'
  | 'trial_active'
  | 'trial_grace'
  | 'trial_expired'
  /** trial_ends_at was never stamped. Fails OPEN — see resolveTeamAccess. */
  | 'no_trial_stamp';

export type TeamAccessResolution = {
  state: TeamAccessState;
  hasAccess: boolean;
  reason: TeamAccessReason;
  trialEndsAt: string | null;
  /** Whole days remaining, rounded up; 0 once past. */
  trialDaysLeft: number;
  inGrace: boolean;
};

/** Whole days from now until `trialEndsAt`, rounded up (so the last partial day
 * reads as "1 day left", never "0"). 0 for null/past. Mirrors
 * calculateTrialDaysLeft in lib/subscription-access.ts. */
export function computeTeamTrialDaysLeft(
  trialEndsAt: string | null,
  now: Date = new Date()
): number {
  if (!trialEndsAt) return 0;
  const endsMs = Date.parse(trialEndsAt);
  if (!Number.isFinite(endsMs)) return 0;
  const diff = endsMs - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / DAY_MS);
}

/**
 * Resolve ONE team's access.
 *
 * Precedence — owner-paid, then comped, then trial. Paid outranks comped so a
 * team that starts paying reads as 'paid' even if an old comp was never
 * cleared; comped outranks trial so comping a lapsed team works without
 * touching its dates.
 *
 * `ownerHasAccess` is the owner's `getSubscriptionSnapshot().hasAccess`, which
 * already folds in every way this codebase can be paid: an active/cancelled/
 * past_due subscription inside its period, the `profiles.is_subscribed`
 * back-compat branch that grandfathers the legacy paid accounts, a legacy
 * subscription-driven trial, and a promo-granted profile trial.
 *
 * A NULL trial_ends_at FAILS OPEN (state 'trial', reason 'no_trial_stamp').
 * An unstamped row means provisioning or the backfill has not run for this
 * team, which is our bug, not the team's — walling them for it would be the
 * worst possible failure. The stamp arrives at provisioning; the backfill
 * covers everything older.
 */
export function resolveTeamAccess(input: {
  ownerHasAccess: boolean;
  ownerAllowlisted?: boolean;
  team: WorkspaceBillingFields;
  now?: Date;
  /** Server passes TEAM_TRIAL_EXPIRY_GRACE_MS; clients pass 0 (or omit). */
  graceMs?: number;
}): TeamAccessResolution {
  const now = input.now ?? new Date();
  const graceMs = Math.max(0, input.graceMs ?? 0);
  const trialEndsAt = input.team.trialEndsAt;
  const trialDaysLeft = computeTeamTrialDaysLeft(trialEndsAt, now);

  if (input.ownerAllowlisted) {
    return {
      state: 'paid',
      hasAccess: true,
      reason: 'owner_allowlisted',
      trialEndsAt,
      trialDaysLeft,
      inGrace: false,
    };
  }

  if (input.ownerHasAccess) {
    return {
      state: 'paid',
      hasAccess: true,
      reason: 'owner_paid',
      trialEndsAt,
      trialDaysLeft,
      inGrace: false,
    };
  }

  if (input.team.compedAt) {
    return {
      state: 'comped',
      hasAccess: true,
      reason: 'comped',
      trialEndsAt,
      trialDaysLeft,
      inGrace: false,
    };
  }

  const endsMs = trialEndsAt ? Date.parse(trialEndsAt) : Number.NaN;
  if (!Number.isFinite(endsMs)) {
    // Unstamped (or unparseable) — fail open. See the doc comment.
    return {
      state: 'trial',
      hasAccess: true,
      reason: 'no_trial_stamp',
      trialEndsAt,
      trialDaysLeft: 0,
      inGrace: false,
    };
  }

  const nowMs = now.getTime();
  if (nowMs < endsMs) {
    return {
      state: 'trial',
      hasAccess: true,
      reason: 'trial_active',
      trialEndsAt,
      trialDaysLeft,
      inGrace: false,
    };
  }

  if (graceMs > 0 && nowMs < endsMs + graceMs) {
    return {
      state: 'grace',
      hasAccess: true,
      reason: 'trial_grace',
      trialEndsAt,
      trialDaysLeft: 0,
      inGrace: true,
    };
  }

  return {
    state: 'walled',
    hasAccess: false,
    reason: 'trial_expired',
    trialEndsAt,
    trialDaysLeft: 0,
    inGrace: false,
  };
}

/**
 * Combine every team a person belongs to into one answer.
 *
 * The problem this solves: `loadWorkspaceAccessContext` provisions a workspace
 * for EVERY non-curator account on first load, so an invited teammate owns an
 * empty shell alongside the real team they were invited into. That shell gets
 * its own 14-day trial. Without care, a teammate whose team is walled would
 * keep working on their shell's trial, and the wall would never apply to
 * anyone who had ever been invited.
 *
 * Rules, in order:
 *   1. No teams at all -> ACCESS. The gate runs before route-level
 *      provisioning, so a brand-new account's very first request has no rows
 *      yet. Failing closed here would deadlock first load.
 *   2. Any team the person does NOT own is unwalled -> ACCESS. This is the
 *      inheritance the whole feature exists for.
 *   3. Their own team is unwalled -> ACCESS only if it is plausibly their real
 *      team: either they belong to no foreign teams at all, or they have at
 *      least one release of their own. This mirrors the primary-workspace
 *      exception in resolveWorkspaceAccessContext, which treats an owned
 *      workspace with zero releases as the empty shell it is.
 *   4. Otherwise -> WALLED.
 *
 * `ownReleaseCount: null` means "not fetched". The caller only pays for that
 * count in rule 3's ambiguous branch, signalled by `needsOwnReleaseCount`.
 */
export function combineTeamAccess(input: {
  own: { state: TeamAccessState } | null;
  foreign: Array<{ state: TeamAccessState }>;
  ownReleaseCount: number | null;
}): { hasAccess: boolean; needsOwnReleaseCount: boolean } {
  const foreign = input.foreign ?? [];

  if (!input.own && foreign.length === 0) {
    return { hasAccess: true, needsOwnReleaseCount: false };
  }

  if (foreign.some((team) => team.state !== 'walled')) {
    return { hasAccess: true, needsOwnReleaseCount: false };
  }

  if (input.own && input.own.state !== 'walled') {
    if (foreign.length === 0) {
      return { hasAccess: true, needsOwnReleaseCount: false };
    }
    if (input.ownReleaseCount === null) {
      return { hasAccess: false, needsOwnReleaseCount: true };
    }
    return { hasAccess: input.ownReleaseCount > 0, needsOwnReleaseCount: false };
  }

  return { hasAccess: false, needsOwnReleaseCount: false };
}

/**
 * Who sees payment actions on the wall. The spec: all members hit the wall,
 * but only the owner/admin can act; everyone else is told their team admin
 * needs to activate.
 *
 * `isWorkspaceOwner` is `workspaces.owner_id === userId` — the authoritative
 * test, because role='owner' can be granted inside someone else's team (the
 * codebase warns about this twice). An 'admin' role also gets payment actions,
 * matching how requireLinkManager already gates consequential team actions.
 */
export function resolveWallVariant(input: {
  isWorkspaceOwner: boolean;
  membershipRole: string | null;
}): 'owner' | 'member' {
  if (input.isWorkspaceOwner) return 'owner';
  const role = String(input.membershipRole ?? '').trim().toLowerCase();
  return role === 'owner' || role === 'admin' ? 'owner' : 'member';
}

/**
 * Admin "extend trial by N days". Extends from whichever is later: now, or the
 * current end. So extending a live trial adds days on top (never shortens it),
 * and extending a lapsed one gives a real N days from today rather than N days
 * from a date in the past — which would silently do nothing.
 */
export function computeExtendedTrialEnd(
  currentEndsAt: string | null,
  days: number,
  now: Date = new Date()
): Date {
  const currentMs = currentEndsAt ? Date.parse(currentEndsAt) : Number.NaN;
  const base = Number.isFinite(currentMs)
    ? Math.max(now.getTime(), currentMs)
    : now.getTime();
  return new Date(base + days * DAY_MS);
}

// ---------------------------------------------------------------------------
// In-session gate predicates (the CardTrialGate shape: pure decision, tested)
// ---------------------------------------------------------------------------

/** Chrome-bearing surfaces the in-session gate covers.
 *
 * '/admin' is deliberately ABSENT: the founder must be able to reach
 * /admin/teams to comp or extend a team even while their own account is
 * walled, and the admin APIs are open routes gated by ADMIN_EMAILS rather than
 * by the paywall. Curator routes and the public token pages are absent for the
 * same reason they are absent from the card-trial gate: the curator side is
 * free, and public pages have no account. */
const HARD_PAYWALL_GATED_PATH_PREFIXES = ['/dashboard', '/settings'] as const;

export function isHardPaywallGatedPath(pathname: string | null | undefined): boolean {
  const path = String(pathname ?? '');
  return HARD_PAYWALL_GATED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

/** The last answer this tab holds, keyed by the user it was computed for.
 *
 * Unlike the card-trial gate's answer, `walled` is NOT one-way: a walled team
 * becomes unwalled the moment it pays or is comped, and an active trial lapses
 * into the wall. So this carries `checkedAt` and the consult predicate honours
 * a short TTL in both directions rather than caching a negative forever. */
export type HardPaywallGateAnswer = {
  userId: string;
  walled: boolean;
  checkedAt: number;
} | null;

/** How long a client-side answer is reused before re-asking. Short: the wall
 * must appear promptly after a trial lapses and disappear promptly after
 * payment. The server's own 30s positive-only cache is the real rate limit. */
export const HARD_PAYWALL_ANSWER_TTL_MS = 30 * 1000;

export type HardPaywallGateInput = {
  enabled: boolean;
  pathname: string | null | undefined;
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  userId: string | null | undefined;
  role: string | null | undefined;
  allowlisted: boolean;
  lastAnswer: HardPaywallGateAnswer;
  now?: number;
};

/**
 * Should the in-session gate ask the server right now? Fail-safe by
 * construction: a `true` here only triggers a read whose answer decides the
 * redirect — this never walls anyone on its own.
 */
export function shouldConsultHardPaywallGate(input: HardPaywallGateInput): boolean {
  if (!input.enabled) return false;
  if (!isHardPaywallGatedPath(input.pathname)) return false;
  if (input.isAuthLoading || !input.isAuthenticated) return false;

  const userId = String(input.userId ?? '').trim();
  if (!userId) return false;

  // Curator-only accounts never reach team routes (blockCuratorAccount 403s
  // them before the account gate), so there is nothing to ask about.
  const role = String(input.role ?? '').trim().toLowerCase();
  if (role === 'curator') return false;

  // Allowlisted emails bypass the wall server-side; skip the round trip.
  if (input.allowlisted) return false;

  const last = input.lastAnswer;
  if (last && last.userId === userId) {
    const now = input.now ?? Date.now();
    if (now - last.checkedAt < HARD_PAYWALL_ANSWER_TTL_MS) return false;
  }

  return true;
}
