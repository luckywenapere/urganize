import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/tasks-server';
import { runPitchDailySweep, runPitchWindowSweep } from '@/lib/pitch-payments-server';

// Two sweeps, both run by Supabase pg_cron (migration
// 20260925140000_pitch_payments_cron.sql):
//
//   ?task=windows  every 15 minutes. Expires paid pitches whose reply window
//                  closed, refunds them, retries refunds that did not go
//                  through, and sends the one-day reminders.
//   ?task=daily    once a day. Reconciles the last 48 hours of Paystack pitch
//                  transactions against our records and refreshes the bank
//                  list.
//
// pg_cron and not Vercel Cron because the Vercel account is on the Hobby plan,
// which allows one run a day, and a missed window is supposed to refund within
// minutes rather than by tomorrow. The daily Vercel cron also runs the window
// sweep as a backstop, so a paused pg_cron costs a day, never a refund.
//
// NOT BEHIND THE FEATURE FLAG: a refund someone is owed must happen whether or
// not paid pitching is switched on today. With nothing ever paid, both sweeps
// find no rows. Authenticated the same way as the other cron routes, by the
// shared CRON_SECRET, because no user session exists here.
export const maxDuration = 60;

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

  const task = new URL(request.url).searchParams.get('task') || 'windows';
  if (task === 'windows') {
    const result = await runPitchWindowSweep(adminClient);
    return NextResponse.json({ ok: true, task, result });
  }
  if (task === 'daily') {
    const result = await runPitchDailySweep(adminClient);
    return NextResponse.json({ ok: true, task, result });
  }
  return NextResponse.json({ error: 'Unknown task.' }, { status: 400 });
}
