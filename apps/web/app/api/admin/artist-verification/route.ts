import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../_shared';
import { loadVerificationQueue, runAdminAction } from '@/lib/artist-verification-server';
import type { VerificationAction } from '@/lib/artist-verification';

/**
 * The artist verification queue (issue #1390).
 *
 *   GET    every artist that is checking, needs a fix, is verified or is taken
 *          down, with the latest screenshot signed so it can be opened.
 *   PATCH  { artistId, action, note? }: approve, ask_again (needs a note),
 *          remove_badge, take_down (needs a note) or bring_back. Each one emails
 *          and pushes the team.
 *
 * Not behind any flag (the /admin/claims precedent). Nothing here runs on a
 * timer: take_down is the only action that hides an artist, and only an admin
 * pressing it can do that.
 */

const ACTIONS: VerificationAction[] = ['approve', 'ask_again', 'remove_badge', 'take_down', 'bring_back'];

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  return NextResponse.json({ items: await loadVerificationQueue(admin.supabaseAdmin) });
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as { artistId?: unknown; action?: unknown; note?: unknown } | null;
  const artistId = typeof body?.artistId === 'string' ? body.artistId : '';
  const action = body?.action as VerificationAction;
  if (!artistId || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Send an artist and an action.' }, { status: 400 });
  }

  const result = await runAdminAction(admin.supabaseAdmin, {
    artistId,
    action,
    note: typeof body?.note === 'string' ? body.note : null,
    adminId: admin.userId,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  return NextResponse.json({ ok: true, status: result.status });
}
