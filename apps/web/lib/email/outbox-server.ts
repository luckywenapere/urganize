import type { SupabaseClient } from '@supabase/supabase-js';
import { isEmailConfigured, sendEmail, type EmailSendResult } from './index';
import { EMAIL_LOG_TABLE } from './log-server';
import { isOnboardingSequenceEnabled } from './onboarding-sequence';
import {
  SEQUENCE_TEMPLATE,
  decideOutboxOutcome,
  outboxIdempotencyKey,
  planOutboxRun,
  readDailyEmailLimit,
  readOutboxTemplate,
  utcDayStart,
  type DueOutboxRow,
} from './outbox';

// The outbox's IO half: queue rows, and drain what is due. The decisions (what
// to send, when to retry, how much of the day's limit to use) are pure and live
// in outbox.ts, where they are tested.
//
// NOTHING HERE THROWS, the house rule for email: a sweep that fails must not
// take the cron's other jobs down with it, and a broadcast that stops half way
// must leave the queue in a state the next run can pick up.

export const EMAIL_OUTBOX_TABLE = 'email_outbox';
export const EMAIL_BROADCASTS_TABLE = 'email_broadcasts';

/** email_log statuses that mean Resend accepted the message, and so count
 *  toward the day's limit. 'pending' is included: it is a send in flight. */
const COUNTED_STATUSES = ['pending', 'sent', 'delivered', 'delayed', 'bounced', 'complained'];

/** A 'sending' row older than this belonged to a sender that died mid-send. */
const STALE_CLAIM_MS = 15 * 60 * 1000;
/** Resend's limit is 10 requests a second; three at a time stays well inside it. */
const SEND_CONCURRENCY = 3;
const INSERT_CHUNK = 500;
const DUE_FETCH_LIMIT = 300;

export type OutboxInsert = {
  recipient: string;
  recipient_user_id: string | null;
  template: string;
  props: Record<string, unknown>;
  trigger: string;
  batch_id: string | null;
  dedupe_key: string;
  send_after?: string;
  created_by?: string | null;
};

/** Queue rows. A row whose dedupe_key is already queued is skipped, so queuing
 *  twice is a no-op. Returns how many were written, or null on failure. */
export async function enqueueOutboxRows(admin: SupabaseClient, rows: OutboxInsert[]): Promise<number | null> {
  let written = 0;
  try {
    for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
      const chunk = rows.slice(start, start + INSERT_CHUNK);
      const { data, error } = await admin
        .from(EMAIL_OUTBOX_TABLE)
        .upsert(chunk, { onConflict: 'dedupe_key', ignoreDuplicates: true })
        .select('id');
      if (error) {
        console.error('[email-outbox] enqueue failed', error.message);
        return null;
      }
      written += Array.isArray(data) ? data.length : 0;
    }
    return written;
  } catch (error) {
    console.error('[email-outbox] enqueue threw', error instanceof Error ? error.message : error);
    return null;
  }
}

/** How many emails Resend has taken today (UTC). Null when it cannot be read. */
export async function countEmailsSentToday(admin: SupabaseClient, now: Date): Promise<number | null> {
  try {
    const { count, error } = await admin
      .from(EMAIL_LOG_TABLE)
      .select('id', { count: 'exact', head: true })
      .gte('created_at', utcDayStart(now).toISOString())
      .in('status', COUNTED_STATUSES);
    if (error || typeof count !== 'number') {
      if (error) console.error('[email-outbox] daily count failed', error.message);
      return null;
    }
    return count;
  } catch (error) {
    console.error('[email-outbox] daily count threw', error instanceof Error ? error.message : error);
    return null;
  }
}

export type SendBudget = { dailyLimit: number; sentToday: number | null };

export async function readSendBudget(admin: SupabaseClient, now = new Date()): Promise<SendBudget> {
  return { dailyLimit: readDailyEmailLimit(), sentToday: await countEmailsSentToday(admin, now) };
}

type OutboxRow = DueOutboxRow & {
  recipient_user_id: string | null;
  props: unknown;
  trigger: string;
  attempts: number;
  created_by: string | null;
};

const ROW_COLUMNS =
  'id,recipient,recipient_user_id,template,props,trigger,batch_id,send_after,attempts,created_by';

export type DrainResult = {
  sent: number;
  skipped: number;
  failed: number;
  requeued: number;
  cancelled: number;
  paused: number;
  /** Why the run stopped early, if it did. 'limit' means the day's email limit. */
  stoppedReason: null | 'not_configured' | 'limit' | 'rate_limited' | 'time' | 'unreadable';
};

