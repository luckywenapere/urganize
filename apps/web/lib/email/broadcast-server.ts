import type { SupabaseClient } from '@supabase/supabase-js';
import type { Audience, Candidate } from './audience';
import type { AnnouncementDraft } from './announcement';
import { EMAIL_BROADCASTS_TABLE, EMAIL_OUTBOX_TABLE, enqueueOutboxRows, loadOutboxCounts } from './outbox-server';

// Dashboard broadcasts: an email the founder writes in /admin/emails/new and
// sends to an audience. Creating one writes a header row and queues one outbox
// row per recipient; the admin page then drains that batch, and the morning
// cron finishes whatever the daily limit held back. Never throws.

/** A typo'd audience should not be able to email tens of thousands of people. */
export const MAX_BROADCAST_RECIPIENTS = 5000;

export const BROADCAST_TRIGGER = 'admin_broadcast';

export type BroadcastCounts = Record<'queued' | 'sending' | 'sent' | 'skipped' | 'failed' | 'cancelled', number>;

const emptyCounts = (): BroadcastCounts => ({ queued: 0, sending: 0, sent: 0, skipped: 0, failed: 0, cancelled: 0 });

export function broadcastDedupeKey(broadcastId: string, email: string): string {
  return `broadcast:${broadcastId}:${email.trim().toLowerCase()}`;
}

export async function createBroadcast(
  admin: SupabaseClient,
  input: {
    audience: Audience;
    audienceLabel: string;
    draft: AnnouncementDraft;
    recipients: Candidate[];
    suppressedCount: number;
    createdBy: string;
  }
): Promise<{ ok: true; broadcastId: string; total: number } | { ok: false; error: string }> {
  if (input.recipients.length === 0) return { ok: false, error: 'Nobody to send this to.' };
  if (input.recipients.length > MAX_BROADCAST_RECIPIENTS) {
    return { ok: false, error: `That is more than ${MAX_BROADCAST_RECIPIENTS.toLocaleString('en')} people.` };
  }

  try {
    const { data, error } = await admin
      .from(EMAIL_BROADCASTS_TABLE)
      .insert({
        subject: input.draft.subject,
        body: input.draft.body,
        include_greeting: input.draft.includeGreeting,
        sign_off: input.draft.signOff,
        audience: input.audience,
        audience_label: input.audienceLabel,
        total: input.recipients.length,
        suppressed_count: input.suppressedCount,
        created_by: input.createdBy,
      })
      .select('id')
      .single();
    if (error || !data) {
      return { ok: false, error: `Could not save the email: ${error?.message || 'no row'}` };
    }
    const broadcastId = String((data as { id: string }).id);

    const written = await enqueueOutboxRows(
      admin,
      input.recipients.map((recipient) => ({
        recipient: recipient.email,
        recipient_user_id: recipient.userId,
        template: 'announcement',
        props: {
          subject: input.draft.subject,
          body: input.draft.body,
          recipientName: recipient.name,
          includeGreeting: input.draft.includeGreeting,
          signOff: input.draft.signOff,
        },
        trigger: BROADCAST_TRIGGER,
        batch_id: broadcastId,
        dedupe_key: broadcastDedupeKey(broadcastId, recipient.email),
        created_by: input.createdBy,
      }))
    );

    if (written === null) {
      // A half-queued broadcast is worse than none: take it back out.
      await admin.from(EMAIL_BROADCASTS_TABLE).delete().eq('id', broadcastId);
      return { ok: false, error: 'Could not queue the email. Nothing was sent.' };
    }
    return { ok: true, broadcastId, total: written };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save the email.' };
  }
}

export type BroadcastSummary = {
  id: string;
  subject: string;
  audienceLabel: string;
  total: number;
  suppressedCount: number;
  createdAt: string;
  cancelledAt: string | null;
  counts: BroadcastCounts;
};

type BroadcastRow = {
  id: string;
  subject: string;
  audience_label: string;
  total: number;
  suppressed_count: number;
  created_at: string;
  cancelled_at: string | null;
};

export async function listBroadcasts(
  admin: SupabaseClient,
  limit = 20
): Promise<{ broadcasts: BroadcastSummary[]; error: string | null }> {
  const { data, error } = await admin
    .from(EMAIL_BROADCASTS_TABLE)
    .select('id,subject,audience_label,total,suppressed_count,created_at,cancelled_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { broadcasts: [], error: error.message };

  const rows = (data || []) as BroadcastRow[];
  const counts = rows.length ? await loadOutboxCounts(admin, { batchIds: rows.map((row) => row.id) }) : [];
  const byBatch = new Map<string, BroadcastCounts>();
  for (const row of counts || []) {
    if (!row.batch_id) continue;
    const entry = byBatch.get(row.batch_id) ?? emptyCounts();
    if (row.status in entry) entry[row.status as keyof BroadcastCounts] += row.total;
    byBatch.set(row.batch_id, entry);
  }

  return {
    broadcasts: rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      audienceLabel: row.audience_label,
      total: row.total,
      suppressedCount: row.suppressed_count,
      createdAt: row.created_at,
      cancelledAt: row.cancelled_at,
      counts: byBatch.get(row.id) ?? emptyCounts(),
    })),
    error: counts === null ? 'Could not count the queue.' : null,
  };
}

export async function loadBroadcastCounts(admin: SupabaseClient, broadcastId: string): Promise<BroadcastCounts | null> {
  const rows = await loadOutboxCounts(admin, { batchIds: [broadcastId] });
  if (!rows) return null;
  const counts = emptyCounts();
  for (const row of rows) if (row.status in counts) counts[row.status as keyof BroadcastCounts] += row.total;
  return counts;
}

export async function broadcastExists(admin: SupabaseClient, broadcastId: string): Promise<boolean> {
  const { data } = await admin.from(EMAIL_BROADCASTS_TABLE).select('id').eq('id', broadcastId).maybeSingle();
  return Boolean(data);
}

/** Stop a broadcast: everything still waiting is cancelled. What already went
 *  out stays out. Returns how many were stopped, or null on failure. */
export async function cancelBroadcast(admin: SupabaseClient, broadcastId: string): Promise<number | null> {
  try {
    const { data, error } = await admin
      .from(EMAIL_OUTBOX_TABLE)
      .update({ status: 'cancelled', last_error: 'stopped from the admin' })
      .eq('batch_id', broadcastId)
      .eq('status', 'queued')
      .select('id');
    if (error) {
      console.error('[email-broadcast] cancel failed', error.message);
      return null;
    }
    await admin
      .from(EMAIL_BROADCASTS_TABLE)
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', broadcastId)
      .is('cancelled_at', null);
    return Array.isArray(data) ? data.length : 0;
  } catch (error) {
    console.error('[email-broadcast] cancel threw', error instanceof Error ? error.message : error);
    return null;
  }
}
