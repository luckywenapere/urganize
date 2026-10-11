import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import { addFeatured, loadAdminFeatured, removeFeatured } from '@/lib/featured-shelves-server';

/**
 * /api/admin/featured: the hand-picked shelf above the directory.
 *
 * Urganize signs off every name, so this is the only way in: ADMIN_EMAILS on
 * every method, and the table has no write policy for anyone else. NOT flag
 * gated, the /admin/teams precedent, so the shelf can be filled before the
 * directory page shows it.
 *
 * The rules live in lib/featured-shelves.ts (only a published profile, six per
 * role, one quarter, a role the person holds) and the database trigger repeats
 * the first two. There is no price or payment field here, on purpose.
 */

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  try {
    return NextResponse.json(await loadAdminFeatured(admin.supabaseAdmin as SupabaseClient), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not read the shelf.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as {
    profileId?: unknown;
    role?: unknown;
    quarter?: unknown;
  };
  const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : '';
  const role = typeof body.role === 'string' ? body.role.trim() : '';
  const quarter = body.quarter === 'next' ? 'next' : body.quarter === 'current' ? 'current' : null;
  if (!profileId || !role || !quarter) {
    return NextResponse.json({ error: 'Choose a person, a role and a quarter.' }, { status: 400 });
  }

  const result = await addFeatured(admin.supabaseAdmin as SupabaseClient, {
    profileId,
    role,
    quarter,
    adminUserId: admin.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
  }
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const id = request.nextUrl.searchParams.get('id')?.trim() || '';
  if (!id) return NextResponse.json({ error: 'Choose who to remove.' }, { status: 400 });

  const removed = await removeFeatured(admin.supabaseAdmin as SupabaseClient, id);
  if (!removed) return NextResponse.json({ error: 'Could not remove them.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
