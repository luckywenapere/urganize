import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import { getNotificationPresets, saveNotificationPresets } from '@/lib/notification-presets-server';
import { normalizeNotificationPresets } from '@/lib/notification-presets';

// Editable presets for release reminders, weekly motivational nudges, and
// deadline-tier copy (mobile push notifications, 2026-08-10). Gated by
// ADMIN_EMAILS via verifyAdmin — same allowlist as /admin/broadcast; this is
// app-operator access, not a workspace-role check.

/** GET — the effective presets right now (defaults if never edited). */
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const presets = await getNotificationPresets(admin.supabaseAdmin as SupabaseClient);
  return NextResponse.json({ presets });
}

/** PUT — replace the presets. The body is run through the same
 * normalizer GET's read path uses, so a partial or malformed payload never
 * corrupts a category — it just falls back to defaults field-by-field. */
export async function PUT(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const body = await request.json().catch(() => null);
  const presets = normalizeNotificationPresets(body);

  const result = await saveNotificationPresets(
    admin.supabaseAdmin as SupabaseClient,
    presets,
    admin.userId
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Could not save presets.' }, { status: 500 });
  }

  return NextResponse.json({ presets });
}
