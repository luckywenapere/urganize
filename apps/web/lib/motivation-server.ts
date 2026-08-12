// SERVER ONLY — weekly motivational nudges (mobile push notifications,
// 2026-08-10). Runs from the existing due-date cron
// (app/api/cron/due-date-notifications/route.ts) rather than a new Vercel
// Cron entry: daily runs cover a weekly cadence with room to drain a
// backlog, since the gate below is "has this user had one in the last 7
// days" rather than anything tied to how often the sweep fires.
//
// Corrected 2026-08-12: this said "hourly", and justified itself partly on
// "2 cron entries already, implying a paid Vercel plan". Both were wrong.
// The account is on Hobby, which caps crons at once per day, and the two
// entries had never run at all because they were declared in a vercel.json
// Vercel does not read (see CLAUDE.md → Deployment). Cadence-independence is
// the real reason this is safe to piggyback, so that is what is written here
// now.
//
// Delivery record: rather than a dedicated table, each send is recorded as
// a `kind: 'motivational'` row in scheduled_notifications with
// send_at === sent_at === now — the exact shape engagement-server.ts's
// WELCOME_STEP already uses for an immediate (non-delayed) send. That gives
// this sweep the "last sent" and "how many sent so far" queries for free
// from a table that already exists.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPushToUsers } from '@/lib/push-server';
import { getNotificationPresets } from '@/lib/notification-presets-server';

export const MOTIVATIONAL_KIND = 'motivational';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type ProfileRow = { id: string };

/** Sends the next motivational nudge to every opted-in user who hasn't had
 * one in the last 7 days, up to `limit` per run. Never throws. */
export async function sendWeeklyMotivationalNudges(
  adminClient: SupabaseClient,
  limit = 200
): Promise<{ sent: number }> {
  try {
    const presets = await getNotificationPresets(adminClient);
    if (!presets.motivational.enabled || presets.motivational.pool.length === 0) {
      return { sent: 0 };
    }

    // motivational_nudges is nullable pre-migration; `!= false` treats null
    // the same as true, matching every other per-user toggle in this app
    // (ask_after_tasks follows the same "undefined counts as on" rule).
    const profilesResult = await adminClient
      .from('profiles')
      .select('id')
      .or('motivational_nudges.is.null,motivational_nudges.eq.true')
      .limit(limit);

    if (profilesResult.error || !Array.isArray(profilesResult.data)) {
      return { sent: 0 };
    }

    const weekAgoIso = new Date(Date.now() - WEEK_MS).toISOString();
    let sent = 0;

    for (const profile of profilesResult.data as ProfileRow[]) {
      const recent = await adminClient
        .from('scheduled_notifications')
        .select('id')
        .eq('user_id', profile.id)
        .eq('kind', MOTIVATIONAL_KIND)
        .gte('created_at', weekAgoIso)
        .limit(1);

      if (recent.error) continue;
      if (Array.isArray(recent.data) && recent.data.length > 0) continue; // sent within the last 7 days

      const priorCountResult = await adminClient
        .from('scheduled_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('kind', MOTIVATIONAL_KIND);

      const priorCount = priorCountResult.count ?? 0;
      const nudge = presets.motivational.pool[priorCount % presets.motivational.pool.length];

      const nowIso = new Date().toISOString();
      await sendPushToUsers(adminClient, [profile.id], {
        title: nudge.title,
        body: nudge.body,
        url: '/dashboard',
        tag: `urganize-${MOTIVATIONAL_KIND}`,
      });

      // Recorded even when the user has no registered devices — a
      // motivational moment is not a debt to retry, the same philosophy
      // flushDueNotifications uses.
      await adminClient.from('scheduled_notifications').insert({
        user_id: profile.id,
        kind: MOTIVATIONAL_KIND,
        title: nudge.title,
        body: nudge.body,
        url: '/dashboard',
        send_at: nowIso,
        sent_at: nowIso,
      });

      sent += 1;
    }

    return { sent };
  } catch (error) {
    console.error('[motivation] sendWeeklyMotivationalNudges failed', error);
    return { sent: 0 };
  }
}
