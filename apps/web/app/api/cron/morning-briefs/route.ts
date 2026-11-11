import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/tasks-server';
import { runMorningBriefs } from '@/lib/chappi/morning-brief-server';

// The morning brief (#1207), run by Supabase pg_cron every ten minutes from
// 07:00 to 08:50 UTC, which is 08:00 to 09:50 Lagos (migration
// 20261111120000_one_assistant_chat_and_morning_brief.sql). Each call writes
// the briefs still missing for today until its time runs out; a brief is
// written at most once per person per day (morning_briefs is the lock).
//
// pg_cron and not Vercel Cron for the same reason as pitch payments: the
// Vercel plan's two daily slots are taken. Authenticated by the shared
// CRON_SECRET, because no user session exists here.
export const maxDuration = 60;

const TIME_BUDGET_MS = 45_000;

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

  const result = await runMorningBriefs(adminClient, { timeBudgetMs: TIME_BUDGET_MS });
  return NextResponse.json({ ok: true, ...result });
}
