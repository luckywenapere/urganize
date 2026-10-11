import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../_shared';
import { loadClaimsQueue } from '@/lib/claim-admin-server';
import { resolveRemoval } from '@/lib/claim-server';
import { runCreditProfileSweep, setCreditSweepEnabled } from '@/lib/claim-sweep-server';

/**
 * The claims queue (Profiles and Directory spec, Lane A).
 *
 *   GET    the queue: unclaimed profiles with where each invite stands, removal
 *          requests with how long they have left, and whether the daily
 *          profile creation is switched on.
 *   POST   { mode: 'dry' | 'run' }. A dry run reports what would be made and
 *          writes nothing; read it before pressing run. Like the directory
 *          backfill.
 *   PATCH  { action: 'remove' | 'dismiss', requestId }: answer a removal
 *          request. { action: 'sweep', enabled }: switch the daily creation.
 *
 * Not behind any flag (the /admin/teams precedent): the founder should see it
 * before anything is switched on, and a removal request must stay answerable.
 */

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  return NextResponse.json(await loadClaimsQueue(admin.supabaseAdmin));
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Treated as a dry run below: the safe default.
  }
  const dryRun = body.mode !== 'run';
  return NextResponse.json(await runCreditProfileSweep(admin.supabaseAdmin, { dryRun }));
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid request body.' }, { status: 400 });
  }

  if (body.action === 'sweep') {
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Send enabled as true or false.' }, { status: 400 });
    }
    const ok = await setCreditSweepEnabled(admin.supabaseAdmin, body.enabled, admin.userId);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Could not save.' }, { status: 500 });
  }

  if ((body.action === 'remove' || body.action === 'dismiss') && typeof body.requestId === 'string') {
    const ok = await resolveRemoval(admin.supabaseAdmin, {
      requestId: body.requestId,
      action: body.action,
      adminId: admin.userId,
    });
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'That request is not open any more.' }, { status: 409 });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