const EMPTY_RESULT: DrainResult = {
  sent: 0,
  skipped: 0,
  failed: 0,
  requeued: 0,
  cancelled: 0,
  paused: 0,
  stoppedReason: null,
};

async function update(admin: SupabaseClient, ids: string[], values: Record<string, unknown>) {
  if (!ids.length) return;
  const { error } = await admin.from(EMAIL_OUTBOX_TABLE).update(values).in('id', ids);
  if (error) console.error('[email-outbox] update failed', error.message);
}

/** A row claimed by a sender that died. At most once beats at least once for
 *  mail like this, so it is failed rather than sent again. */
async function failAbandonedClaims(admin: SupabaseClient, now: Date) {
  const { error } = await admin
    .from(EMAIL_OUTBOX_TABLE)
    .update({ status: 'failed', last_error: 'interrupted' })
    .eq('status', 'sending')
    .lt('claimed_at', new Date(now.getTime() - STALE_CLAIM_MS).toISOString());
  if (error) console.error('[email-outbox] abandoned-claim sweep failed', error.message);
}

/**
 * Send what is due. `batchId` limits the run to one broadcast (the admin page's
 * Send button); without it the run takes the sequence and any broadcast left
 * over (the morning cron). Stops early at `timeBudgetMs` so it always answers
 * inside a request.
 */
export async function drainEmailOutbox(
  admin: SupabaseClient,
  options: { batchId?: string; timeBudgetMs?: number; maxSends?: number; now?: Date } = {}
): Promise<DrainResult> {
  const result: DrainResult = { ...EMPTY_RESULT };
  const started = Date.now();
  const timeBudgetMs = options.timeBudgetMs ?? 20_000;
  const now = options.now ?? new Date();

  try {
    if (!isEmailConfigured()) return { ...result, stoppedReason: 'not_configured' };

    await failAbandonedClaims(admin, now);

    // An unreadable count must not be read as "nothing sent today": going over
    // the limit would block invites for the rest of the day. Stop instead.
    const sentToday = await countEmailsSentToday(admin, now);
    if (sentToday === null) return { ...result, stoppedReason: 'unreadable' };

    const sequenceEnabled = isOnboardingSequenceEnabled();
    let query = admin
      .from(EMAIL_OUTBOX_TABLE)
      .select(ROW_COLUMNS)
      .eq('status', 'queued')
      .lte('send_after', now.toISOString());
    query = options.batchId ? query.eq('batch_id', options.batchId) : query;
    // Paused sequence rows sort first, so while the sequence is off they are
    // left out of the read entirely, or a long pause could crowd every
    // broadcast out of the page this run looks at.
    query = sequenceEnabled ? query : query.neq('template', SEQUENCE_TEMPLATE);
    const { data, error } = await query
      .order('batch_id', { ascending: true, nullsFirst: true })
      .order('send_after', { ascending: true })
      .limit(DUE_FETCH_LIMIT);
    if (error) {
      console.error('[email-outbox] due read failed', error.message);
      return { ...result, stoppedReason: 'unreadable' };
    }

    const plan = planOutboxRun({
      due: (data || []) as OutboxRow[],
      sequenceEnabled,
      now,
      sentToday,
      dailyLimit: readDailyEmailLimit(),
      maxSends: options.maxSends ?? 60,
    });
    result.paused = plan.paused;

    if (plan.cancelStale.length) {
      await update(
        admin,
        plan.cancelStale.map((row) => row.id),
        { status: 'cancelled', last_error: 'too_late' }
      );
      result.cancelled += plan.cancelStale.length;
    }

    // Claim before sending. The row is the lock: only rows still queued move
    // to sending, so a second sender running at the same moment gets none of
    // them.
    const ids = plan.send.map((row) => row.id);
    let claimed: OutboxRow[] = [];
    if (ids.length) {
      const claim = await admin
        .from(EMAIL_OUTBOX_TABLE)
        .update({ status: 'sending', claimed_at: now.toISOString() })
        .in('id', ids)
        .eq('status', 'queued')
        .select(ROW_COLUMNS);
      if (claim.error) {
        console.error('[email-outbox] claim failed', claim.error.message);
        return { ...result, stoppedReason: 'unreadable' };
      }
      const byId = new Map(((claim.data || []) as OutboxRow[]).map((row) => [row.id, row]));
      claimed = plan.send.map((row) => byId.get(row.id)).filter((row): row is OutboxRow => Boolean(row));
    }

    let stopReason: DrainResult['stoppedReason'] = null;
    const unsent: string[] = [];

    for (let index = 0; index < claimed.length; index += SEND_CONCURRENCY) {
      const group = claimed.slice(index, index + SEND_CONCURRENCY);
      if (stopReason || Date.now() - started > timeBudgetMs) {
        if (!stopReason) stopReason = 'time';
        unsent.push(...claimed.slice(index).map((row) => row.id));
        break;
      }
      const outcomes = await Promise.all(group.map((row) => sendOne(admin, row)));
      for (const { row, send } of outcomes) {
        const outcome = decideOutboxOutcome(send, row.attempts);
        if (outcome.kind === 'sent') {
          result.sent += 1;
          await update(admin, [row.id], { status: 'sent', sent_at: new Date().toISOString(), last_error: null });
        } else if (outcome.kind === 'skipped') {
          result.skipped += 1;
          await update(admin, [row.id], { status: 'skipped', last_error: 'unsubscribed' });
          if (row.template === SEQUENCE_TEMPLATE) await cancelRemainingSequence(admin, row.recipient);
        } else if (outcome.kind === 'failed') {
          result.failed += 1;
          await update(admin, [row.id], {
            status: 'failed',
            attempts: row.attempts + 1,
            last_error: outcome.error.slice(0, 500),
          });
        } else {
          result.requeued += 1;
          await update(admin, [row.id], {
            status: 'queued',
            claimed_at: null,
            attempts: row.attempts + (outcome.countAttempt ? 1 : 0),
            last_error: outcome.error ? outcome.error.slice(0, 500) : null,
            // Measured from the run's own clock, like every other time here.
            ...(outcome.retryAfterMs > 0
              ? { send_after: new Date(now.getTime() + outcome.retryAfterMs).toISOString() }
              : {}),
          });
          if (outcome.stopRun) stopReason = /429/.test(outcome.error || '') ? 'rate_limited' : 'not_configured';
        }
      }
    }

    // Anything claimed but not reached goes back, untouched, for the next run.
    if (unsent.length) await update(admin, unsent, { status: 'queued', claimed_at: null });

    result.stoppedReason = stopReason ?? (plan.limited ? 'limit' : null);
    return result;
  } catch (error) {
    console.error('[email-outbox] drain threw', error instanceof Error ? error.message : error);
    return { ...result, stoppedReason: 'unreadable' };
  }
}

