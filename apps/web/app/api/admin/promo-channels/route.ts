import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import {
  loadAdminPromoChannels,
  reviewPromoChannel,
  type PromoReviewDecision,
} from '@/lib/promo-channels-server';

/**
 * /api/admin/promo-channels: review suggested promo channels (GitHub #833).
 * GET lists what is waiting and what is listed; PATCH { id, decision } lists,
 * rejects or takes one down. ADMIN_EMAILS on every method; the table has no
 * write policy for anyone else.
 */

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  try {
    return NextResponse.json(await loadAdminPromoChannels(admin.supabaseAdmin as SupabaseClient), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not read promo channels.' },
      { status: 500 }
    );
  }
}

const DECISIONS: readonly PromoReviewDecision[] = ['list', 'reject', 'unlist'];

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; decision?: unknown };
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const decision = DECISIONS.find((value) => value === body.decision);
  if (!id || !decision) {
    return NextResponse.json({ error: 'Choose a channel and what to do with it.' }, { status: 400 });
  }

  const done = await reviewPromoChannel(admin.supabaseAdmin as SupabaseClient, id, decision, admin.userId);
  if (!done) {
    return NextResponse.json({ error: 'It changed since you loaded the page. Refresh and try again.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
