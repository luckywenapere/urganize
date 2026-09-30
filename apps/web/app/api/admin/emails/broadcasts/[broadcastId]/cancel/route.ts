import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../_shared';
import { broadcastExists, cancelBroadcast, loadBroadcastCounts } from '@/lib/email/broadcast-server';

/**
 * POST /api/admin/emails/broadcasts/[broadcastId]/cancel — stop a broadcast.
 * Everything still waiting is cancelled; what already went out stays out.
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

  const cancelled = await cancelBroadcast(admin.supabaseAdmin, broadcastId);
  if (cancelled === null) return NextResponse.json({ error: 'Could not stop it. Try again.' }, { status: 500 });

  return NextResponse.json({ cancelled, counts: await loadBroadcastCounts(admin.supabaseAdmin, broadcastId) });
}