async function sendOne(admin: SupabaseClient, row: OutboxRow): Promise<{ row: OutboxRow; send: EmailSendResult }> {
  const template = readOutboxTemplate(row);
  if (!template) return { row, send: { ok: false, error: 'template_load_failed' } };

  const common = {
    to: row.recipient,
    trigger: row.trigger,
    recipientUserId: row.recipient_user_id,
    actorUserId: row.created_by,
    batchId: row.batch_id,
    idempotencyKey: outboxIdempotencyKey(row.id),
  };
  const send =
    template.templateId === 'onboarding_step'
      ? await sendEmail(admin, { ...common, templateId: 'onboarding_step', props: template.props })
      : template.templateId === 'signup_nudge'
        ? await sendEmail(admin, { ...common, templateId: 'signup_nudge', props: template.props })
        : await sendEmail(admin, { ...common, templateId: 'announcement', props: template.props });
  return { row, send };
}

/** Someone unsubscribed part way through the sequence: stop the rest now,
 *  rather than logging a skipped send for each of them. */
async function cancelRemainingSequence(admin: SupabaseClient, recipient: string) {
  const { error } = await admin
    .from(EMAIL_OUTBOX_TABLE)
    .update({ status: 'cancelled', last_error: 'unsubscribed' })
    .eq('recipient', recipient)
    .eq('template', SEQUENCE_TEMPLATE)
    .eq('status', 'queued');
  if (error) console.error('[email-outbox] sequence cancel failed', error.message);
}

export type OutboxCountRow = { batch_id: string | null; step: string | null; status: string; total: number };

/** The queue grouped by broadcast, sequence step and status, in one round trip. */
export async function loadOutboxCounts(
  admin: SupabaseClient,
  filter: { batchIds?: string[]; template?: string }
): Promise<OutboxCountRow[] | null> {
  try {
    const { data, error } = await admin.rpc('email_outbox_counts', {
      p_batch_ids: filter.batchIds ?? null,
      p_template: filter.template ?? null,
    });
    if (error) {
      console.error('[email-outbox] counts failed', error.message);
      return null;
    }
    return ((data || []) as Array<{ batch_id: string | null; step: string | null; status: string; total: number | string }>).map(
      (row) => ({ ...row, total: Number(row.total) || 0 })
    );
  } catch (error) {
    console.error('[email-outbox] counts threw', error instanceof Error ? error.message : error);
    return null;
  }
}
