import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/tasks-server';
import { runPauseSweep } from '@/lib/cancel-flow-server';

// The cancel flow's pause sweep (2026-10-14): the "your pause ends soon" email
// a few days before, and the end of the pause on its date (window cleared, a
// one-tap resume emailed; nothing is ever charged here).
//
// It already runs once a day as a passenger on /api/cron/notifications, because
// the Vercel Hobby plan allows two schedules and both are taken. This route
// exists so it can also be called on its own (by hand, or from pg_cron like
// /api/cron/pitch-payments) with the shared CRON_SECRET.
//
// NOT BEHIND THE FEATURE FLAG: a pause someone already took has to end on the
// day it was promised whether or not the flow is switched on today.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }
  if ((request.headers.get('authorization') || '') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const adminClient = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }
  const result = await runPauseSweep(adminClient);
  return NextResponse.json({ ok: true, ...result });
}
