import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getNeonClient, internalAccountEmails, verifyAdmin } from '../_shared';
import { loadUsageMetrics } from '@/lib/usage-metrics-server';

// GET /api/admin/metrics — the usage dashboard (2026-10-07): who is online now,
// daily / weekly / monthly active people, rollouts and how their plans were
// made, accounts, work done, and who has gone quiet. Worked out from the
// database on every load; nothing is stored. The page calls it every minute
// while it is open.
//
// Gated by ADMIN_EMAILS through verifyAdmin like every admin route, and not
// flag-gated: the /admin/teams precedent.
//
// "Our team" (ADMIN_EMAILS plus the optional METRICS_INTERNAL_EMAILS) is left
// out of every number unless ?team=1. The response names who was left out.
// The list itself is internalAccountEmails in ../_shared (shared with the
// cockpit and the Scoreboard since 2026-10-10).

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** The marketing site's waitlist size, or null when it cannot be read. */
async function readWaitlistTotal(): Promise<number | null> {
  const sql = getNeonClient();
  if (!sql) return null;
  try {
    const rows = (await sql`SELECT COUNT(*)::int AS total FROM "User"`) as Array<{ total: number }>;
    const total = rows[0]?.total;
    return typeof total === 'number' ? total : null;
  } catch (error) {
    console.warn('[admin-metrics] could not read the waitlist', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const client = admin.supabaseAdmin as SupabaseClient;
  const includeTeam = request.nextUrl.searchParams.get('team') === '1';

  try {
    const waitlistTotal = await readWaitlistTotal();
    const { metrics, sources, hiddenEmails } = await loadUsageMetrics(client, new Date(), {
      hiddenEmails: includeTeam ? new Set() : internalAccountEmails(),
      waitlistTotal,
    });
    return NextResponse.json(
      { metrics, sources, hiddenEmails, includeTeam },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[admin-metrics] could not build the metrics', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not build the metrics.' },
      { status: 500 }
    );
  }
}
