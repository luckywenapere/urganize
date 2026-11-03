import { isAllowedSender, type AllowedSender, type EmailConfig } from './config';
import { composeFromHeader } from './headers';
import type { EmailTemplateId } from './templates/props';

// Template metadata — React-free, so the admin dashboard, callers and the
// orchestrator all read it cheaply. The category lives HERE, not at the call
// site, so no caller can quietly mark a marketing email as essential (or the
// reverse). It also drives the unsubscribe gate (PR 2).

export type EmailCategory =
  /** Directly triggered by something the recipient or a teammate did. Always
   *  sends; no unsubscribe. */
  | 'transactional'
  /** Welcome + the getting-started sequence. Unsubscribable. */
  | 'onboarding'
  /** Release date reminders. Unsubscribable. */
  | 'reminders'
  /** Dashboard broadcasts. Unsubscribable. */
  | 'announcements'
  /** Being tagged in a rollout's chat. Unsubscribable, on its own, so turning
   *  it off never silences anything else (founder call, 2026-10-07). */
  | 'chat'
  /** The claim email Urganize sends on its own to a credited collaborator, and
   *  its one reminder (2026-10-11). They never signed up, so it is
   *  unsubscribable, on its own. The owner's own "Email" stays transactional. */
  | 'claim'
  /** Founder-only operational mail. Never sent to a customer; no unsubscribe. */
  | 'internal';

export type EmailTemplateMeta = {
  id: EmailTemplateId;
  category: EmailCategory;
  /** Human label for the admin dashboard. */
  name: string;
  description: string;
  /** True while the copy is still placeholder and must be replaced before this
   *  is sent to real people (PR 2/3 enforce it). All eight migrated templates
   *  are false: their copy is the approved, shipped wording. */
  placeholderCopy: boolean;
  /** The display name on the From header, e.g. "Urganize Billing". A per-send
   *  fromLabel ("Oyin via Urganize") still replaces it for that one message. */
  fromName?: string;
  /** Send from this address. Must be in SENDER_ALLOWLIST; an address that is
   *  not falls back to EMAIL_FROM. Unset uses DEFAULT_TEMPLATE_SENDER. */
  fromAddress?: AllowedSender;
  /** Where replies go. null omits the Reply-To header (founder alerts); unset
   *  uses DEFAULT_TEMPLATE_SENDER's. A per-send replyTo still wins. */
  replyTo?: AllowedSender | null;
};

/** Per-template senders (founder-approved mapping, 2026-10-16). Every address is
 *  on the ROOT domain urganize.app, which is verified in Resend (production had
 *  been sending from lucky@urganize.app). A template without its own sender
 *  goes out from notifications@ with replies to support@. */
export const DEFAULT_TEMPLATE_SENDER = {
  fromName: 'Urganize',
  fromAddress: 'notifications@urganize.app',
  replyTo: 'support@urganize.app',
} as const satisfies { fromName: string; fromAddress: AllowedSender; replyTo: AllowedSender };

