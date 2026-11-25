import type { EmailTemplateId } from './templates/props';
import type { EmailLogStatus } from './log-server';

// Plain names for the email log at /admin/emails (2026-11-12, #1241; founder
// approved the mock). The log stores code names ("team_admin_notice",
// "backfill_trial_extended", "pitch_new_late"); the page shows these instead.
// Every template must have a label (the Record type holds that); a trigger
// without one falls back to its code name made readable, so a new trigger
// never shows blank.

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateId, string> = {
  welcome: 'Welcome',
  workspace_invite: 'Team invite',
  credit_submission: 'Credits sent in',
  task_assigned: 'Activity assigned',
  work_request: 'Work request',
  work_request_answer: 'Work request answer',
  referral_reward: 'Referral reward',
  waitlist_joined: 'Joined the waitlist',
  founder_billing_alert: 'Billing alert to us',
  notify_admin: 'Ask the admin to pay',
  pay_link: 'Payment link',
  pitch_notice: 'Pitch update',
  front_desk_digest: 'Front desk digest',
  founder_ops_alert: 'Ops alert to us',
  onboarding_step: 'Onboarding email',
  announcement: 'Email from the admin',
  chat_mention: 'Tagged in a chat',
  chime_in: 'Asked to chime in',
  team_admin_notice: 'Trial or comp notice',
  artist_verification: 'Artist verification',
  release_payback_question: 'Did the release pay back',
  release_out_now: 'Release out now',
  claim_invite: 'Claim your profile',
  claim_auto_invite: 'Claim your profile',
  claim_reminder: 'Claim reminder',
  claim_code: 'Claim code',
  directory_invite: 'Directory invite',
  self_serve_nudge: 'Checkout nudge',
  renewal_reminder: 'Renewal reminder',
  card_trial_reminder: 'Card trial reminder',
  help_request: 'Help request',
  curator_application_approved: 'Application approved',
};

/** What set an email off, in plain words. Values seen in the log and in code. */
export const EMAIL_TRIGGER_LABELS: Record<string, string> = {
  admin_broadcast: 'Sent from the admin',
  admin_test: 'Test from the admin',
  admin_comp: 'Team comped',
  admin_extend_trial: 'Trial extended',
  backfill_comped: 'Past comp, sent later',
  backfill_trial_extended: 'Past extension, sent later',
  ai_wallet_empty: 'AI wallet empty',
  manually_marked_paid: 'Marked paid',
  paywall_hit: 'Hit the paywall',
  paywall_return_visit: 'Came back to the paywall',
  talk_to_us_clicked: 'Pressed Talk to us',
  trial_ending_soon: 'Trial ending soon',
  checkout_completed: 'Paid at checkout',
  plan_change_requested: 'Asked to change plan',
  payment_failed: 'Payment failed',
  urgans_guard_tripped: 'AI daily cap reached',
  subscription_cancelled: 'Cancelled',
  subscription_paused: 'Paused',
  retention_offer_accepted: 'Took the budget price',
  trm_registration_needed: 'Needs a TRM account',
  onboarding_completed: 'Finished setup',
  onboarding_sequence: 'Onboarding emails',
  claim_auto_invite: 'Credited on a release',
  claim_invite_sent: 'Invite sent',
  claim_code_requested: 'Asked for a code',
  claim_reminder: 'Reminder',
  directory_invite_sent: 'Invite sent',
  pitch_new: 'New pitch',
  pitch_new_late: 'New pitch, late',
  pitch_paid: 'Pitch paid',
  pitch_replied: 'Pitch reply',
  pitch_reminder: 'Pitch reminder',
  pitch_missed_window: 'Pitch window missed',
  pitch_auto_refund: 'Pitch refunded',
  curator_inbox_paused: 'Inbox paused',
  curator_application_approved: 'Application approved',
  release_out_now: 'Release day',
  release_payback_question: 'After release',
  task_assigned: 'Activity assigned',
  teammate_invited: 'Teammate invited',
  work_request_sent: 'Request sent',
  work_request_answered: 'Request answered',
  waitlist_joined: 'Joined the waitlist',
  referral_reward: 'Referral paid',
  pay_link_emailed: 'Payment link sent',
  call_payment_link: 'Payment link after a call',
  confirmed_card: 'Card confirmed',
  notify_admin_sent: 'Admin asked to pay',
  front_desk_digest: 'Daily digest',
  credit_submitted: 'Credits sent in',
  rollout_idea_added: 'Idea added',
  rollout_chime_in_asked: 'Asked to chime in',
  brief_guest_invited: 'Guest invited',
  artist_page: 'Artist page',
  whatsapp_reply: 'WhatsApp reply',
  daily_sweep: 'Daily check',
  mcp_call: 'From an AI tool',
  invite: 'Invite',
  release: 'Release',
  message: 'Message',
  button: 'Button',
  apply: 'Applied',
  test: 'Test',
};

export const EMAIL_STATUS_LABELS: Record<EmailLogStatus, string> = {
  pending: 'Waiting',
  sent: 'Sent',
  delivered: 'Delivered',
  delayed: 'Delayed',
  bounced: 'Bounced',
  complained: 'Marked spam',
  failed: 'Failed',
  skipped: 'Skipped',
  unsubscribed: 'Unsubscribed',
};

/** Statuses that need a look: the Problems filter. */
export const EMAIL_PROBLEM_STATUSES: ReadonlySet<string> = new Set(['failed', 'bounced', 'complained']);

/** "backfill_trial_extended" -> "Backfill trial extended". */
function readable(code: string): string {
  const words = code.replace(/[_.:-]+/g, ' ').trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

export function emailTemplateLabel(template: string): string {
  return (EMAIL_TEMPLATE_LABELS as Record<string, string>)[template] ?? readable(template);
}

export function emailTriggerLabel(trigger: string): string {
  return EMAIL_TRIGGER_LABELS[trigger] ?? readable(trigger);
}

export function emailStatusLabel(status: string): string {
  return (EMAIL_STATUS_LABELS as Record<string, string>)[status] ?? readable(status);
}

/** The Kind column: the template, and what set it off when that says more. */
export function emailKindLine(row: { template: string; trigger: string }): { kind: string; trigger: string | null } {
  const kind = emailTemplateLabel(row.template);
  const trigger = row.trigger ? emailTriggerLabel(row.trigger) : '';
  return { kind, trigger: trigger && trigger !== kind ? trigger : null };
}
