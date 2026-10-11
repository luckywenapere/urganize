import { claimInviteState, type ClaimInviteState } from './claim';
import { normalizeEmail } from './person-identity';

// The automatic claim email's rules (2026-10-11), pure so they are tested
// without a database. The IO half is lib/claim-auto-email-server.ts.
//
// A credited collaborator with an unclaimed page gets their claim link by email
// ONCE, on its own, when the rollout they are credited on has come out. If they
// still have not claimed it seven days later they get ONE reminder. Never more.
//
// Everything here fails toward NOT sending. A stranger getting no email is a
// missed chance; a stranger getting two, or one after they asked to be taken
// off, is the thing that makes people mark us as spam.

/** Days between the first email and the one reminder. */
export const CLAIM_REMINDER_DAYS = 7;
/** Emails this step may send in one run, whatever the daily budget says. */
export const MAX_CLAIM_EMAILS_PER_RUN = 25;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The switch. Off unless set to 'true', like every flag here. It also needs the
 * credits surface (NEXT_PUBLIC_FEATURE_METADATA) on, because that is where the
 * owner sees that the email went out; sending with it off would mean the owner
 * cannot tell, and might send a second one by hand later.
 */
export function isClaimAutoEmailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL === 'true' && env.NEXT_PUBLIC_FEATURE_METADATA === 'true';
}

// ---- Shapes ------------------------------------------------------------------

export type AutoEmailKind = 'invite' | 'reminder';
export type AutoEmailStatus = 'sending' | 'sent' | 'suppressed' | 'failed';

/** A person_claim_emails row. */
export type AutoEmailRecord = {
  kind: AutoEmailKind;
  status: AutoEmailStatus;
  inviteId: string | null;
  submissionId: string | null;
  sentAt: string | null;
};

/** A person_claim_invites row, from any team. */
export type ClaimInviteHistory = {
  id: string;
  /** Made by Urganize on its own (created_by is empty on a team's link). An
   *  owner's, another team's and a founder-seeded link are all false. */
  automatic: boolean;
  createdAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
  failedAttempts: number;
};

export type AutoEmailCredit = {
  submissionId: string;
  releaseId: string;
  workspaceId: string | null;
  email: string | null;
  confirmedAccurate: boolean;
  personHidden: boolean;
  /** The rollout counts as delivered (lib/recap-eligibility.ts, not archived,
   *  not a test rollout). */
  delivered: boolean;
  createdAt: string;
};

export type AutoEmailPerson = {
  personId: string;
  status: 'unclaimed' | 'claimed';
  /** Has an account on the profile (user_id set). */
  hasAccount: boolean;
  /** Asked to be taken off, or taken off. */
  removed: boolean;
  /** A founder-seeded profile (seeded_profiles). Those links are his to send. */
  seeded: boolean;
  credits: AutoEmailCredit[];
  invites: ClaimInviteHistory[];
  emails: AutoEmailRecord[];
};

export type InviteSkipReason =
  | 'removed'
  | 'claimed'
  | 'already_emailed'
  | 'seeded'
  | 'owner_sent'
  | 'not_delivered'
  | 'no_email';

export type InviteDecision =
  | { kind: 'send'; credit: AutoEmailCredit; email: string }
  | { kind: 'skip'; reason: InviteSkipReason };

export type ReminderSkipReason =
  | 'removed'
  | 'claimed'
  | 'no_first_email'
  | 'already_reminded'
  | 'too_soon'
  | 'owner_took_over'
  | 'link_used'
  | 'link_turned_off'
  | 'link_locked'
  | 'credit_gone'
  | 'not_delivered'
  | 'no_email';

export type ReminderDecision =
  | {
      kind: 'send';
      credit: AutoEmailCredit;
      email: string;
      /** The first link ran out. The reminder carries a new one either way,
       *  because the first link's token was never stored. */
      firstLink: Extract<ClaimInviteState, 'open' | 'expired'>;
    }
  | { kind: 'skip'; reason: ReminderSkipReason };

