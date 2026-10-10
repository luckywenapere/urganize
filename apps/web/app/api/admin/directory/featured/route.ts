import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../../_shared';
import {
  addFeaturedPick,
  loadFeaturedForAdmin,
  loadRisingForAdmin,
  removeFeaturedPick,
} from '@/lib/directory-featuring-server';

/**
 * /api/admin/directory/featured: who Urganize has picked for the Featured shelf
 * (directory spec, section 6), and who "On the rise" has this month.
 *
 * FEATURED IS THE FOUNDER'S TO GIVE, which is why this is an admin route and
 * nothing a signed-in person can reach: the table has no client policy at all.
 * A pick is a published, claimed profile for one role for a quarter, at most six
 * per role; addFeaturedPick holds all three and says which one refused.
 *
 * NOT flag-gated, the /admin/directory precedent: the founder should be able to
 * line up the first shelf before the directory is switched on for anyone else.
 * Every handler answers verifyAdmin first.
 */

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const client = admin.supabaseAdmin as SupabaseClient;

  const [picks, rising] = await Promise.all([loadFeaturedForAdmin(client), loadRisingForAdmin(client)]);
  return NextResponse.json({ ...picks, rising });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const client = admin.supabaseAdmin as SupabaseClient;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await addFeaturedPick(client, {
    userId: body?.userId,
    role: body?.role,
    startsOn: body?.startsOn,
    note: body?.note,
    pickedBy: admin.userId,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(
    { id: result.id, startsOn: result.startsOn, endsOn: result.endsOn },
    { status: 201 }
  );
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const client = admin.supabaseAdmin as SupabaseClient;

  const id = new URL(request.url).searchParams.get('id') || '';
  const result = await removeFeaturedPick(client, id.trim());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
