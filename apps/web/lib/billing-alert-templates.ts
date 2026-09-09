// Email bodies for billing moments. Pure — no I/O, no env, no React.
//
// Two audiences, two very different jobs:
//
//   buildFounderBillingAlertEmail  — INTERNAL. Goes to the founder, and it is
//     a sales lead, not product mail. So it is dense and plain: what happened,
//     which team, who to call, and the numbers that say how invested they are.
//     No branding, no button. It should be readable in a notification preview
//     on a phone, because that is where it will be read.
//
//   buildNotifyAdminEmail — EXTERNAL. A teammate asking their own admin to
//     turn the plan back on. Warm, short, no pressure, and it names the person
//     who asked so it does not read as automated dunning.
//
// Conventions borrowed from lib/email-templates.ts (which is deliberately left
// untouched): inline styles only, no web fonts, escapeHtml on everything the
// user typed. Copy rules for anything a CUSTOMER reads: never the word
// "workspace", no em dashes, no guilt.

export type BuiltEmail = { subject: string; html: string; text: string };

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const BODY_TEXT = '#33403a';
const MUTED_TEXT = '#6b7a72';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The moments the founder is emailed about. A subset of the event union: the
 * rest are logged to the ledger without interrupting anyone. */
export type FounderAlertKind =
  | 'trial_ending_soon'
  | 'paywall_hit'
  | 'paywall_return_visit'
  | 'talk_to_us_clicked'
  | 'checkout_completed'
  | 'manually_marked_paid'
  /** A team agreed a plan change and a Paystack swap is now owed. This one is
   *  an ACTION for the founder rather than a signal: Paystack has no
   *  plan-change endpoint, so the old subscription has to be disabled and a
   *  replacement created by hand, and it has to happen before the next charge
   *  or the team is billed at the wrong price. The note carries the deadline. */
  | 'plan_change_requested'
  /** A renewal charge failed while the team still has access. An ACTION, like
   *  plan_change_requested: reach the customer before the period lapses, because
   *  after that they drop into read-only and the recovery gets much harder. */
  | 'payment_failed'
  /** A team hit EMBEDDED_ACTIONS_DAILY_CAP (lib/urgans-actions/guard.ts) on
   *  UrgAns actions run inside a product function. At most one of these per
   *  team per 24h (shouldAlertGuardTrip) so a busy team cannot spam the inbox
   *  it is telling us about. */
  | 'urgans_guard_tripped';

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

/** Subject lines are written to be actionable at a glance in a phone
 * notification: what happened, then who. */
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
};

const HEADLINE: Record<FounderAlertKind, string> = {
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
};

const formatCount = (value: number | null): string =>
  value === null ? 'unknown' : String(value);

const formatDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(ms));
};

export function buildFounderBillingAlertEmail(
  kind: FounderAlertKind,
  context: FounderAlertContext
): BuiltEmail {
  const team = context.teamName?.trim() || 'Unnamed team';
  const owner = context.ownerName?.trim() || 'Unknown owner';
  const ownerEmail = context.ownerEmail?.trim() || 'no email on file';

  const subject = `${SUBJECT_PREFIX[kind]}: ${team}`;

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

  const text = [HEADLINE[kind], '', ...facts.map(([k, v]) => `${k}: ${v}`)].join('\n');

  const rows = facts
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding:4px 12px 4px 0;color:${MUTED_TEXT};font-size:13px;white-space:nowrap;">${escapeHtml(k)}</td>
          <td style="padding:4px 0;color:${BODY_TEXT};font-size:13px;font-weight:600;">${escapeHtml(v)}</td>
        </tr>`
    )
    .join('');

  const html = `<div style="font-family:${FONT_STACK};color:${BODY_TEXT};font-size:14px;line-height:1.6;">
  <p style="margin:0 0 14px;font-weight:600;">${escapeHtml(HEADLINE[kind])}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}
  </table>
</div>`;

  return { subject, html, text };
}

export type NotifyAdminEmailInput = {
  /** Who is asking — a name when we have one, otherwise their email. */
  requesterLabel: string;
  /** The team, for the subject line. */
  teamName: string | null;
  /** Where the admin goes to activate. */
  activateUrl: string;
};

/**
 * A teammate asking their admin to activate the plan.
 *
 * Warm and factual. It must not read as dunning: the admin is a customer, and
 * the person who triggered it is their colleague, so the email names them and
 * stops. No urgency copy, no consequences.
 */
export function buildNotifyAdminEmail(input: NotifyAdminEmailInput): BuiltEmail {
  const requester = input.requesterLabel.trim() || 'A teammate';
  const team = input.teamName?.trim() || null;

  const subject = team
    ? `${requester} is waiting on ${team} in Urganize`
    : `${requester} is waiting on your team in Urganize`;

  const line = team
    ? `${requester} tried to pick up work on ${team} and needs the plan activated.`
    : `${requester} tried to pick up work and needs the plan activated.`;

  const text = [
    'Hi,',
    '',
    line,
    '',
    'You can activate it here:',
    input.activateUrl,
    '',
    'Everything your team created is still there and nothing has been removed.',
  ].join('\n');

  const html = `<div style="font-family:${FONT_STACK};color:${BODY_TEXT};font-size:15px;line-height:1.65;">
  <p style="margin:0 0 14px;">Hi,</p>
  <p style="margin:0 0 14px;">${escapeHtml(line)}</p>
  <p style="margin:0 0 14px;"><a href="${escapeHtml(input.activateUrl)}" style="color:#1f7a4d;font-weight:600;">Activate the plan</a></p>
  <p style="margin:0;color:${MUTED_TEXT};font-size:13px;">Everything your team created is still there and nothing has been removed.</p>
</div>`;

  return { subject, html, text };
}