export const EMAIL_TEMPLATES: Record<EmailTemplateId, EmailTemplateMeta> = {
  welcome: {
    id: 'welcome',
    category: 'onboarding',
    name: 'Welcome',
    description: 'The founder-note welcome, sent once when a self-signup finishes onboarding.',
    placeholderCopy: false,
    fromName: 'Oyin at Urganize',
    fromAddress: 'wenapere@urganize.app',
    replyTo: 'wenapere@urganize.app',
  },
  workspace_invite: {
    id: 'workspace_invite',
    category: 'transactional',
    name: 'Team invite',
    description: 'Sent when someone is invited to a team, carrying the single-use accept link.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  credit_submission: {
    id: 'credit_submission',
    category: 'transactional',
    name: 'Credits submitted',
    description: 'Tells the release owner a collaborator submitted their credits.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  task_assigned: {
    id: 'task_assigned',
    category: 'transactional',
    name: 'Activity assigned',
    description: 'Tells someone an activity was assigned to them.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  work_request: {
    id: 'work_request',
    category: 'transactional',
    name: 'Directory request',
    description: 'Tells a directory member someone is asking them to work on a release.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  claim_invite: {
    id: 'claim_invite',
    category: 'transactional',
    name: 'Claim your page',
    description: 'Sent when a rollout owner invites a credited collaborator to claim their unclaimed profile.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  claim_code: {
    id: 'claim_code',
    category: 'transactional',
    name: 'Claim code',
    description: 'The six-digit code that proves a claim, sent to the email already on the credit (URG-305).',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'verify@urganize.app',
    replyTo: 'support@urganize.app',
  },
  claim_auto_invite: {
    id: 'claim_auto_invite',
    category: 'claim',
    name: 'Your page is ready',
    description:
      'Sent once, on its own, to a credited collaborator with an unclaimed page when the rollout has come out. Behind NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL. Copy in lib/claim-email-copy.ts.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  claim_reminder: {
    id: 'claim_reminder',
    category: 'claim',
    name: 'Your page is still waiting',
    description:
      'The one reminder, 7 days after the automatic claim email, if the page is still unclaimed and nobody sent a newer link. Copy in lib/claim-email-copy.ts.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  directory_invite: {
    id: 'directory_invite',
    category: 'transactional',
    name: 'Directory invite',
    description:
      'Sent when a manager invites someone they work with into the Directory and types their email. Carries the /welcome link to their private profile.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  work_request_answer: {
    id: 'work_request_answer',
    category: 'transactional',
    name: 'Directory request answer',
    description: 'Tells the asker whether the person is interested, and hands over contact on yes.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  referral_reward: {
    id: 'referral_reward',
    category: 'transactional',
    name: 'Referral reward',
    description: 'Tells a team it earned credits because a team it invited made its first payment.',
    placeholderCopy: false,
    fromName: 'Urganize Billing',
    fromAddress: 'billing@urganize.app',
    replyTo: 'support@urganize.app',
  },
  waitlist_joined: {
    id: 'waitlist_joined',
    category: 'transactional',
    name: 'Waitlist joined',
    description: 'Tells a held account its place in line and asks it to share its link. Sent once.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  team_admin_notice: {
    id: 'team_admin_notice',
    category: 'transactional',
    name: 'Team comped or trial extended',
    description: 'Tells a team owner the founder gave the team free access or extended its free trial. Sent for every such change, including earlier ones.',
    placeholderCopy: false,
    fromName: 'Urganize Billing',
    fromAddress: 'billing@urganize.app',
    replyTo: 'support@urganize.app',
  },
  release_payback_question: {
    id: 'release_payback_question',
    category: 'reminders',
    name: 'What did the rollout pay back?',
    description:
      'Asked once, 30 days after release day: what did the rollout pay back. The answer is saved on the rollout. Copy in lib/release-spend.ts.',
    // The question is the brief's; the sentence after it is marked TODO(copy).
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  founder_billing_alert: {
    id: 'founder_billing_alert',
    category: 'internal',
    name: 'Founder billing alert',
    description: 'Operational billing alerts to the founder.',
    placeholderCopy: false,
    fromName: 'Urganize Alerts',
    fromAddress: 'alerts@urganize.app',
    replyTo: null,
  },
  notify_admin: {
    id: 'notify_admin',
    category: 'transactional',
    name: 'Ask your admin to activate',
    description: 'A walled teammate asking their admin to activate the plan.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  pay_link: {
    id: 'pay_link',
    category: 'transactional',
    name: 'Link to pick a plan',
    description: 'Emailed to the owner on request from the iPhone app, where payment cannot be taken.',
    placeholderCopy: false,
    fromName: 'Urganize Billing',
    fromAddress: 'billing@urganize.app',
    replyTo: 'support@urganize.app',
  },
  pitch_notice: {
    id: 'pitch_notice',
    category: 'transactional',
    name: 'Paid pitch update',
    description:
      'Curator pitch payments: a paid pitch arriving, the reply reminder, a missed window, a reply reaching the artist, an automatic refund.',
    // The sentences are the spec's own copy (lib/pitch-payment-copy.ts), so not
    // placeholder. The feature is switched off until launch regardless.
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  front_desk_digest: {
    id: 'front_desk_digest',
    category: 'transactional',
    name: 'Front desk questions',
    description:
      'AI front desk: once a day, the questions artists asked a curator that AI could not answer from their terms. Never sent when there are none.',
    placeholderCopy: false,
    fromName: 'Urganize AI',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  founder_ops_alert: {
    id: 'founder_ops_alert',
    category: 'internal',
    name: 'Pitch payments alert',
    description: 'Curator pitch payment problems that need the founder: reviews, mismatches, failed refunds.',
    placeholderCopy: false,
    fromName: 'Urganize Alerts',
    fromAddress: 'alerts@urganize.app',
    replyTo: null,
  },
  onboarding_step: {
    id: 'onboarding_step',
    category: 'onboarding',
    name: 'Getting started (days 1 to 7)',
    description:
      'The five-email onboarding sequence: day 1 at signup, then days 2, 3, 5 and 7 from the morning cron. Copy in lib/email/onboarding-sequence.ts.',
    // Drafted for the founder's approval; it only goes out once
    // EMAIL_ONBOARDING_SEQUENCE=on, which is the approval.
    placeholderCopy: false,
    fromName: 'Oyin at Urganize',
    fromAddress: 'wenapere@urganize.app',
    replyTo: 'wenapere@urganize.app',
  },
  self_serve_nudge: {
    id: 'self_serve_nudge',
    category: 'onboarding',
    name: 'Self-serve nudge (days 1, 3, 7)',
    description:
      'Self-serve checkout: one note on day 1, 3 or 7 to a team that paid at checkout, only while that step is undone. Copy in lib/self-serve.ts (nudgeEmailCopy).',
    placeholderCopy: false,
    fromName: 'Oyin at Urganize',
    fromAddress: 'wenapere@urganize.app',
    replyTo: 'wenapere@urganize.app',
  },
  renewal_reminder: {
    id: 'renewal_reminder',
    category: 'reminders',
    name: 'Renewal reminder (transfer)',
    description:
      'Self-serve checkout: 7, 3 and 1 days before a period paid by bank transfer ends, with the payer account number. Copy in lib/self-serve.ts (renewalEmailCopy).',
    placeholderCopy: false,
    fromName: 'Urganize Billing',
    fromAddress: 'billing@urganize.app',
    replyTo: 'support@urganize.app',
  },
  curator_application_approved: {
    id: 'curator_application_approved',
    category: 'transactional',
    name: 'Curator application approved',
    description:
      'Sent when an admin approves a playlist owner who applied at /curator/apply with an email address. Carries the single-use /curator/join link.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  help_request: {
    id: 'help_request',
    category: 'internal',
    name: 'Help message',
    description:
      'Self-serve checkout: a customer’s message from the in-app Help, sent to the founder with their team, plan, page and version. Reply-To is the customer.',
    placeholderCopy: false,
    fromName: 'Urganize Help',
    fromAddress: 'notifications@urganize.app',
    replyTo: null,
  },
  chat_mention: {
    id: 'chat_mention',
    category: 'chat',
    name: 'Tagged in rollout chat',
    description:
      'Sent when someone tags a teammate with @Name, or the whole team with @everyone, in a rollout chat.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  chime_in: {
    id: 'chime_in',
    // Rollout ideas (2026-10-26). In the chat category on purpose: it is the
    // same kind of mail (a teammate's words on a rollout), so one switch turns
    // both off.
    category: 'chat',
    name: 'Chime in on a rollout',
    description:
      'Sent when someone is asked to chime in on a rollout, and to the owner when someone adds a note to its ideas.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'notifications@urganize.app',
    replyTo: 'support@urganize.app',
  },
  announcement: {
    id: 'announcement',
    category: 'announcements',
    name: 'Written in the admin',
    description: 'An email the founder wrote and sent from /admin/emails/new.',
    placeholderCopy: false,
    fromName: 'Urganize',
    fromAddress: 'hello@urganize.app',
    replyTo: 'hello@urganize.app',
  },
};

const UNSUBSCRIBABLE: ReadonlySet<EmailCategory> = new Set<EmailCategory>([
  'onboarding',
  'reminders',
  'announcements',
  'chat',
  'claim',
]);

/** Categories a recipient can turn off, and which therefore carry an unsubscribe
 *  link and the List-Unsubscribe headers (PR 2). */
export function isUnsubscribableCategory(category: EmailCategory): boolean {
  return UNSUBSCRIBABLE.has(category);
}

export function getEmailTemplateMeta(id: EmailTemplateId): EmailTemplateMeta {
  return EMAIL_TEMPLATES[id];
}

export type ResolvedSender = {
  /** Full From header, e.g. "Urganize Billing <billing@urganize.app>". Empty
   *  only when the template's address is not allowlisted AND EMAIL_FROM is
   *  unset, which is the not-configured case anyway. */
  from: string;
  /** The bare sending address, for the log. */
  address: string;
  replyTo: string | null;
  /** True when the template's own sender was unusable and EMAIL_FROM (with
   *  EMAIL_REPLY_TO) was used instead. */
  usedFallback: boolean;
};

/** Pure: which From and Reply-To a template goes out with. EMAIL_FROM stays
 *  the on/off switch (sendEmail skips when it is unset) and is the fallback
 *  when a template's address is not on the allowlist. */
export function resolveTemplateSender(
  meta: Pick<EmailTemplateMeta, 'fromName' | 'fromAddress' | 'replyTo'>,
  config: Pick<EmailConfig, 'from' | 'replyTo'> | null
): ResolvedSender {
  const address = meta.fromAddress ?? DEFAULT_TEMPLATE_SENDER.fromAddress;
  if (!isAllowedSender(address)) {
    const from = config?.from || '';
    const match = from.match(/<([^<>]+)>\s*$/);
    return {
      from,
      address: from ? (match ? match[1] : from).trim() : '(unset)',
      replyTo: config?.replyTo ?? null,
      usedFallback: true,
    };
  }
  const name = meta.fromName ?? DEFAULT_TEMPLATE_SENDER.fromName;
  return {
    from: composeFromHeader(address, name),
    address,
    replyTo: meta.replyTo === undefined ? DEFAULT_TEMPLATE_SENDER.replyTo : meta.replyTo,
    usedFallback: false,
  };
}
