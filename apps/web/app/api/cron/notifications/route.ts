import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/tasks-server';
import { flushDueNotifications } from '@/lib/engagement-server';
import { drainEmailOutbox } from '@/lib/email/outbox-server';
import { PUSH_FLUSH_BUDGET_MS, emailBudgetMs } from '@/lib/push-limits';
import { runWeeklyGrantSuggestions } from '@/lib/grants/weekly-run-server';
import { GRANT_RUN_BUDGET_MS } from '@/lib/grants/weekly-run';
import { runPauseSweep } from '@/lib/cancel-flow-server';
import { runFrontDeskDigest } from '@/lib/front-desk/digest-server';
import { runRenewalReminderSweep, runSelfServeNudgeSweep } from '@/lib/self-serve-lifecycle-server';

// The push flush and the outbox drain below share this minute (lib/push-limits.ts).
export const maxDuration = 60;

// Scheduled flusher for the engagement drip — see apps/web/vercel.json for
// the cron schedule and lib/engagement-server.ts for what gets queued.
// Same shared-secret auth as the due-date cron: Vercel Cron sends
// `Authorization: Bearer ${CRON_SECRET}` automatically when that env var is
// set on the project.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const adminClient = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  // The push flush and the email drain share one 60 second function. The flush
  // stops starting sends after PUSH_FLUSH_BUDGET_MS and the drain gets what is
  // left, so a slow push service can no longer starve the email outbox.
  const startedAt = Date.now();
  // Suggested grants (2026-10-11, flag NEXT_PUBLIC_FEATURE_GRANT_SUGGESTIONS):
  // the weekly run for the teams whose weekday slot is today. Database reads
  // only, no web search, bounded by its own small budget. It runs BEFORE the
  // push flush because it queues each team's phone push in
  // scheduled_notifications, and the flush then sends it this same morning. The
  // email drain is handed whatever is left. Never throws, does nothing while the
  // flag is off.
  const grants = await runWeeklyGrantSuggestions(adminClient, { timeBudgetMs: GRANT_RUN_BUDGET_MS });

  const result = await flushDueNotifications(adminClient, 100, { timeBudgetMs: PUSH_FLUSH_BUDGET_MS });

  // The cancel flow's pause sweep (2026-10-14): reminders before a pause ends
  // and the end itself. Another passenger, for the same two-schedule reason.
  // Small (rows with a pause window only), never throws, never charges.
  // Before the drain, which is handed whatever time is left.
  const pauses = await runPauseSweep(adminClient);

  // UrgAns front desk (URG-381): the one daily digest of questions UrgAns could
  // not answer for a curator. Flagged curators only, never throws, own budget.
  const frontDesk = await runFrontDeskDigest(adminClient);

  // Self-serve checkout (2026-10-22): the day 1/3/7 nudges to teams that paid
  // at checkout, and the 7/3/1-day renewal reminders for transfer periods. Each
  // email once (a lifecycle_sends row), inside the day's budget, never throws.
  const selfServeNudges = await runSelfServeNudgeSweep(adminClient);
  const renewalReminders = await runRenewalReminderSweep(adminClient);

  // The email outbox (2026-09-30): the onboarding sequence's days 2 to 7, and
  // any broadcast the day's email limit held back. A passenger on this cron for
  // the reason the due-date cron gives for its own: the Hobby plan allows two
  // schedules, both taken, once a day each. This one runs at 09:00 Lagos, which
  // is when the sequence is meant to land. It never throws, keeps inside the
  // daily limit, and does nothing for the sequence while
  // EMAIL_ONBOARDING_SEQUENCE is off.
  const email = await drainEmailOutbox(adminClient, {
    timeBudgetMs: emailBudgetMs(Date.now() - startedAt),
    maxSends: 80,
  });

  return NextResponse.json({ ok: true, ...result, email, grants, pauses, frontDesk, selfServeNudges, renewalReminders });
}
