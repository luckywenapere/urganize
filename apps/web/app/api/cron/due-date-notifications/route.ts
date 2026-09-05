import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createDueDateNotificationsForAllUsers } from '@/lib/tasks-server';
import { sendWeeklyMotivationalNudges } from '@/lib/motivation-server';
import { runTrialEndingSweep } from '@/lib/billing-alerts-server';
import { runDeliveryReconcile } from '@/lib/delivery-records-server';

// Scheduled sweep — see apps/web/vercel.json for the cron schedule. Vercel
// Cron automatically sends `Authorization: Bearer ${CRON_SECRET}` when that
// env var is set on the project, which is what this checks. No user session
// exists here, so this is the one open route that authenticates via a
// shared secret instead of getAuthenticatedUser.
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
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const adminClient = createAdminClient(supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  await createDueDateNotificationsForAllUsers(adminClient);

  // Weekly motivational nudges (mobile push notifications, 2026-08-10)
  // piggyback on this same run rather than a new cron entry — see
  // lib/motivation-server.ts for why a daily cadence safely covers a
  // weekly send. (This cron was hourly on paper until 2026-08-12, when it
  // turned out it had never actually run: the schedule lived in a vercel.json
  // Vercel does not read, and hourly is not allowed on the Hobby plan anyway.)
  await sendWeeklyMotivationalNudges(adminClient);

  // Teams entering the last 3 days of their trial (2026-08-21). Same reasoning
  // as the nudges above: no new cron entry, because the Hobby plan caps
  // schedules at once a day and "entered the last 3 days" is a day-granularity
  // question anyway. No-ops entirely while the hard-paywall flag is off, and
  // deduped per team so repeated runs cannot re-announce the same trial.
  const trialSweep = await runTrialEndingSweep(adminClient);

  // The directory's delivery records (2026-09-05). The third passenger on this
  // cron, for the reason the two above give: both schedule slots are taken and
  // the Hobby plan caps them at one a day.
  //
  // It rides HERE rather than hooking task completion, and that is a decision
  // rather than convenience. A task reaches 'done' through two divergent
  // server paths whose only shared column is `status`, so a completion hook
  // would mean two hook points on the hottest write path — and it would still
  // miss the case that needs it most, a release DATE passing, where no write
  // happens at all. This sweep covers both.
  //
  // Reconciles rather than only adding: a reassigned or reopened task makes an
  // old record untrue, and a derived table has to match its derivation. It
  // never throws, so a bad sweep cannot take the notifications above down with
  // it, and it no-ops harmlessly while the directory flag is off since nothing
  // reads what it writes.
  const directorySweep = await runDeliveryReconcile(adminClient);

  return NextResponse.json({ ok: true, trialSweep, directorySweep });
}
