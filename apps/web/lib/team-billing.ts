// Team trial + hard paywall (NEXT_PUBLIC_FEATURE_HARD_PAYWALL) — pure logic.
//
// A team gets 3 days of full access from the moment it is created, then the
// wall goes up: no partial access, nothing deleted. The wall lifts on payment, a
// comp, or an extended trial.
//
// ONE EXCEPTION, added 2026-08-24: a team that has actually PAID us and whose
// paid period then lapsed lands in read-only rather than at the wall — they keep
// every read, permanently, and writes are refused. A trial that expires still
// gets the wall (founder decision). See resolveTeamAccess and
// lapsedFromPayment; this file's own header used to say "no read-only mode".
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

/** The team trial length: 3 days for every new account, as part of
 * onboarding (founder, 2026-11-13, #1262). It was 0 from 2026-10-31 (pay
 * first), when a new team was stamped with a trial that had already ended and
 * trials were then extended by hand from the admin page. Before that, 3 days
 * from 2026-09-10 (14 in the original spec). With this above 0, onboarding
 * skips the plan wall and shows "Your 3-day trial is on" instead. Deliberately NOT lib/trial-card.ts's
 * TRIAL_DAYS (28) — that constant belongs to the superseded card-first funnel
 * and is load-bearing copy on other surfaces. */
export const TEAM_TRIAL_DAYS = 3;

/** The trial indicator appears at this many days left or fewer. Calm and
 * non-blocking until then. Shrunk from 10 to 1 alongside the 2026-09-10
 * length change — a 3-day trial has no room for a multi-day countdown, so
 * the indicator now shows only on the trial's final day. */
export const TEAM_TRIAL_PILL_THRESHOLD_DAYS = 1;

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

/** Feature switch; lives in lib/hard-paywall-flag.ts (see there). */
export { isHardPaywallEnabled } from '@/lib/hard-paywall-flag';

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
  /** Days of access the team holds AFTER its owner's paid period ends
   *  (workspaces.paid_bonus_days, 20261011120000_share_reward.sql). Today only
   *  the share reward writes it (lib/share-reward.ts). Optional, and absent
   *  means 0, so every reader that predates the column behaves as before. */
  paidBonusDays?: number | null;
  /** When the owner cancelled the team's trial through the cancel flow
   *  (workspaces.trial_cancelled_at, 20261014150000_cancel_flow.sql). Founder
   *  call, 2026-10-14: a team that cancelled its trial lands in read-only, not
   *  at the wall, once the trial is over. Absent means "never cancelled", which
   *  keeps every never-cancelled unpaid trial exactly as it was (the wall). */
  trialCancelledAt?: string | null;
};

export type TeamAccessState =
  /** Owner holds a paid subscription (or is allowlisted). */
  | 'paid'
  /** Admin-granted indefinite free access. */
  | 'comped'
  /** Inside the 3 days. */
  | 'trial'
  /** Past the trial but inside TEAM_TRIAL_EXPIRY_GRACE_MS (server only). */
  | 'grace'
  /** Paid before, and the paid period ended without a successful renewal. They
   *  keep every read; writes are refused. Permanent — there is no second
   *  deadline and no wall after it. See resolveTeamAccess. */
  | 'read_only'
  /* 'credits_only' (no plan, credits in the balance, so the whole app with
   * Solo features) existed from 2026-10-02 to 2026-11-10, when the founder
   * ruled that credits without a plan unlock the AI only (#1164). A team with
   * no plan is walled or read-only whatever its balance, and uses UrgAns on
   * credits through lib/credits/urgans-admission.ts. */
  /** The wall. (The Free plan replaced it for one day, 2026-11-08 to
   *  2026-11-09, and was then removed outright by the founder.) */
  | 'walled';

