import type { AllowedSender } from './config';
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
  /** Send from this address instead of the EMAIL_FROM default. Must be in the
   *  allowlist. Undefined for every PR-1 template (behaviour preserved). */
  fromAddress?: AllowedSender;
};

export const EMAIL_TEMPLATES: Record<EmailTemplateId, EmailTemplateMeta> = {
  welcome: {
    id: 'welcome',
    category: 'onboarding',
    name: 'Welcome',
    description: 'The founder-note welcome, sent once when a self-signup finishes onboarding.',
    placeholderCopy: false,
  },
  workspace_invite: {
    id: 'workspace_invite',
    category: 'transactional',
    name: 'Team invite',
    description: 'Sent when someone is invited to a team, carrying the single-use accept link.',
    placeholderCopy: false,
  },
  credit_submission: {
    id: 'credit_submission',
    category: 'transactional',
    name: 'Credits submitted',
    description: 'Tells the release owner a collaborator submitted their credits.',
    placeholderCopy: false,
  },
  task_assigned: {
    id: 'task_assigned',
    category: 'transactional',
    name: 'Activity assigned',
    description: 'Tells someone an activity was assigned to them.',
    placeholderCopy: false,
  },
  work_request: {
    id: 'work_request',
    category: 'transactional',
    name: 'Directory request',
    description: 'Tells a directory member someone is asking them to work on a release.',
    placeholderCopy: false,
  },
  claim_invite: {
    id: 'claim_invite',
    category: 'transactional',
    name: 'Claim your page',
    description: 'Sent when a rollout owner invites a credited collaborator to claim their unclaimed profile.',
    placeholderCopy: false,
  },
  claim_code: {
    id: 'claim_code',
    category: 'transactional',
    name: 'Claim code',
    description: 'The six-digit code that proves a claim, sent to the email already on the credit (URG-305).',
    placeholderCopy: false,
  },
  claim_auto_invite: {
    id: 'claim_auto_invite',
    category: 'claim',
    name: 'Your page is ready',
    description:
      'Sent once, on its own, to a credited collaborator with an unclaimed page when the rollout has come out. Behind NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL. Copy in lib/claim-email-copy.ts.',
    placeholderCopy: false,
  },
  claim_reminder: {
    id: 'claim_reminder',
    category: 'claim',
    name: 'Your page is still waiting',
    description:
      'The one reminder, 7 days after the automatic claim email, if the page is still unclaimed and nobody sent a newer link. Copy in lib/claim-email-copy.ts.',
    placeholderCopy: false,
  },
  directory_invite: {
    id: 'directory_invite',
    category: 'transactional',
    name: 'Directory invite',
    description:
      'Sent when a manager invites someone they work with into the Directory and types their email. Carries the /welcome link to their private profile.',
    placeholderCopy: false,
  },
  work_request_answer: {
    id: 'work_request_answer',
    category: 'transactional',
    name: 'Directory request answer',
    description: 'Tells the asker whether the person is interested, and hands over contact on yes.',
    placeholderCopy: false,
  },
  referral_reward: {
    id: 'referral_reward',
    category: 'transactional',
    name: 'Referral reward',
    description: 'Tells a team it earned credits because a team it invited made its first payment.',
    placeholderCopy: false,
  },
  team_admin_notice: {
    id: 'team_admin_notice',
    category: 'transactional',
    name: 'Team comped or trial extended',
    description: 'Tells a team owner the founder gave the team free access or extended its free trial. Sent for every such change, including earlier ones.',
    placeholderCopy: false,
  },
  release_payback_question: {
    id: 'release_payback_question',
    category: 'reminders',
    name: 'What did the rollout pay back?',
    description:
      'Asked once, 30 days after release day: what did the rollout pay back. The answer is saved on the rollout. Copy in lib/release-spend.ts.',
    // The question is the brief's; the sentence after it is marked TODO(copy).
    placeholderCopy: false,
  },
  founder_billing_alert: {
    id: 'founder_billing_alert',
    category: 'internal',
    name: 'Founder billing alert',
    description: 'Operational billing alerts to the founder.',
    placeholderCopy: false,
  },
  notify_admin: {
    id: 'notify_admin',
    category: 'transactional',
    name: 'Ask your admin to activate',
    description: 'A walled teammate asking their admin to activate the plan.',
    placeholderCopy: false,
  },
  pay_link: {
    id: 'pay_link',
    category: 'transactional',
    name: 'Link to pick a plan',
    description: 'Emailed to the owner on request from the iPhone app, where payment cannot be taken.',
    placeholderCopy: false,
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
  },
  founder_ops_alert: {
    id: 'founder_ops_alert',
    category: 'internal',
    name: 'Pitch payments alert',
    description: 'Curator pitch payment problems that need the founder: reviews, mismatches, failed refunds.',
    placeholderCopy: false,
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
  },
  chat_mention: {
    id: 'chat_mention',
    category: 'chat',
    name: 'Tagged in rollout chat',
    description:
      'Sent when someone tags a teammate with @Name, or the whole team with @everyone, in a rollout chat.',
    placeholderCopy: false,
  },
  announcement: {
    id: 'announcement',
    category: 'announcements',
    name: 'Written in the admin',
    description: 'An email the founder wrote and sent from /admin/emails/new.',
    placeholderCopy: false,
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
