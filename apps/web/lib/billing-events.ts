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
  /** A team's 3 days began (workspace provisioned, or the backfill). */
  'trial_started',
  /** An admin added days. */
  'trial_extended',
  /** The cancel flow (2026-10-14, lib/cancel-flow.ts). The owner took the
   *  "10% off" offer: 3 days on the trial or as paid bonus days. Once per team. */
  'cancel_discount_taken',
  /** The cancel flow: a trial team invited one more teammate for 7 more days. */
  'trial_invite_extension',
  /** The cancel flow: the owner paused the plan. Metadata carries the window. */
  'subscription_paused',
  /** The cancel flow: a cancel or pause was undone while the period still ran. */
  'subscription_resumed',
  /** The cancel flow: the owner took a budget-band price for 3 months. A
   *  Paystack swap is owed by hand before the next renewal (the plan-change
   *  precedent), so this also emails the founder. */
  'retention_offer_accepted',
  /** A team's first payment on a plan with "Distribution included" (pricing
   *  v3, 2026-10-22). An ACTION: register the team on TRM by hand, since TRM's
   *  API has no account creation. Written once, when trm_registered_at is set. */
  'trm_registration_needed',
  /** The cancel flow: the owner cancelled (trial or paid). Metadata carries
   *  the reason they picked, if any. */
  'subscription_cancelled',
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
  /** An owner asked, from the iPhone app, to be emailed the link to pay on the web. */
  'pay_link_emailed',
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
  /** A team bought UrgAns credits (lib/credits/purchase-server.ts). Metadata
   *  carries the price, the credits and the Paystack reference. For founder
   *  visibility only: the credits themselves are a `topup` row in the ledger. */
  'credits_purchased',
  /** A team paid ₦2,100 for one release beyond its plan's distribution
   *  allowance (lib/distribution-limits-server.ts). Metadata carries the
   *  reference and the release. */
  'distribution_extra_paid',
  /** Add-ons (lib/addons-server.ts, #1112): the first period paid, a renewal
   *  charged, a renewal that failed, an add-on removed. */
  'addon_paid',
  'addon_renewed',
  'addon_renewal_failed',
  'addon_cancelled',
  /** Credits past the allowance (lib/credits/overage-server.ts, #1112): a
   *  window's credits charged to the card, or the charge failing. The cap
   *  being reached is a limit_hit with entitlement 'urgans_credit_cap'. */
  'credit_overage_charged',
  'credit_overage_failed',
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
  /** A manager looked for somebody who does a particular job, and whether the
   *  directory had one. `metadata` carries the role, a matched yes/no and
   *  whether it came from the search box or the role gaps panel — and NOTHING
   *  else, because the search box takes a person's name and a private search
   *  must never reach a durable row (lib/directory-demand.ts).
   *
   *  Ledger rather than analytics-only for the reason `limit_hit` is: the rows
   *  where matched is false ARE the recruiting list, which is the one question
   *  a cold-start marketplace has to answer every week. Deduped to one row per
   *  team per role per UTC day, so a manager comparing two designers produces
   *  one row and not a dozen. Read back by /admin/directory. */
  'directory_role_wanted',
  /** One voice clip was transcribed for UrgAns (NEXT_PUBLIC_FEATURE_URGANS_VOICE).
   *  Deliberately NOT 'urgans_action': speaking is not metered against the
   *  monthly chat ceiling — only the send that follows is, exactly as typing
   *  is. This row exists to enforce a per-team daily transcription cap
   *  (VOICE_DAILY_CAP) as an abuse guard, nothing more. */
  'urgans_voice_transcription',
  /** Bring your notes (2026-10-26): one batch of cards sorted by UrgAns, and one photo read. Daily caps only; nothing is charged yet. */
  'notes_import_sort',
  'notes_import_photo',
  /** Curator pitch payments (2026-09-25): the moments that need the founder.
   *  Mostly about a CURATOR, who may have no team, which is why these rows can
   *  carry a null workspace_id. Each one also emails BILLING_ALERTS_EMAIL — see
   *  alertFounderPitchPayments in lib/pitch-payments-server.ts. */
  /** A curator's bank account name did not match their profile, so it waits
   *  for a human before any money is routed to it. */
  'payout_needs_review',
  /** A paid checkout did not match its quote, or paid for pitches that were no
   *  longer waiting. No pitch was sent. */
  'pitch_payment_needs_review',
  /** A missed-window refund could not be made. The artist is still owed. */
  'pitch_refund_failed',
  /** The daily Paystack reconcile found a gap. */
  'pitch_reconcile_mismatch',
  /** A checkout took more recovery off a curator share than they still owed. */
  'pitch_recovery_unmatched',
  /** A curator reached the strike limit and their inbox is paused. */
  'curator_inbox_paused',
  /** Someone opened the distribution partner's sign-up from a rollout's
   *  Distribute step. `metadata` carries the release id. The founder compares
   *  the count with the partner's monthly statement. */
  'distribution_handoff',
  /** Send to TRM (URG-392). `metadata` carries the release id. Interest: a
   *  team pressed Send while sending is still gated to the test account.
   *  Started: the draft was created at TRM. Submitted / rejected / published:
   *  the real deliveries the founder reports on. */
  'trm_send_interest',
  'trm_send_started',
  'trm_submitted',
  'trm_rejected',
  'trm_published',
  /** A team was tagged to a referral partner, by their signup link or by hand.
   *  `metadata` carries the partner id, the code as entered and which of the two
   *  it was. The tag itself is team_referrals; this is the audit trail. */
  'referral_attached',
  /** Self-serve checkout (2026-10-22): a transfer period paid in full through
   *  Paystack, money an admin recorded as paid straight to our bank, and the
   *  founder's setup minutes for a team. */
  'transfer_paid',
  'transfer_recorded',
  'founder_minutes_set',
  /** Planner v2 (2026-10-26): the AI gateway wallet (ours, not the team's)
   *  ran dry and a plan fell back to the quick plan. Founder emailed at most
   *  once a day across all teams (lib/ai/wallet-alert-server.ts). */
  'ai_wallet_empty',
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
