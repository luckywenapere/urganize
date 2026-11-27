// The outbox's decisions, pure and unit-tested. The IO half is outbox-server.ts.
//
// The outbox (supabase table email_outbox) holds every email that goes out LATER
// rather than the moment something happens: the onboarding sequence's days 2 to
// 7, and a dashboard broadcast working through its recipients. One sender drains
// it, from the morning cron and from the admin page's "Send" button.
//
// THREE PROPERTIES THIS FILE EXISTS TO HOLD:
//
// 1. AT MOST ONCE. A row is claimed before it is sent (the claim is a
//    conditional update in outbox-server.ts), and a retry reuses the row's own
//    Resend idempotency key, which Resend honours for 24 hours. So a retry after
//    an ambiguous timeout cannot deliver the same email twice.
//
// 2. THE DAILY LIMIT IS SHARED, AND EVERYDAY MAIL COMES FIRST. The Resend account
//    is on the free plan: 100 emails a day across everything, invites and
//    assignment notes included. Queued mail may only use what is left after a
//    reserve, and bulk mail keeps back more than the sequence does, so a big
//    broadcast can never stop a teammate's invite from going out.
//
// 3. NEVER TWO SEQUENCE EMAILS IN ONE MORNING. If the cron misses days, a person
//    gets the next step, not a pile of them; and a step that is days late is
//    dropped rather than sent out of context ("tomorrow I'll ask you...").

// Pure too: the words and rules of the next-morning sign-up note (#1429).
import { isSignupNudgeTooLate } from './signup-nudge';

/** The shape of lib/email's EmailSendResult that this file reads. Local rather
 *  than imported so this module stays free of anything server-side. */
export type SendResultLike = {
  ok: boolean;
  skipped?: boolean;
  reason?: 'not_configured' | 'suppressed';
  error?: string;
};

export const OUTBOX_MAX_ATTEMPTS = 3;
export const OUTBOX_RETRY_DELAY_MS = 60 * 60 * 1000;

/** Held back from queued mail for everything that is not queued. */
export const SEQUENCE_RESERVE = 30;
export const BULK_RESERVE = 50;

/** The Resend free plan. Override with EMAIL_DAILY_LIMIT after upgrading. */
export const DEFAULT_DAILY_EMAIL_LIMIT = 100;

const DAY_MS = 24 * 60 * 60 * 1000;
/** A sequence email this late reads out of context, so it is dropped instead. */
export const SEQUENCE_STALE_AFTER_MS = 4 * DAY_MS;

export type OutboxOutcome =
  | { kind: 'sent' }
  | { kind: 'skipped'; reason: 'suppressed' }
  | {
      kind: 'requeue';
      /** Whether this counts toward OUTBOX_MAX_ATTEMPTS. A limit or a missing
       *  config is not the email's fault, so it does not. */
      countAttempt: boolean;
      retryAfterMs: number;
      /** Stop sending anything else this run: the next send would hit the same wall. */
      stopRun: boolean;
      error?: string;
    }
  | { kind: 'failed'; error: string };

export function decideOutboxOutcome(result: SendResultLike, attemptsSoFar: number): OutboxOutcome {
  if (result.ok) return { kind: 'sent' };

  if (result.skipped) {
    if (result.reason === 'suppressed') return { kind: 'skipped', reason: 'suppressed' };
    return { kind: 'requeue', countAttempt: false, retryAfterMs: 0, stopRun: true };
  }

  const error = result.error || 'unknown';

  // Rate limited or over the day's quota. Nothing is wrong with this email.
  if (/^Resend responded 429\b/.test(error)) {
    return { kind: 'requeue', countAttempt: false, retryAfterMs: 0, stopRun: true, error };
  }
  // Refused for a reason sending again cannot fix (an invalid address, a sender
  // that is not verified), or our own template failed to render.
  if (/^Resend responded 4\d\d\b/.test(error) || error === 'template_load_failed' || error.startsWith('render:')) {
    return { kind: 'failed', error };
  }
  // A 5xx, a timeout or a dropped connection: try again later, a few times.
  if (attemptsSoFar + 1 >= OUTBOX_MAX_ATTEMPTS) return { kind: 'failed', error };
  return { kind: 'requeue', countAttempt: true, retryAfterMs: OUTBOX_RETRY_DELAY_MS, stopRun: false, error };
}

export function readDailyEmailLimit(): number {
  const raw = Number(process.env.EMAIL_DAILY_LIMIT?.trim() || '');
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_DAILY_EMAIL_LIMIT;
}

export function computeSendBudget(input: { dailyLimit: number; sentToday: number; reserve: number }): number {
  return Math.max(0, input.dailyLimit - input.reserve - input.sentToday);
}

type PickableRow = { id: string; recipient: string; batch_id: string | null };

/** The rows to send this run, in the order given, up to the budget. A person
 *  gets at most one SEQUENCE email per run; broadcasts are separate. */
export function pickRowsForRun<Row extends PickableRow>(rows: Row[], budget: number): Row[] {
  const picked: Row[] = [];
  const sequenceRecipients = new Set<string>();
  for (const row of rows) {
    if (picked.length >= budget) break;
    if (row.batch_id === null) {
      if (sequenceRecipients.has(row.recipient)) continue;
      sequenceRecipients.add(row.recipient);
    }
    picked.push(row);
  }
  return picked;
}

