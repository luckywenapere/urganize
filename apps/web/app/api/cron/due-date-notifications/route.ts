import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createDueDateNotificationsForAllUsers } from '@/lib/tasks-server';
import { sendWeeklyMotivationalNudges } from '@/lib/motivation-server';
import { runTrialEndingSweep } from '@/lib/billing-alerts-server';
import { runDeliveryReconcile } from '@/lib/delivery-records-server';
import { runKitSnapshotSweep } from '@/lib/release-epk-snapshot-server';
import { runPitchWindowSweep } from '@/lib/pitch-payments-server';
import { runEditorialPitchReminderSweep } from '@/lib/editorial-pitch-server';
import { runPaybackQuestionSweep, runSpendCreditsSweep } from '@/lib/release-spend-sweeps-server';

/** Oct 16, 2026 feature cuts (URG-319). */
const PAYBACK_QUESTION_CUT = true;
import { runWorkRequestExpirySweep } from '@/lib/work-request-expiry-server';
import { runCreditProfileSweepIfEnabled } from '@/lib/claim-sweep-server';
import { runClaimAutoEmailSweep } from '@/lib/claim-auto-email-server';
import { runOnTheRiseSweep } from '@/lib/featured-shelves-server';

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

  // Press kit snapshots (2026-10-02). Another passenger, for the same
  // reason. A delivered release keeps the copy of its artist's kit it had
  // when it was delivered, so a later edit to the bio cannot rewrite what
  // was sent. A release becomes delivered when its date passes, where no
  // write happens, so this has to be a sweep. Never throws, does nothing
  // while the pitch kit flag is off, and a release already frozen is never
  // touched, so running it twice is harmless.
  const kitSnapshotSweep = await runKitSnapshotSweep(adminClient);

  // Curator pitch payments (2026-09-25): the missed-window sweep, as a
  // BACKSTOP. It runs every 15 minutes from Supabase pg_cron
  // (/api/cron/pitch-payments); running it here too means a paused pg_cron
  // costs a day, never a refund. Every step in it is conditional, so running
  // it twice is harmless. Not behind the feature flag, for the reason that
  // route gives, and it never throws.
  const pitchSweep = await runPitchWindowSweep(adminClient);

  // Spotify editorial pitch reminders (2026-10-09), at 28, 14 and 8 days before
  // release day. NOT the curator sweep above, despite the similar name: that one
  // is about paid pitches to playlist curators. This one reminds a team to send
  // Spotify its own editorial pitch before the window closes 7 days out. It
  // rides this cron because both schedule slots are taken, and "sent once" is
  // a row per reminder type, so running it twice is harmless. Never throws.
  const editorialPitchSweep = await runEditorialPitchReminderSweep(adminClient);

  // Release spend (brief 3, 2026-10-09), two steps. First the credits sweep:
  // each rollout's UrgAns credits for the last three finished Lagos days become
  // one automatic spend line, keyed on the rollout and the day, so running it
  // twice corrects a line and never doubles it. Then the payback question, asked
  // once 30 days after release day. Both ride this cron because both schedule
  // slots are taken, and neither throws.
  const spendCreditsSweep = await runSpendCreditsSweep(adminClient);
  // The payback question is cut (Oct 16, 2026 brief, URG-319): the spend
  // tracker it asks about is off the nav. The credits sweep above keeps
  // writing its automatic lines, so the record stays whole if spend returns.
  const paybackSweep = PAYBACK_QUESTION_CUT ? { skipped: 'cut' as const } : await runPaybackQuestionSweep(adminClient);

  // Directory work requests (2026-10-09): one nobody answered in seven days
  // closes, so the sender's slot is freed and the recipient's inbox stops
  // offering something already over. Another passenger, for the same reason
  // (two schedule slots, one run a day). Reads and routes already treat a stale
  // request as closed before this runs, so a missed day costs nothing but a
  // slot. Never throws, and is not behind the directory flag: a request already
  // sent keeps closing if the feature is switched off.
  const workRequestSweep = await runWorkRequestExpirySweep(adminClient);

  // Unclaimed profiles from credits (2026-10-10, Profiles and Directory spec,
  // Lane A). Another passenger, for the same reason. A collaborator credited on
  // a rollout that has come out gets a profile they can claim. It writes ONLY
  // while the admin has switched it on at /admin/claims (after reading a dry
  // run there), and never throws, so a bad run cannot take the steps above
  // down with it.
  const creditProfileSweep = await runCreditProfileSweepIfEnabled(adminClient);
  // The claim email sends itself (2026-10-11). Right after the step above, so
  // a page made this morning is emailed this morning: once per person, and one
  // reminder a week later if they have not claimed it. Another passenger, for
  // the same reason. Does nothing unless NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL
  // is on, stays inside the day's email budget, and never throws.
  const claimAutoEmail = await runClaimAutoEmailSweep(adminClient);
  // The directory's On the rise shelf (2026-10-10). Another passenger, for the
  // same reason. It only recomputes when the Lagos month changed, so on every
  // other day it costs one settings read, and it stays empty until thirty days of
  // task activity exist. Not behind the directory flag: it only writes picks
  // nothing shows while the page is dark. Never throws.
  const onTheRiseSweep = await runOnTheRiseSweep(adminClient);

  return NextResponse.json({
    ok: true,
    trialSweep,
    directorySweep,
    kitSnapshotSweep,
    pitchSweep,
    editorialPitchSweep,
    spendCreditsSweep,
    paybackSweep,
    workRequestSweep,
    creditProfileSweep,
    claimAutoEmail,
    onTheRiseSweep,
  });
}
