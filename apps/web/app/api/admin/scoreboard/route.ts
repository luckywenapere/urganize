import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import { buildScoreboard } from '@/lib/scoreboard';
import { loadScoreboardInput } from '@/lib/scoreboard-server';

// GET /api/admin/scoreboard — the company scoreboard from the strategy doc
// (docs/strategy/company-strategy.md, sections 2 and 7), worked out from the
// database on every load. Nothing is stored.
//
// Gated by ADMIN_EMAILS through verifyAdmin like every admin route, and not
// flag-gated: the /admin/teams precedent, so the founder can watch it from day
// one.
//
// It reads a lot of rows (every team, release and activity, plus 120 days of
// activity across eighteen tables), so it gets the full minute the plan allows.

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const client = admin.supabaseAdmin as SupabaseClient;

  try {
    const { input, sources } = await loadScoreboardInput(client, new Date());
    return NextResponse.json(
      { scoreboard: buildScoreboard(input), sources },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[admin-scoreboard] could not build the scoreboard', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not build the scoreboard.' },
      { status: 500 }
    );
  }
}