export function isStaleSequenceRow(row: { batch_id: string | null; send_after: string }, now: Date): boolean {
  if (row.batch_id !== null) return false;
  const due = Date.parse(row.send_after);
  return Number.isFinite(due) && now.getTime() - due > SEQUENCE_STALE_AFTER_MS;
}

/** Resend's day, which the daily limit counts within. */
export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function outboxIdempotencyKey(rowId: string): string {
  return `outbox-${rowId}`;
}

export const SEQUENCE_TEMPLATE = 'onboarding_step';

export type DueOutboxRow = {
  id: string;
  recipient: string;
  batch_id: string | null;
  template: string;
  send_after: string;
};

export type OutboxRunPlan<Row extends DueOutboxRow> = {
  /** Sequence rows first, then broadcast rows, in the order they were due. */
  send: Row[];
  /** Sequence rows too late to make sense any more; cancel them. */
  cancelStale: Row[];
  /** Sequence rows left waiting because the sequence is switched off. */
  paused: number;
  /** True when due mail was held back by the daily limit rather than sent. */
  limited: boolean;
};

/**
 * What to send this run, given everything that is due. The sequence gets the
 * budget first and keeps back only SEQUENCE_RESERVE; broadcasts share what is
 * left and keep back BULK_RESERVE, so invites and assignment notes always have
 * room later in the day.
 */
export function planOutboxRun<Row extends DueOutboxRow>(input: {
  due: Row[];
  sequenceEnabled: boolean;
  now: Date;
  sentToday: number;
  dailyLimit: number;
  maxSends: number;
}): OutboxRunPlan<Row> {
  const sequenceRows = input.due.filter((row) => row.batch_id === null);
  const bulkRows = input.due.filter((row) => row.batch_id !== null);

  let paused = 0;
  const cancelStale: Row[] = [];
  const sequenceCandidates: Row[] = [];
  for (const row of sequenceRows) {
    if (row.template === SEQUENCE_TEMPLATE && !input.sequenceEnabled) paused += 1;
    else if (isStaleSequenceRow(row, input.now) || isSignupNudgeTooLate(row, input.now)) cancelStale.push(row);
    else sequenceCandidates.push(row);
  }

  const sequenceBudget = Math.min(
    computeSendBudget({ dailyLimit: input.dailyLimit, sentToday: input.sentToday, reserve: SEQUENCE_RESERVE }),
    input.maxSends
  );
  const pickedSequence = pickRowsForRun(sequenceCandidates, sequenceBudget);

  const bulkLimitBudget = Math.max(
    0,
    computeSendBudget({ dailyLimit: input.dailyLimit, sentToday: input.sentToday, reserve: BULK_RESERVE }) -
      pickedSequence.length
  );
  const bulkBudget = Math.min(bulkLimitBudget, Math.max(0, input.maxSends - pickedSequence.length));
  const pickedBulk = pickRowsForRun(bulkRows, bulkBudget);

  const sequenceHeld = pickedSequence.length < new Set(sequenceCandidates.map((row) => row.recipient)).size;
  const limited =
    (bulkRows.length > pickedBulk.length && pickedBulk.length >= bulkLimitBudget) ||
    (sequenceHeld && pickedSequence.length >= sequenceBudget && sequenceBudget < input.maxSends);

  return { send: [...pickedSequence, ...pickedBulk], cancelStale, paused, limited };
}

/** The templates the outbox may send, with their props checked, or null. A row
 *  that fails this is marked failed rather than sent with broken props. */
export type OutboxTemplate =
  | { templateId: 'onboarding_step'; props: { step: 'day1' | 'day2' | 'day3' | 'day5' | 'day7'; recipientName: string } }
  /** The next-morning note to someone who stopped before adding music (#1429). */
  | { templateId: 'signup_nudge'; props: { recipientName: string } }
  | {
      templateId: 'announcement';
      props: { subject: string; body: string; recipientName: string; includeGreeting: boolean; signOff: boolean };
    };

const STEP_KEYS = new Set(['day1', 'day2', 'day3', 'day5', 'day7']);

export function readOutboxTemplate(row: { template: string; props: unknown }): OutboxTemplate | null {
  const props = row.props && typeof row.props === 'object' ? (row.props as Record<string, unknown>) : null;
  if (!props) return null;
  const recipientName = typeof props.recipientName === 'string' ? props.recipientName : '';

  if (row.template === 'onboarding_step') {
    if (typeof props.step !== 'string' || !STEP_KEYS.has(props.step)) return null;
    return {
      templateId: 'onboarding_step',
      props: { step: props.step as 'day1' | 'day2' | 'day3' | 'day5' | 'day7', recipientName },
    };
  }

  if (row.template === 'signup_nudge') {
    return { templateId: 'signup_nudge', props: { recipientName } };
  }

  if (row.template === 'announcement') {
    if (typeof props.subject !== 'string' || !props.subject.trim()) return null;
    if (typeof props.body !== 'string' || !props.body.trim()) return null;
    return {
      templateId: 'announcement',
      props: {
        subject: props.subject,
        body: props.body,
        recipientName,
        includeGreeting: props.includeGreeting !== false,
        signOff: props.signOff !== false,
      },
    };
  }

  return null;
}
