// Billing/conversion events (NEXT_PUBLIC_FEATURE_HARD_PAYWALL) — pure logic.
//
// Two jobs. The event names below are the conversion funnel the founder reads
// (trial started -> wall hit -> talked to us -> paid), and the same rows are the
// dedupe ledger the notification paths check so nobody is emailed twice for one
// moment and no teammate can spam an owner. The table is billing_events; the
// I/O half is lib/billing-events-server.ts.
//
// Everything here is pure so the decisions are unit-testable without a
// database: whether a wall view is a first hit or a return visit, whether a
// notify-admin click is allowed, and whose subscription a team checkout should
// credit.

/** Every billing moment worth recording. `type` is free text in the schema (a
 * new moment needs no migration), but this union is what the app writes and
 * what the admin panel and dedupe checks read. */
export const BILLING_EVENT_TYPES = [
  /** A team's 14 days began (workspace provisioned, or the backfill). */
  'trial_started',
  /** An admin added days. */
  'trial_extended',
  /** The daily sweep saw a team enter its last 3 days. */
  'trial_ending_soon',
  /** Someone on this team saw the wall for the first time. */
  'paywall_hit',
  /** A walled team came back and looked again — renewed interest. */
  'paywall_return_visit',
  /** They chose the invoice/walkthrough path instead of card checkout. */
  'talk_to_us_clicked',
  /** A non-owner asked their admin to activate the plan. */
  'notify_admin_sent',
  /** Checkout was initialized (they reached Paystack). */
  'checkout_started',
  /** Payment landed and access was granted. */
  'checkout_completed',
  'comped',
  'uncomped',
  'founding_assigned',
  'custom_price_set',
  /** Settled outside checkout: invoice, bank transfer, an agreement. */
  'manually_marked_paid',
  /** A team moved between plans. Carries the direction, both plans and any
   *  prorated amount charged, and is the ledger record behind the founder's
   *  "swap needed" alert — Paystack has no plan-change endpoint, so every one of
   *  these owes a manual subscription swap before the next charge. */
  'plan_change_requested',
  /** One assistant turn that reached the model. Counted per BILLING WINDOW to
   *  enforce urgans_monthly_actions — see lib/urgans-usage.ts. Deliberately one
   *  row per turn rather than per gateway round (a turn is up to five), and
   *  never logged for a confirmation replay or a deterministic-mode call. */
  'urgans_action',
  /** A renewal charge failed. Recorded from the Paystack invoice.payment_failed
   *  webhook, while Paystack is still retrying and the team STILL HAS ACCESS
   *  (the snapshot treats past_due inside its period as paid) — which is what
   *  makes this the one billing moment where a save is cheap. If the retries all
   *  fail and the period lapses, that team lands in read-only rather than at the
   *  wall: see lapsedFromPayment in lib/team-billing.ts. */
  'payment_failed',
  /** A team ran into a plan ceiling. `metadata` carries the entitlement key,
   *  the limit and the count, which is what makes this the upgrade signal the
   *  pricing spec asks to be tracked "by entitlement key". Frequent seat and
   *  release blocks on Manager are the clearest buy signal we get. */
  'limit_hit',
  /** One MCP tool call from a customer's own LLM client. Recorded for founder
   *  visibility only — DELIBERATELY NOT metered against urgans_monthly_actions.
   *  That ceiling exists because an UrgAns turn costs us gateway tokens; over
   *  MCP the user's own model does the thinking and we pay for nothing but a
   *  database read, so charging an action against their allowance would bill
   *  them for a cost we do not incur. This is also the only usage signal that
   *  exists for the MCP surface, which has no rate limit — see the known gap in
   *  CLAUDE.md. */
  'mcp_tool_call',
  /** One UrgAns embedded-action run (draft/apply/discard inside a product
   *  function — see lib/urgans-actions/). DELIBERATELY a different string
   *  from 'urgans_action': that one feeds the 40/150 monthly chat ceiling in
   *  lib/urgans-usage.ts, and an embedded action must never count against it —
   *  they are gated on plan tier instead (urgans_embedded_actions), not
   *  metered by volume. lib/urgans-actions/registry-guard.test.ts scans the
   *  source of every action route for the literal string 'urgans_action' and
   *  fails the build if it appears, so this split cannot regress silently. */
  'urgans_embedded_action',
  /** A team hit the daily embedded-actions cap (EMBEDDED_ACTIONS_DAILY_CAP in
   *  lib/urgans-actions/guard.ts). Drives a founder alert, at most one per
   *  team per 24h — see shouldAlertGuardTrip. */
  'urgans_guard_tripped',
  /** A Solo team's caller was shown the "upgrade to draft this" sheet after an
   *  entitlement check refused an embedded-action run. The upgrade funnel's
   *  first moment, mirroring paywall_hit's role in the trial funnel above. */
  'upgrade_prompt_shown',
  /** They tapped Upgrade on that sheet. A softer signal than
   *  plan_change_requested (which records an actual purchase decision), so
   *  this is ledger-only — no founder alert. */
  'upgrade_clicked',
] as const;

export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

