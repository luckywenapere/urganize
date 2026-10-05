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
]);

/** Categories a recipient can turn off, and which therefore carry an unsubscribe
 *  link and the List-Unsubscribe headers (PR 2). */
export function isUnsubscribableCategory(category: EmailCategory): boolean {
  return UNSUBSCRIBABLE.has(category);
}

export function getEmailTemplateMeta(id: EmailTemplateId): EmailTemplateMeta {
  return EMAIL_TEMPLATES[id];
}
