// SERVER ONLY — the engagement drip (founder request, 2026-07-23).
//
// On every login the app pings /api/engagement/login-ping, which:
//   1. sends a WELCOME push right away (once per 6h, so daily/multi-device
//      logins don't spam),
//   2. cancels the user's pending LOGIN-DRIP rows and re-queues the drip:
//      momentum +30m, then come-back reminders +1d / +7d / +14d / +30d.
// Because the queue resets on every login, the long-range reminders behave
// as "days since the last visit" — nobody gets a "we miss you" the day
// after they showed up.
//
// The cancel in step 2 is scoped to DRIP_STEPS' own kinds (see
// enqueueLoginDrip below) — mobile push notifications (2026-08-10) added
// other scheduled_notifications producers (release reminders, weekly
// motivational nudges), and an unscoped "cancel everything pending" would
// wipe those out on the next login. If you add a new kind anywhere in this
// file, scope its cancellation the same way.
//
// Delivery: flushDueNotifications() runs from /api/cron/notifications
// (Vercel Cron) and opportunistically from the login-ping route, so due
// messages go out even between cron ticks. Every function here is tolerant
// of the scheduled_notifications table not existing yet (pre-migration
// environments no-op).

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPushToUsers, type PushPayload } from '@/lib/push-server';

export const SCHEDULED_NOTIFICATIONS_TABLE = 'scheduled_notifications';

// How recently a welcome must have been sent for us to skip sending
// another (multi-device / several-logins-a-day dampener).
const WELCOME_COOLDOWN_MS = 6 * 60 * 60 * 1000;

type DripStep = {
  kind: string;
  delayMinutes: number;
  title: string;
  body: string;
  url: string;
};

// The copy is deliberately energizing, plain-English, and in the product's
// voice (releases + activities, momentum framing). Edit freely — copy
// changes here don't need schema or delivery changes.
export const WELCOME_STEP: DripStep = {
  kind: 'welcome',
  delayMinutes: 0,
  title: 'You showed up — that’s the hard part',
  body: 'Your releases are lined up and listening. Knock one activity out while you’re here.',
  url: '/dashboard',
};

export const DRIP_STEPS: DripStep[] = [
  {
    kind: 'momentum_30m',
    delayMinutes: 30,
    title: 'Keep the streak alive',
    body: 'One more activity checked off today puts tomorrow ahead of schedule.',
    url: '/dashboard',
  },
  {
    kind: 'comeback_1d',
    delayMinutes: 24 * 60,
    title: 'Your rollout kept counting',
    body: 'A day has passed on the release clock. Come see what’s due and keep it on time.',
    url: '/dashboard',
  },
  {
    kind: 'comeback_7d',
    delayMinutes: 7 * 24 * 60,
    title: 'A week is a long time in music',
    body: 'Your release plan hasn’t stopped. Drop in, check your progress, move one thing forward.',
    url: '/dashboard',
  },
  {
    kind: 'comeback_14d',
    delayMinutes: 14 * 24 * 60,
    title: 'The stage misses you',
    body: 'Two weeks away. Five minutes today gets the rollout breathing again.',
    url: '/dashboard',
  },
  {
    kind: 'comeback_30d',
    delayMinutes: 30 * 24 * 60,
    title: 'Great releases don’t ship themselves',
    body: 'It’s been a month. Open Urganize, pick one activity, and get the machine moving.',
    url: '/dashboard',
  },
];

// The set of kinds enqueueLoginDrip is allowed to cancel on a fresh login —
// deliberately just this drip's own steps, not "everything pending" (see
// the header comment above).
const DRIP_KINDS: string[] = DRIP_STEPS.map((step) => step.kind);

