// SERVER ONLY — mobile push notifications (2026-08-10): re-engagement
// reminders for a release the user created and then left. Rides the
// existing scheduled_notifications queue (lib/engagement-server.ts) and its
// 15-minute flusher / login-ping opportunistic flush — no new cron.
//
// Delivery must happen after enqueueLoginDrip's cancel became kind-scoped
// (see engagement-server.ts's header comment); before that fix, every
// login wiped whatever this file queued.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getNotificationPresets } from '@/lib/notification-presets-server';

export const RELEASE_REMINDER_KIND_PREFIX = 'release_reminder_';

type ReleaseReminderInput = {
  userId: string;
  releaseId: string;
  releaseTitle: string;
};

/** Queues the release-reminder steps for a freshly created release. Never
 * throws — this must never fail a release create. */
export async function enqueueReleaseReminders(
  adminClient: SupabaseClient,
  input: ReleaseReminderInput
): Promise<{ queued: number }> {
  try {
    const presets = await getNotificationPresets(adminClient);
    if (!presets.releaseReminders.enabled || presets.releaseReminders.steps.length === 0) {
      return { queued: 0 };
    }

    const url = `/dashboard?release=${input.releaseId}`;

    // Cancel any prior pending reminders for this same release before
    // queuing fresh ones — re-creating shouldn't be possible for the same
    // release id, but this keeps the function idempotent if it's ever
    // called twice for the same release (e.g. a retried request).
    await adminClient
      .from('scheduled_notifications')
      .update({ canceled_at: new Date().toISOString() })
      .eq('user_id', input.userId)
      .eq('url', url)
      .like('kind', `${RELEASE_REMINDER_KIND_PREFIX}%`)
      .is('sent_at', null)
      .is('canceled_at', null);

    const rows = presets.releaseReminders.steps.map((step) => ({
      user_id: input.userId,
      kind: `${RELEASE_REMINDER_KIND_PREFIX}${step.id}`,
      title: step.title,
      body: step.body.replace('{releaseTitle}', input.releaseTitle),
      url,
      send_at: new Date(Date.now() + step.delayMinutes * 60 * 1000).toISOString(),
    }));

    const insertResult = await adminClient.from('scheduled_notifications').insert(rows);
    return { queued: insertResult.error ? 0 : rows.length };
  } catch (error) {
    console.error('[release-reminders] enqueueReleaseReminders failed', error);
    return { queued: 0 };
  }
}
