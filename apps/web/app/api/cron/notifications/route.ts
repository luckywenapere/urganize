import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/tasks-server';
import { flushDueNotifications } from '@/lib/engagement-server';

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
  return NextResponse.json({ ok: true, ...result });
}