/** Welcome push + fresh drip for a user who just logged in. Never throws. */
export async function enqueueLoginDrip(
  adminClient: SupabaseClient,
  userId: string
): Promise<{ welcomed: boolean; queued: number }> {
  try {
    // 1. Welcome, unless one already went out recently.
    let welcomed = false;
    const cutoffIso = new Date(Date.now() - WELCOME_COOLDOWN_MS).toISOString();
    const recentWelcome = await adminClient
      .from(SCHEDULED_NOTIFICATIONS_TABLE)
      .select('id')
      .eq('user_id', userId)
      .eq('kind', WELCOME_STEP.kind)
      .gte('created_at', cutoffIso)
      .limit(1)
      .maybeSingle();

    if (recentWelcome.error) {
      // Table missing (pre-migration) or transient error — no-op quietly.
      return { welcomed: false, queued: 0 };
    }

    const nowIso = new Date().toISOString();

    if (!recentWelcome.data) {
      const payload: PushPayload = {
        title: WELCOME_STEP.title,
        body: WELCOME_STEP.body,
        url: WELCOME_STEP.url,
        tag: `urganize-${WELCOME_STEP.kind}`,
      };
      await sendPushToUsers(adminClient, [userId], payload);
      welcomed = true;
      // Record the send so the cooldown has something to check.
      await adminClient.from(SCHEDULED_NOTIFICATIONS_TABLE).insert({
        user_id: userId,
        kind: WELCOME_STEP.kind,
        title: WELCOME_STEP.title,
        body: WELCOME_STEP.body,
        url: WELCOME_STEP.url,
        send_at: nowIso,
        sent_at: nowIso,
      });
    }

    // 2. Reset the drip: cancel this drip's OWN pending rows, queue the
    // fresh schedule. Scoped to DRIP_STEPS' kinds so other
    // scheduled_notifications producers (release reminders, weekly
    // motivational nudges) are untouched by a login.
    await adminClient
      .from(SCHEDULED_NOTIFICATIONS_TABLE)
      .update({ canceled_at: nowIso })
      .eq('user_id', userId)
      .in('kind', DRIP_KINDS)
      .is('sent_at', null)
      .is('canceled_at', null);

    const rows = DRIP_STEPS.map((step) => ({
      user_id: userId,
      kind: step.kind,
      title: step.title,
      body: step.body,
      url: step.url,
      send_at: new Date(Date.now() + step.delayMinutes * 60 * 1000).toISOString(),
    }));
    const insertResult = await adminClient.from(SCHEDULED_NOTIFICATIONS_TABLE).insert(rows);

    return { welcomed, queued: insertResult.error ? 0 : rows.length };
  } catch (error) {
    console.error('[engagement] enqueueLoginDrip failed', error);
    return { welcomed: false, queued: 0 };
  }
}

/** Send everything due. Rows are marked sent even when the user has no
 * registered devices — a reminder is a moment, not a debt to retry
 * forever. Never throws. */
export async function flushDueNotifications(
  adminClient: SupabaseClient,
  limit = 50
): Promise<{ processed: number; delivered: number }> {
  try {
    const nowIso = new Date().toISOString();
    const dueResult = await adminClient
      .from(SCHEDULED_NOTIFICATIONS_TABLE)
      .select('id,user_id,kind,title,body,url')
      .is('sent_at', null)
      .is('canceled_at', null)
      .lte('send_at', nowIso)
      .order('send_at', { ascending: true })
      .limit(limit);

    if (dueResult.error || !Array.isArray(dueResult.data) || dueResult.data.length === 0) {
      return { processed: 0, delivered: 0 };
    }

    let delivered = 0;
    for (const row of dueResult.data as Array<{
      id: string;
      user_id: string;
      kind: string;
      title: string;
      body: string;
      url: string;
    }>) {
      // Mark sent FIRST (claim) so overlapping flushers can't double-send.
      const claim = await adminClient
        .from(SCHEDULED_NOTIFICATIONS_TABLE)
        .update({ sent_at: new Date().toISOString() })
        .eq('id', row.id)
        .is('sent_at', null)
        .select('id')
        .maybeSingle();
      if (claim.error || !claim.data) continue;

      // Tag by kind, not a shared 'urganize-engagement' string — otherwise a
      // release reminder and a comeback nudge (both delivered through this
      // same flusher) would collapse-replace each other in the system tray
      // instead of each getting its own notification.
      const result = await sendPushToUsers(adminClient, [row.user_id], {
        title: row.title,
        body: row.body,
        url: row.url || '/dashboard',
        tag: `urganize-${row.kind}`,
      });
      if (result.sent > 0) delivered += 1;
    }

    return { processed: dueResult.data.length, delivered };
  } catch (error) {
    console.error('[engagement] flushDueNotifications failed', error);
    return { processed: 0, delivered: 0 };
  }
}
