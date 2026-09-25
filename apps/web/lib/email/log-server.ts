import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailCategory } from './registry';
import type { EmailTemplateId } from './templates/props';

// Writes and updates email_log rows. Server-only (service-role client passed in).
// Never throws: the log is a courtesy record on top of a send, so a log failure
// must never stop mail going out or surface to a caller.

export const EMAIL_LOG_TABLE = 'email_log';

export type EmailLogStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'delayed'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'skipped'
  | 'unsubscribed';

export type EmailLogInsert = {
  recipient: string;
  recipientUserId?: string | null;
  fromAddress: string;
  replyTo?: string | null;
  subject: string;
  template: EmailTemplateId;
  category: EmailCategory;
  /** What caused the send, e.g. 'onboarding_completed', 'teammate_invited'. */
  trigger: string;
  /** Who caused it; null for a cron-driven send. */
  actorUserId?: string | null;
  /** Ordinary unique key that guards a duplicate ROW (distinct from Resend's
   *  own idempotency header). Used by the PR-2 daily jobs; null for transactional
   *  sends, which fire on discrete events. */
  dedupeKey?: string | null;
  /** Groups a dashboard broadcast's rows (PR 3). */
  batchId?: string | null;
};

function rowFromInsert(input: EmailLogInsert, status: EmailLogStatus, error?: string) {
  return {
    recipient: input.recipient.trim().toLowerCase(),
    recipient_user_id: input.recipientUserId ?? null,
    from_address: input.fromAddress,
    reply_to: input.replyTo ?? null,
    subject: input.subject,
    template: input.template,
    category: input.category,
    status,
    trigger: input.trigger,
    actor_user_id: input.actorUserId ?? null,
    dedupe_key: input.dedupeKey ?? null,
    batch_id: input.batchId ?? null,
    error: error ?? null,
    sent_at: status === 'sent' ? new Date().toISOString() : null,
  };
}

/** Insert a 'pending' row and return its id (null if the write failed — the send
 *  still proceeds; a missing log row is better than a blocked courtesy email). */
export async function insertPendingEmailLog(
  admin: SupabaseClient,
  input: EmailLogInsert
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from(EMAIL_LOG_TABLE)
      .insert(rowFromInsert(input, 'pending'))
      .select('id')
      .single();
    if (error || !data) {
      console.error('[email-log] pending insert failed', error?.message);
      return null;
    }
    return String((data as { id: string }).id);
  } catch (error) {
    console.error('[email-log] pending insert threw', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Insert a terminal row directly (used for 'skipped' and for a 'failed' render,
 *  where there was never a pending row). */
export async function insertTerminalEmailLog(
  admin: SupabaseClient,
  input: EmailLogInsert,
  status: EmailLogStatus,
  error?: string
): Promise<void> {
  try {
    const { error: dbError } = await admin
      .from(EMAIL_LOG_TABLE)
      .insert(rowFromInsert(input, status, error));
    if (dbError) console.error('[email-log] terminal insert failed', dbError.message);
  } catch (dbError) {
    console.error('[email-log] terminal insert threw', dbError instanceof Error ? dbError.message : dbError);
  }
}

export async function markEmailLogSent(
  admin: SupabaseClient,
  id: string,
  resendId: string | null
): Promise<void> {
  try {
    await admin
      .from(EMAIL_LOG_TABLE)
      .update({ status: 'sent', resend_id: resendId, sent_at: new Date().toISOString() })
      .eq('id', id);
  } catch (error) {
    console.error('[email-log] mark sent threw', error instanceof Error ? error.message : error);
  }
}

export async function markEmailLogFailed(
  admin: SupabaseClient,
  id: string,
  error: string
): Promise<void> {
  try {
    await admin
      .from(EMAIL_LOG_TABLE)
      .update({ status: 'failed', error: error.slice(0, 500) })
      .eq('id', id);
  } catch (dbError) {
    console.error('[email-log] mark failed threw', dbError instanceof Error ? dbError.message : dbError);
  }
}
