import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createDueDateNotificationsForAllUsers } from '@/lib/tasks-server';
import { sendWeeklyMotivationalNudges } from '@/lib/motivation-server';

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

  return NextResponse.json({ ok: true });
}
