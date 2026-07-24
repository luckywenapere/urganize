import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import {
  PUSH_SUBSCRIPTIONS_TABLE,
  isWebPushConfigured,
  sendPushToAllUsers,
} from '@/lib/push-server';

// Founder broadcast (2026-07-23): the admin "send a notification to every
// user" surface the push wiring was built for. Gated by ADMIN_EMAILS via
// verifyAdmin — same allowlist as the other admin routes; this is NOT a
// workspace-role check, it's app-operator access.

type BroadcastBody = {
  title?: unknown;
  body?: unknown;
  url?: unknown;
};

const trim = (value: unknown): string => String(value || '').trim();

/** GET — reach preview: how many devices/users a broadcast would hit. */
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const client = admin.supabaseAdmin as SupabaseClient;
  const { data, error } = await client
    .from(PUSH_SUBSCRIPTIONS_TABLE)
    .select('user_id');

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not load reach.' }, { status: 500 });
  }

  const rows = Array.isArray(data) ? (data as Array<{ user_id: string }>) : [];
  return NextResponse.json({
    configured: isWebPushConfigured(),
    devices: rows.length,
    users: new Set(rows.map((row) => row.user_id)).size,
  });
}

/** POST — send { title, body, url? } to every registered device. */
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { error: 'Web Push is not configured on this deployment (VAPID keys missing).' },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as BroadcastBody;
  const title = trim(body.title).slice(0, 80);
  const message = trim(body.body).slice(0, 300);
  const url = trim(body.url);

  if (!title || !message) {
    return NextResponse.json({ error: 'Title and message are both required.' }, { status: 400 });
  }
  // Clicks only ever open in-app paths — never external URLs.
  if (url && (!url.startsWith('/') || url.startsWith('//'))) {
    return NextResponse.json({ error: 'Link must be an in-app path (e.g. /dashboard).' }, { status: 400 });
  }

  const result = await sendPushToAllUsers(admin.supabaseAdmin as SupabaseClient, {
    title,
    body: message,
    url: url || '/dashboard',
    // One broadcast replaces a previous unread one instead of stacking.
    tag: 'urganize-broadcast',
  });

  return NextResponse.json({ ok: true, sent: result.sent, pruned: result.pruned });
}
