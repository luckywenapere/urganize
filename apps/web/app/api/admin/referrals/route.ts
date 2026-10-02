import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import { parseReferralAdminAction } from '@/lib/referrals';
import { applyReferralAdminAction, loadReferralOverview } from '@/lib/referrals-server';

// /api/admin/referrals — the founder's view of referral partners and what each
// is owed.
//
// GET lists every partner with its tagged teams, the payments that earn
// commission, and a month-by-month statement worked out fresh on every load.
// Nothing about the amounts is stored.
//
// POST runs one action: add a partner, switch one on or off, tag a team by hand,
// exclude or restore a payment (the way a refund is kept out), or record that a
// month was paid.
//
// Gated by ADMIN_EMAILS through verifyAdmin like every admin route. Deliberately
// NOT behind the referrals switch: money already owed has to stay payable
// whatever state the switch is in, and the founder should be able to add a
// partner before it goes on (the /admin/teams precedent).

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  try {
    const partners = await loadReferralOverview(
      admin.supabaseAdmin as SupabaseClient,
      new Date(),
      new URL(request.url).origin
    );
    return NextResponse.json({ partners }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[admin-referrals] could not load', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load referral partners.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = parseReferralAdminAction(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await applyReferralAdminAction(
    admin.supabaseAdmin as SupabaseClient,
    parsed.action,
    admin.userId
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, message: result.message });
}
