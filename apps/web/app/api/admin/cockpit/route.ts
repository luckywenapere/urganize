import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import { buildScoreboard } from '@/lib/scoreboard';
import { buildFounderCockpit } from '@/lib/founder-cockpit';
import { loadScoreboardInput } from '@/lib/scoreboard-server';

// GET /api/admin/cockpit — the founder cockpit at the top of /admin
// (2026-10-09). The Scoreboard's own reads and definitions, plus which way each
// number moved this week and which teams need a message. Read-only: nothing is
// stored or written.
//
// Gated by ADMIN_EMAILS through verifyAdmin like every admin route, and not
// flag-gated (the /admin/scoreboard precedent). It reads the same rows as the
// Scoreboard, so it gets the same full minute.

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const client = admin.supabaseAdmin as SupabaseClient;

  try {
    const { input, sources } = await loadScoreboardInput(client, new Date());
    const board = buildScoreboard(input);
    return NextResponse.json(
      { cockpit: buildFounderCockpit(input, board), sources },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[admin-cockpit] could not build the cockpit', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not build the cockpit.' },
      { status: 500 }
    );
  }
}
