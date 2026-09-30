import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/tasks-server';
import { flushDueNotifications } from '@/lib/engagement-server';
import { drainEmailOutbox } from '@/lib/email/outbox-server';

// The outbox drain below can take most of a minute on a busy morning.
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

  const result = await flushDueNotifications(adminClient, 100);

  // The email outbox (2026-09-30): the onboarding sequence's days 2 to 7, and
  // any broadcast the day's email limit held back. A passenger on this cron for
  // the reason the due-date cron gives for its own: the Hobby plan allows two
  // schedules, both taken, once a day each. This one runs at 09:00 Lagos, which
  // is when the sequence is meant to land. It never throws, keeps inside the
  // daily limit, and does nothing for the sequence while
  // EMAIL_ONBOARDING_SEQUENCE is off.
  const email = await drainEmailOutbox(adminClient, { timeBudgetMs: 40_000, maxSends: 80 });

  return NextResponse.json({ ok: true, ...result, email });
}
