import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import { parseRunwayInput } from '@/lib/admin-runway';
import { clearRunwaySettings, readRunwaySettings, saveRunwaySettings } from '@/lib/admin-runway-server';

// /api/admin/runway — the founder's cash and monthly spend for the cockpit's
// runway and default-alive tiles (iteration 6, 2026-10-10). Typed in by hand on
// /admin; kept in app_settings (lib/admin-runway-server.ts), service role only.
//
//   GET    the figures as stored, or null.
//   PUT    save { currency, cash, monthlyBurn, asOf, ngnPerUsd } after checking
//          every field (lib/admin-runway.ts parseRunwayInput).
//   DELETE forget them.
//
// Every method passes verifyAdmin (ADMIN_EMAILS) first. Internal, so no flag.
// The numbers themselves are worked out by GET /api/admin/cockpit.

export const dynamic = 'force-dynamic';

/** A runway form is a few short fields; anything bigger is not one. */
const MAX_BODY_BYTES = 2_000;

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const { settings, source } = await readRunwaySettings(admin.supabaseAdmin as SupabaseClient, new Date());
  if (source.status !== 'ok') {
    return NextResponse.json({ error: 'Could not read the runway figures.' }, { status: 500 });
  }
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const text = await request.text().catch(() => '');
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Too much was sent.' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Send the figures as JSON.' }, { status: 400 });
  }

  const now = new Date();
  const parsed = parseRunwayInput(body, now);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const saved = await saveRunwaySettings(admin.supabaseAdmin as SupabaseClient, parsed.value, admin.userId, now);
  if (!saved.ok) {
    console.error('[admin-runway] could not save', saved.error);
    return NextResponse.json({ error: 'Could not save the runway figures.' }, { status: 500 });
  }
  return NextResponse.json({ settings: saved.settings }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const cleared = await clearRunwaySettings(admin.supabaseAdmin as SupabaseClient);
  if (!cleared.ok) {
    console.error('[admin-runway] could not clear', cleared.error);
    return NextResponse.json({ error: 'Could not clear the runway figures.' }, { status: 500 });
  }
  return NextResponse.json({ settings: null }, { headers: { 'Cache-Control': 'no-store' } });
}