// ---- Helpers -----------------------------------------------------------------

const time = (iso: string | null | undefined): number => {
  const value = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(value) ? value : NaN;
};

function usable(credit: AutoEmailCredit): boolean {
  return credit.confirmedAccurate && !credit.personHidden && credit.delivered && Boolean(credit.workspaceId);
}

/** The newest of these invites. */
export function latestInvite(invites: readonly ClaimInviteHistory[]): ClaimInviteHistory | null {
  let best: ClaimInviteHistory | null = null;
  for (const invite of invites) {
    if (!best || (time(invite.createdAt) || 0) > (time(best.createdAt) || 0)) best = invite;
  }
  return best;
}

// ---- The first email ---------------------------------------------------------

/**
 * Should this person get the automatic claim email now, and about which credit.
 *
 * In order: never somebody who asked to go or already has the page; never a
 * second time (any record at all, even a failed or stuck one, counts); never a
 * founder-seeded profile; never once anybody has sent or shared a link by hand
 * (the owner already reached out, and the email would read as a second ask).
 * Then the credit: attested, not hidden, on a rollout that has come out, with
 * an email on it. The newest such credit is named, since it is the work the
 * person will remember.
 *
 * An automatic link that never went out (a send that will be tried again) is
 * not "somebody reached out", so it does not block.
 */
export function decideAutoInvite(person: AutoEmailPerson): InviteDecision {
  if (person.removed) return { kind: 'skip', reason: 'removed' };
  if (person.status !== 'unclaimed' || person.hasAccount) return { kind: 'skip', reason: 'claimed' };
  if (person.emails.some((record) => record.kind === 'invite')) return { kind: 'skip', reason: 'already_emailed' };
  if (person.seeded) return { kind: 'skip', reason: 'seeded' };
  if (person.invites.some((invite) => !invite.automatic)) return { kind: 'skip', reason: 'owner_sent' };

  const ready = person.credits.filter(usable);
  if (ready.length === 0) return { kind: 'skip', reason: 'not_delivered' };
  const withEmail = ready
    .map((credit) => ({ credit, email: normalizeEmail(credit.email) }))
    .filter((entry): entry is { credit: AutoEmailCredit; email: string } => Boolean(entry.email))
    .sort((a, b) => (time(b.credit.createdAt) || 0) - (time(a.credit.createdAt) || 0));
  if (withEmail.length === 0) return { kind: 'skip', reason: 'no_email' };
  return { kind: 'send', credit: withEmail[0].credit, email: withEmail[0].email };
}

// ---- The one reminder --------------------------------------------------------

/** When the reminder is due: seven days after the first email went out. */
export function reminderDueAt(firstSentAt: string): Date | null {
  const sent = time(firstSentAt);
  return Number.isFinite(sent) ? new Date(sent + CLAIM_REMINDER_DAYS * DAY_MS) : null;
}

/**
 * Should this person get the one reminder now.
 *
 * Only after a first email that really went out, only once, only seven days on,
 * and only while nobody else has made a link for them. If the owner (or another
 * team, or the founder) made one, they took over and we stay out of it. Then the
 * newest automatic link decides: used means claimed, turned off is somebody's
 * decision, and locked means somebody was guessing, so all three stop. An open
 * or run-out link gets a fresh one in the reminder.
 */
