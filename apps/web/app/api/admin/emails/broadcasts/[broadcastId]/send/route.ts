import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../_shared';
import { broadcastExists, loadBroadcastCounts } from '@/lib/email/broadcast-server';
import { drainEmailOutbox } from '@/lib/email/outbox-server';
import { budgetPayload } from '../../../_compose';

export const maxDuration = 60;

/**
 * POST /api/admin/emails/broadcasts/[broadcastId]/send — send the next few of
 * one broadcast, then report where it has got to. The admin page calls this
 * again until nothing is left or the day's limit is reached. Each call stops
 * after about 20 seconds, so it always answers inside the request.
 *
 * Safe to call twice at once, or alongside the morning cron: every row is
 * claimed before it is sent, so nobody can get the email twice.
 *
 * Admin only (ADMIN_EMAILS).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ broadcastId: string }> }) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const { broadcastId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(broadcastId) || !(await broadcastExists(admin.supabaseAdmin, broadcastId))) {
    return NextResponse.json({ error: 'That email was not found.' }, { status: 404 });
  }

  const run = await drainEmailOutbox(admin.supabaseAdmin, { batchId: broadcastId, timeBudgetMs: 20_000, maxSends: 40 });
  const [counts, budget] = await Promise.all([
    loadBroadcastCounts(admin.supabaseAdmin, broadcastId),
    budgetPayload(admin.supabaseAdmin),
  ]);

  return NextResponse.json({ run, counts, budget });
}
