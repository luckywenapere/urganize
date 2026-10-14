// Billing-alert copy and types. Pure and React-free, so lib/billing-alerts-server.ts
// can import the types and subject builder without pulling react-email into a
// server module. Moved verbatim from lib/billing-alert-templates.ts.

/** The moments the founder is emailed about. A subset of the billing event
 * union: the rest are logged to the ledger without interrupting anyone. */
export type FounderAlertKind =
  | 'trial_ending_soon'
  | 'paywall_hit'
  | 'paywall_return_visit'
  | 'talk_to_us_clicked'
  | 'checkout_completed'
  | 'manually_marked_paid'
  /** A team agreed a plan change and a Paystack swap is now owed. An ACTION for
   *  the founder: Paystack has no plan-change endpoint, so the old subscription
   *  has to be disabled and a replacement created by hand before the next charge.
   *  The note carries the deadline. */
  | 'plan_change_requested'
  /** A renewal charge failed while the team still has access. An ACTION: reach
   *  the customer before the period lapses, after which they drop to read-only. */
  | 'payment_failed'
  /** A team hit the daily cap on UrgAns actions run inside a product function.
   *  At most one per team per 24h so a busy team cannot spam the inbox. */
  | 'urgans_guard_tripped'
  /** The cancel flow (2026-10-14): a team cancelled. FYI, with the reason. */
  | 'subscription_cancelled'
  /** The cancel flow: a team paused instead of cancelling. FYI. */
  | 'subscription_paused'
  /** The cancel flow: a team took a 3-month budget price. An ACTION: swap their
   *  Paystack subscription onto the retention Plan named in the note before the
   *  next renewal, and back to full price after 3 months. */
  | 'retention_offer_accepted';

export type FounderAlertContext = {
  teamName: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  /** How long since the owner's account was created. */
  daysSinceSignup: number | null;
  /** Releases the team created during the trial — a proxy for investment. */
  releasesDuringTrial: number | null;
  /** Tasks likewise. A team with 60 tasks has built something worth keeping. */
  tasksDuringTrial: number | null;
  /** Which plan was on screen when this happened, when relevant. */
  planViewed?: string | null;
  /** Trial end, for the ending-soon alert. */
  trialEndsAt?: string | null;
  /** Free-form extra line (an admin note, an amount). */
  note?: string | null;
};

/** Subject prefixes, written to be actionable at a glance in a phone
 *  notification: what happened, then who. */
const SUBJECT_PREFIX: Record<FounderAlertKind, string> = {
  trial_ending_soon: 'Trial ending',
  paywall_hit: 'Hit the wall',
  paywall_return_visit: 'Came back to the wall',
  talk_to_us_clicked: 'Wants to talk',
  checkout_completed: 'PAID',
  manually_marked_paid: 'Marked paid',
  plan_change_requested: 'SWAP NEEDED',
  payment_failed: 'CARD FAILED',
  urgans_guard_tripped: 'UrgAns usage cap',
  subscription_cancelled: 'Cancelled',
  subscription_paused: 'Paused',
  retention_offer_accepted: 'SWAP NEEDED (retention price)',
};

export const FOUNDER_ALERT_HEADLINE: Record<FounderAlertKind, string> = {
  trial_ending_soon: 'This team is in the last days of its trial.',
  paywall_hit: 'This team just hit the wall for the first time.',
  paywall_return_visit: 'This team came back and looked at the wall again.',
  talk_to_us_clicked: 'This team asked to talk to you.',
  checkout_completed: 'This team just paid.',
  manually_marked_paid: 'This team was marked paid by hand.',
  plan_change_requested:
    'This team changed plan. Their Paystack subscription still needs swapping by hand.',
  payment_failed:
    'A renewal charge failed for this team. They still have access while Paystack retries, and they drop to read only if the period ends unpaid.',
  urgans_guard_tripped:
    'This team hit the daily cap on UrgAns actions run inside the product. If this is real usage, raise the cap. If it does not look right, take a look.',
  subscription_cancelled:
    'This team cancelled. Their access runs to the end of what they paid for (or their trial), then the app is read only for them.',
  subscription_paused:
    'This team paused their plan instead of cancelling. Nothing is charged while paused; they come back with a normal checkout.',
  retention_offer_accepted:
    'This team took a lower price to stay. Their Paystack subscription needs moving to the retention Plan in the note by hand before the next renewal, and back to full price after 3 months.',
};

const formatCount = (value: number | null): string => (value === null ? 'unknown' : String(value));

const formatDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(ms)
  );
};

export function founderBillingAlertSubject(
  kind: FounderAlertKind,
  context: FounderAlertContext
): string {
  const team = context.teamName?.trim() || 'Unnamed team';
  return `${SUBJECT_PREFIX[kind]}: ${team}`;
}

/** The label/value rows the founder alert prints. Built here (pure) so both the
 *  React template and any test read the same list. */
export function buildFounderAlertFacts(context: FounderAlertContext): Array<[string, string]> {
  const team = context.teamName?.trim() || 'Unnamed team';
  const owner = context.ownerName?.trim() || 'Unknown owner';
  const ownerEmail = context.ownerEmail?.trim() || 'no email on file';

  const facts: Array<[string, string]> = [
    ['Team', team],
    ['Owner', owner],
    ['Contact', ownerEmail],
    ['Days since signup', formatCount(context.daysSinceSignup)],
    ['Rollouts in trial', formatCount(context.releasesDuringTrial)],
    ['Tasks in trial', formatCount(context.tasksDuringTrial)],
  ];

  if (context.planViewed) facts.push(['Plan viewed', context.planViewed]);
  const trialEnd = formatDate(context.trialEndsAt);
  if (trialEnd) facts.push(['Trial ends', trialEnd]);
  if (context.note) facts.push(['Note', context.note]);

  return facts;
}