export function isBillingEventType(value: unknown): value is BillingEventType {
  return (
    typeof value === 'string' &&
    (BILLING_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/** What the wall UI — and, since 2026-09-03, the UrgAns upgrade sheet — is
 * allowed to report. Deliberately NOT the full event union: the client says
 * what happened and the server decides which event that is, so a client
 * cannot forge a `checkout_completed` or a `comped`. */
export type BillingTrackRequest = 'paywall_view' | 'talk_to_us' | 'upgrade_clicked';

export function isBillingTrackRequest(value: unknown): value is BillingTrackRequest {
  return value === 'paywall_view' || value === 'talk_to_us' || value === 'upgrade_clicked';
}

/** Same UTC day? Return visits are deduped per day so one person reloading the
 * wall does not produce a dozen "renewed interest" emails. UTC because the
 * server has no reliable team timezone, and the founder reads these in
 * aggregate rather than to the hour. */
function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** What a wall — or upgrade-sheet — interaction can turn into. A strict subset
 * of the event union, and saying so in the type is what lets the
 * founder-alert path accept a wall result without a cast.
 * 'upgrade_clicked' is handled separately by its caller (logBillingEvent
 * only, no founder alert — a softer signal than a real purchase decision), so
 * it is not read by buildFounderBillingAlertEmail's FounderAlertKind. */
export type TrackOutcome =
  | 'paywall_hit'
  | 'paywall_return_visit'
  | 'talk_to_us_clicked'
  | 'upgrade_clicked';

/**
 * Decide what a wall interaction should be recorded as.
 *
 * 'paywall_view' becomes the FIRST 'paywall_hit' for a team, and every view
 * after that a 'paywall_return_visit' — the distinction the founder cares
 * about, since a team coming back to the wall days later is a live sales
 * signal. Return visits collapse to one per UTC day.
 *
 * 'talk_to_us' and 'upgrade_clicked' always record: a second click means they
 * tried again, which is information, and there is no email storm risk (one
 * click, one intent, and the latter sends no email at all).
 *
 * Returns null when nothing should be written (a same-day repeat view).
 */
export function resolveTrackOutcome(input: {
  requested: BillingTrackRequest;
  hasPriorPaywallHit: boolean;
  lastReturnVisitAt: string | null;
  now?: Date;
}): TrackOutcome | null {
  if (input.requested === 'talk_to_us') return 'talk_to_us_clicked';
  if (input.requested === 'upgrade_clicked') return 'upgrade_clicked';

  if (!input.hasPriorPaywallHit) return 'paywall_hit';

  const now = input.now ?? new Date();
  const lastMs = input.lastReturnVisitAt ? Date.parse(input.lastReturnVisitAt) : Number.NaN;
  if (Number.isFinite(lastMs) && isSameUtcDay(new Date(lastMs), now)) {
    return null;
  }
  return 'paywall_return_visit';
}

/** A teammate may nudge their admin once a day, and a team may produce at most
 * this many nudges a day however many people are on it. Both bounds protect the
 * owner's inbox on a large team without ever refusing the first, real ask. */
export const NOTIFY_ADMIN_PER_ACTOR_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const NOTIFY_ADMIN_MAX_PER_TEAM_PER_DAY = 5;

/**
 * Should this "Notify my admin" click send an email?
 *
 * `alreadySent` is the honest answer for a repeat click by the same person:
 * the UI says "Your admin has been notified" rather than pretending to send
 * again or showing an error, because from their point of view it worked.
 * A team over its daily cap is also reported as alreadySent — the owner has
 * certainly heard by then, and telling the fifth teammate their click failed
 * would be confusing and useless.
 */
export function resolveNotifyAdminDecision(input: {
  lastSameActorSentAt: string | null;
  workspaceSentTodayCount: number;
  now?: Date;
}): { allowed: boolean; alreadySent: boolean } {
  const now = input.now ?? new Date();

  const lastMs = input.lastSameActorSentAt ? Date.parse(input.lastSameActorSentAt) : Number.NaN;
  if (Number.isFinite(lastMs) && now.getTime() - lastMs < NOTIFY_ADMIN_PER_ACTOR_COOLDOWN_MS) {
    return { allowed: false, alreadySent: true };
  }

  if (input.workspaceSentTodayCount >= NOTIFY_ADMIN_MAX_PER_TEAM_PER_DAY) {
    return { allowed: false, alreadySent: true };
  }

  return { allowed: true, alreadySent: false };
}

/**
 * Whose subscription does a team checkout credit?
 *
 * The team's OWNER, always — even when an admin is the one paying. That is what
 * keeps the untouched Paystack webhook correct: it credits
 * `payments.user_id` / `metadata.user_id`, and access is resolved from the
 * owner's snapshot, so crediting the clicking admin instead would take the
 * money and leave the team walled.
 *
 * Members and guests cannot start a team checkout (the wall shows them the
 * notify-admin path instead). With the flag off, or with no workspace context,
 * the requester pays for themselves exactly as before.
 */
export function resolveCheckoutSubject(input: {
  flagOn: boolean;
  requesterId: string;
  workspace: { ownerId: string } | null;
  membershipRole: string | null;
  membershipStatus: string | null;
}): { subjectUserId: string } | { error: string } {
  if (!input.flagOn || !input.workspace) {
    return { subjectUserId: input.requesterId };
  }

  if (input.workspace.ownerId === input.requesterId) {
    return { subjectUserId: input.workspace.ownerId };
  }

  const status = String(input.membershipStatus ?? '').trim().toLowerCase();
  if (status !== 'active') {
    return { error: 'You are not an active member of this team.' };
  }

  const role = String(input.membershipRole ?? '').trim().toLowerCase();
  if (role !== 'owner' && role !== 'admin') {
    return { error: 'Only a team owner or admin can activate the plan.' };
  }

  return { subjectUserId: input.workspace.ownerId };
}
