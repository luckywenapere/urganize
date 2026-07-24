import { NextResponse, type NextRequest } from 'next/server';
import { requireAuthenticatedAdmin } from '@/lib/tasks-server';
import { enqueueLoginDrip, flushDueNotifications } from '@/lib/engagement-server';

// Called once per app session right after auth resolves (AppShell). Sends
// the welcome push (6h cooldown) and resets the user's engagement drip —
// see lib/engagement-server.ts for the full schedule and rationale. Also
// opportunistically flushes a small batch of DUE rows so short-delay steps
// (the +30m momentum nudge) go out near-time even between cron ticks.
export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const result = await enqueueLoginDrip(auth.adminClient, auth.user.id);
  const flush = await flushDueNotifications(auth.adminClient, 20);

  return NextResponse.json({ ok: true, ...result, flushed: flush.processed });
}