export type TeamAccessReason =
  | 'owner_paid'
  | 'owner_allowlisted'
  | 'comped'
  | 'trial_active'
  | 'trial_grace'
  | 'trial_expired'
  /** Paid before, lapsed since. The read-only state. */
  | 'payment_failed'
  /** The owner cancelled the trial, and the trial is over. Also read-only
   *  (founder call, 2026-10-14), so what they built stays readable. */
  | 'trial_cancelled'
  /** trial_ends_at was never stamped. Fails OPEN — see resolveTeamAccess. */
  | 'no_trial_stamp'
  /** The owner's paid period ended, and the team is inside the bonus days it
   *  holds on top of it (the share reward). Paid access, not a trial. */
  | 'share_bonus';

export type TeamAccessResolution = {
  state: TeamAccessState;
  hasAccess: boolean;
  /** Whether writes are allowed. Equal to hasAccess for every state EXCEPT
   *  'read_only', which is the whole reason this is a separate axis: a
   *  read-only team must not draw the wall (hasAccess true) and must not be
   *  able to change anything (canWrite false). */
  canWrite: boolean;
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
 * When a team's bonus days run out: the owner's paid-through date plus
 * `bonusDays`. Null when there are no bonus days or no paid-through date.
 *
 * RELATIVE ON PURPOSE. The bonus is stored as a number of days, not a date,
 * so it always sits on the END of whatever the owner has paid for. A Paystack
 * renewal advances subscriptions.expires_at from its current value, so a date
 * computed at claim time would be overtaken by the next renewal and the month
 * silently lost; days counted from the live paid-through date are not.
 */
export function paidBonusEndsAt(
  ownerPaidThrough: string | null | undefined,
  bonusDays: number | null | undefined
): Date | null {
  const days = Math.max(0, Math.floor(Number(bonusDays) || 0));
  if (days === 0 || !ownerPaidThrough) return null;
  const throughMs = Date.parse(ownerPaidThrough);
  if (!Number.isFinite(throughMs)) return null;
  return new Date(throughMs + days * DAY_MS);
}

/**
 * Did this team's access lapse from a PAYMENT rather than from a trial?
 *
 * This is the whole discriminator behind read-only mode, and the founder's line
 * is exactly one sentence: payment failure gets read-only, trial expiry keeps
 * the wall.
 *
 * `profiles.paid_at` is the only unambiguous "real money landed" marker in this
 * schema. It is written by exactly the two webhook paths where a charge
 * succeeded (the first credit and each renewal) and DELIBERATELY WITHHELD by the
 * card-verification path, whose own comment says so: "NOT is_subscribed /
 * paid_at: nothing has been bought yet". So a lapsed trial has no paid_at and
 * keeps the wall, whether it was a plain 28-day trial or a card-backed one that
 * never converted. (A trial the owner CANCELLED through the cancel flow is
 * read-only since 2026-10-14, but through workspaces.trial_cancelled_at in
 * resolveTeamAccess, never through this predicate.)
 *
 * DO NOT widen this to a status check. `subscriptions.status = 'cancelled'` is
 * worn by a cancelled card-trial that never paid a penny, so reading the status
 * string would hand read-only to exactly the teams the founder decided keep the
 * wall. Money, not status.
 *
 * Takes primitives rather than a SubscriptionSnapshot on purpose: this module is
 * imported by client components, and importing lib/subscription-access.ts would
 * drag @supabase/supabase-js into every bundle that only wanted a feature flag.
 */
export function lapsedFromPayment(input: {
  /** The owner's snapshot hasAccess. Only a team with NO access can be
   *  read-only, so this is a guard rather than a nicety. */
  ownerHasAccess: boolean;
  /** profiles.paid_at for the team OWNER. */
  ownerPaidAt: string | null;
}): boolean {
  if (input.ownerHasAccess) return false;
  return Boolean(input.ownerPaidAt);
}

/**
 * Resolve ONE team's access.
 *
 * Precedence — owner-paid, then comped, then trial, then read-only, then the
 * wall. Paid outranks comped so a team that starts paying reads as 'paid' even
 * if an old comp was never cleared; comped outranks trial so comping a lapsed
 * team works without touching its dates.
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
 * covers everything older. Note this sits ABOVE the read-only branch
 * deliberately: fail-open is strictly more generous than read-only, so an
 * unstamped team that also lapsed from payment gets full access rather than
 * read-only, which is the right direction to be wrong.
 *
 * READ-ONLY replaces the final wall, and only for a team that has actually paid
 * us (see lapsedFromPayment). Every state above it is unaffected, so turning
 * this on cannot take anything away from anyone.
 */
export function resolveTeamAccess(input: {
  ownerHasAccess: boolean;
  ownerAllowlisted?: boolean;
  /** True when this team paid before and their paid period has lapsed. The
   *  caller computes it with lapsedFromPayment. Absent means "no", which is
   *  what keeps every pre-existing caller behaving exactly as it did. */
  ownerLapsedFromPayment?: boolean;
  team: WorkspaceBillingFields;
  now?: Date;
  /** Server passes TEAM_TRIAL_EXPIRY_GRACE_MS; clients pass 0 (or omit). */
  graceMs?: number;
  /** The owner's paid-through date (their snapshot's expiresAt). Only read
   *  when the team holds bonus days; see paidBonusEndsAt. */
  ownerPaidThrough?: string | null;
}): TeamAccessResolution {
  const now = input.now ?? new Date();
  const graceMs = Math.max(0, input.graceMs ?? 0);
  const trialEndsAt = input.team.trialEndsAt;
  const trialDaysLeft = computeTeamTrialDaysLeft(trialEndsAt, now);

  if (input.ownerAllowlisted) {
    return {
      state: 'paid',
      hasAccess: true,
      canWrite: true,
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
      canWrite: true,
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
      canWrite: true,
      reason: 'comped',
      trialEndsAt,
      trialDaysLeft,
      inGrace: false,
    };
  }

  // The share reward's month for a paying team: the days straight after the
  // owner's paid period are still paid access. Below comped (a comp needs no
  // bonus) and above the trial checks, so it reads as paid, keeping the owner's
  // tier, rather than as a trial.
  const bonusEnds = paidBonusEndsAt(input.ownerPaidThrough, input.team.paidBonusDays);
  if (bonusEnds && now.getTime() < bonusEnds.getTime()) {
    return {
      state: 'paid',
      hasAccess: true,
      canWrite: true,
      reason: 'share_bonus',
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
      canWrite: true,
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
      canWrite: true,
      reason: 'trial_active',
      trialEndsAt,
      trialDaysLeft,
      inGrace: false,
    };
  }

  // A zero-length trial (a new team since 2026-10-31, pay first) gets no
  // grace: there is no work in flight to protect, and with grace the team
  // would get 15 free minutes and skip the plan wall.
  const startedMs = input.team.trialStartedAt ? Date.parse(input.team.trialStartedAt) : Number.NaN;
  const hadTrial = !Number.isFinite(startedMs) || endsMs - startedMs > 60_000;
  if (graceMs > 0 && hadTrial && nowMs < endsMs + graceMs) {
    return {
      state: 'grace',
      hasAccess: true,
      canWrite: true,
      reason: 'trial_grace',
      trialEndsAt,
      trialDaysLeft: 0,
      inGrace: true,
    };
  }

  // Credits do not open the app (founder, 2026-11-10, #1164). Until then a
  // team here with bought or monthly credits got the whole app with Solo
  // features; now credits without a plan pay for UrgAns only.

  if (input.ownerLapsedFromPayment) {
    return {
      state: 'read_only',
      hasAccess: true,
      canWrite: false,
      reason: 'payment_failed',
      trialEndsAt,
      trialDaysLeft: 0,
      inGrace: false,
    };
  }

  // A cancelled trial is read-only rather than walled (founder call,
  // 2026-10-14). Below the paid lapse so a team that both paid and cancelled
  // keeps the payment reason, and below credits for the same reason as above.
  //
  // The Free plan (2026-11-08) sat here for one day, putting every never-paid
  // team on Free instead of at the wall. The founder removed it outright on
  // 2026-11-09, so this is the pre-Free behaviour again.
  if (input.team.trialCancelledAt) {
    return {
      state: 'read_only',
      hasAccess: true,
      canWrite: false,
      reason: 'trial_cancelled',
      trialEndsAt,
      trialDaysLeft: 0,
      inGrace: false,
    };
  }

  return {
    state: 'walled',
    hasAccess: false,
    canWrite: false,
    reason: 'trial_expired',
    trialEndsAt,
    trialDaysLeft: 0,
    inGrace: false,
  };
}

/** Does this state grant reads? Everything except the wall. */
const grantsRead = (state: TeamAccessState): boolean => state !== 'walled';

/** Does this state grant writes? Everything except the wall and read-only. */
const grantsWrite = (state: TeamAccessState): boolean =>
  state !== 'walled' && state !== 'read_only';

/**
 * The combination algorithm, once, parameterized by what counts as a grant.
 *
 * Running it twice — once for reads, once for writes — is what makes read-only
 * fall out of the multi-team rules correctly rather than needing a second set of
 * rules that could drift from the first. See combineTeamAccess for the rules
 * themselves.
 */
function combineWith(
  own: { state: TeamAccessState } | null,
  foreign: Array<{ state: TeamAccessState }>,
  ownReleaseCount: number | null,
  grants: (state: TeamAccessState) => boolean
): { granted: boolean; needsOwnReleaseCount: boolean } {
  if (!own && foreign.length === 0) {
    return { granted: true, needsOwnReleaseCount: false };
  }

  if (foreign.some((team) => grants(team.state))) {
    return { granted: true, needsOwnReleaseCount: false };
  }

  if (own && grants(own.state)) {
    if (foreign.length === 0) {
      return { granted: true, needsOwnReleaseCount: false };
    }
    if (ownReleaseCount === null) {
      return { granted: false, needsOwnReleaseCount: true };
    }
    return { granted: ownReleaseCount > 0, needsOwnReleaseCount: false };
  }

  return { granted: false, needsOwnReleaseCount: false };
}

/**
 * Combine every team a person belongs to into one answer.
 *
 * The problem this solves: `loadWorkspaceAccessContext` provisions a workspace
 * for EVERY non-curator account on first load, so an invited teammate owns an
 * empty shell alongside the real team they were invited into. That shell gets
 * its own 3-day trial. Without care, a teammate whose team is walled would
 * keep working on their shell's trial, and the wall would never apply to
 * anyone who had ever been invited.
 *
 * Rules, in order:
 *   1. No teams at all -> ACCESS. The gate runs before route-level
 *      provisioning, so a brand-new account's very first request has no rows
 *      yet. Failing closed here would deadlock first load.
 *   2. Any team the person does NOT own grants -> ACCESS. This is the
 *      inheritance the whole feature exists for.
 *   3. Their own team grants -> ACCESS only if it is plausibly their real
 *      team: either they belong to no foreign teams at all, or they have at
 *      least one release of their own. This mirrors the primary-workspace
 *      exception in resolveWorkspaceAccessContext, which treats an owned
 *      workspace with zero releases as the empty shell it is.
 *   4. Otherwise -> WALLED.
 *
 * READS AND WRITES RUN THE SAME RULES, with a different definition of "grants"
 * (grantsRead / grantsWrite above). That is what makes read-only compose: a
 * teammate of a read-only team reads through it and cannot write through their
 * own empty trial shell either, because rule 3 still refuses a shell with no
 * releases.
 *
 * `ownReleaseCount: null` means "not fetched". The caller only pays for that
 * count in rule 3's ambiguous branch, signalled by `needsOwnReleaseCount`.
 */
export function combineTeamAccess(input: {
  own: { state: TeamAccessState } | null;
  foreign: Array<{ state: TeamAccessState }>;
  ownReleaseCount: number | null;
}): { hasAccess: boolean; canWrite: boolean; needsOwnReleaseCount: boolean } {
  const foreign = input.foreign ?? [];
  const read = combineWith(input.own, foreign, input.ownReleaseCount, grantsRead);
  const write = combineWith(input.own, foreign, input.ownReleaseCount, grantsWrite);

  return {
    hasAccess: read.granted,
    // Write requires read. The predicates already guarantee that, so this is
    // belt-and-braces: no future edit to either of them should be able to
    // produce a team that can write but not read.
    canWrite: read.granted && write.granted,
    needsOwnReleaseCount: read.needsOwnReleaseCount || write.needsOwnReleaseCount,
  };
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
// Read-only mode (payment failure)
// ---------------------------------------------------------------------------

/** Methods a read-only team may still use.
 *
 * OPTIONS is included because a CORS preflight is not a write and refusing it
 * would break the request that follows rather than refuse it honestly. An
 * ABSENT or unrecognised method counts as a write: every route-level caller
 * that cannot name its method is a mutation route.
 *
 * The imprecision runs in both directions and both are accepted, deliberately:
 *   - A GET that writes still writes. Lazy workspace provisioning, the
 *     `metadata_viewed` stamp, the default task-group insert and the
 *     opportunistic notification flush all happen on GETs. That is a
 *     REQUIREMENT, not a leak: gating provisioning would stop a first page load
 *     resolving at all, and the metadata read fails hard if its insert fails.
 *   - A handful of non-GET pure reads are over-refused: the genre-prediction
 *     proxy and the AI status generator both only read. Harmless, because the
 *     PATCH that would save either result is refused anyway, and consistent
 *     with UrgAns being unavailable in read-only mode.
 */
const READ_ONLY_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isReadOnlySafeMethod(method: string | null | undefined): boolean {
  return READ_ONLY_SAFE_METHODS.has(String(method ?? '').trim().toUpperCase());
}

/**
 * The status a read-only write refusal carries. 403, and it MUST NOT be 402.
 *
 * apps/web/lib/access-redirect.ts monkey-patches window.fetch and redirects the
 * browser to /locked on ANY same-origin 402, so a 402 here would eject a
 * read-only team from the app on their first blocked save — which is exactly the
 * wall this mode replaces. 403 is inert to that interceptor and is the honest
 * code anyway: authenticated, understood, refused, and retrying will not help.
 *
 * It also matches the precedent already in the codebase:
 * buildReadOnlyResponse in lib/tasks-server.ts refuses a guest's write with a
 * flat { error } at 403, and every mutation surface already renders that string.
 */
export const READ_ONLY_REFUSAL_STATUS = 403;

/** Machine-readable marker on the refusal body, for a caller that wants to
 *  branch rather than just show the message. */
export const READ_ONLY_REFUSAL_CODE = 'READ_ONLY';

/** Where a read-only team goes to fix it. The `intent` is load-bearing: /locked
 *  bounces anyone who HAS access straight back into the app, and a read-only
 *  team has access, so a bare /locked link is a dead end. */
export const READ_ONLY_REACTIVATE_HREF = '/locked?intent=reactivate';

/** What a blocked write says. No guilt, no countdown, and no threat of losing
 *  anything, because nothing is being taken away: reads still work and nothing
 *  is deleted. Split by whether this person can actually act on it. */
export const READ_ONLY_REFUSAL_MESSAGE = {
  owner:
    'Your plan ended, so the app is read only for now. Update your payment to start working again.',
  member:
    'Your plan ended, so the app is read only for now. Your team admin can update the payment.',
} as const;

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