export function decideReminder(person: AutoEmailPerson, now: Date = new Date()): ReminderDecision {
  if (person.removed) return { kind: 'skip', reason: 'removed' };
  if (person.status !== 'unclaimed' || person.hasAccount) return { kind: 'skip', reason: 'claimed' };

  const first = person.emails.find((record) => record.kind === 'invite');
  if (!first || first.status !== 'sent' || !first.sentAt || !first.inviteId) {
    return { kind: 'skip', reason: 'no_first_email' };
  }
  if (person.emails.some((record) => record.kind === 'reminder')) return { kind: 'skip', reason: 'already_reminded' };

  const due = reminderDueAt(first.sentAt);
  if (!due || now.getTime() < due.getTime()) return { kind: 'skip', reason: 'too_soon' };

  if (person.invites.some((invite) => !invite.automatic)) return { kind: 'skip', reason: 'owner_took_over' };
  const newest = latestInvite(person.invites.filter((invite) => invite.automatic));
  if (!newest) return { kind: 'skip', reason: 'no_first_email' };

  const state = claimInviteState(
    {
      usedAt: newest.usedAt,
      revokedAt: newest.revokedAt,
      expiresAt: newest.expiresAt,
      failedAttempts: newest.failedAttempts,
    },
    now
  );
  if (state === 'used') return { kind: 'skip', reason: 'link_used' };
  if (state === 'revoked') return { kind: 'skip', reason: 'link_turned_off' };
  if (state === 'locked') return { kind: 'skip', reason: 'link_locked' };

  const credit = person.credits.find((entry) => entry.submissionId === first.submissionId);
  if (!credit || !credit.confirmedAccurate || credit.personHidden || !credit.workspaceId) {
    return { kind: 'skip', reason: 'credit_gone' };
  }
  if (!credit.delivered) return { kind: 'skip', reason: 'not_delivered' };
  const email = normalizeEmail(credit.email);
  if (!email) return { kind: 'skip', reason: 'no_email' };
  return { kind: 'send', credit, email, firstLink: state };
}

// ---- After the send ----------------------------------------------------------

/** The part of lib/email's EmailSendResult this file reads. */
export type ClaimSendResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: 'not_configured' | 'suppressed';
  error?: string;
};

export type AfterSend =
  /** Keep the record as sent. */
  | { kind: 'sent' }
  /** Keep the record, so it is never tried again. */
  | { kind: 'final'; status: 'suppressed' | 'failed'; error: string | null }
  /** Drop the reservation so another day's run tries again. The next send
   *  would hit the same wall (no config, over the day's limit), so stop. */
  | { kind: 'retry'; stopRun: true; error: string | null };

/**
 * What a send result means for the once-only record.
 *
 * Only an outcome that certainly did NOT reach anybody is tried again: email
 * not configured (Resend was never called), or Resend's 429 (refused, over the
 * day's limit). Then the reservation is dropped and another day tries.
 *
 * Everything else is final, including a timeout or a 5xx. Those are ambiguous:
 * the email may have gone out, and "never twice" outranks "always once". The
 * owner can still send the link by hand from the credits panel.
 */
export function afterSend(result: ClaimSendResult): AfterSend {
  if (result.ok) return { kind: 'sent' };
  if (result.skipped) {
    if (result.reason === 'suppressed') return { kind: 'final', status: 'suppressed', error: null };
    return { kind: 'retry', stopRun: true, error: 'not_configured' };
  }
  const error = (result.error || 'unknown').slice(0, 500);
  if (/^Resend responded 429\b/.test(error)) return { kind: 'retry', stopRun: true, error };
  return { kind: 'final', status: 'failed', error };
}

/** How many claim emails this run may send: what the day has left after the
 *  bulk reserve, never more than the per-run cap, and none when today's count
 *  cannot be read (fail toward not sending). */
export function claimEmailBudget(input: { dailyLimit: number; sentToday: number | null; reserve: number }): number {
  if (input.sentToday === null) return 0;
  const left = Math.max(0, input.dailyLimit - input.reserve - input.sentToday);
  return Math.min(left, MAX_CLAIM_EMAILS_PER_RUN);
}

/** Resend's idempotency key, one per claim link, so a send can never go out
 *  twice for the same link. */
export function claimEmailIdempotencyKey(kind: AutoEmailKind, inviteId: string): string {
  return `claim-${kind}-${inviteId}`;
}
