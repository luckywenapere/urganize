import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { internalAccountEmails, verifyAdmin } from '../_shared';
import { buildScoreboard } from '@/lib/scoreboard';
import { attachOwnerContacts, buildFounderCockpit, type FounderCockpit } from '@/lib/founder-cockpit';
import { scoreboardReadCache } from '@/lib/scoreboard-cache-server';
import { internalUserIds, withoutInternalAccounts } from '@/lib/admin-internal-accounts';
import { loadUsageMetrics } from '@/lib/usage-metrics-server';
import { buildAdminOverview } from '@/lib/admin-overview';
import { readAdminAttention } from '@/lib/admin-attention-server';

// GET /api/admin/overview — the one-screen admin Overview (2026-10-18,
// URG-369). The page calls it every minute while it is open.
//
// One shared Scoreboard read (lib/scoreboard-cache-server.ts, 60-second TTL,
// the same rows /admin/scoreboard and /admin/cockpit use) feeds both halves:
// the Metrics rules (lib/usage-metrics.ts) for the tiles and the Today rows,
// and the cockpit rules (lib/founder-cockpit.ts) for This week and Needs a
// message. So every number here matches the page it taps through to.
//
// Our own accounts are left out (internalAccountEmails, pattern-matched since
// URG-369). Read-only; gated by ADMIN_EMAILS through verifyAdmin.

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const client = admin.supabaseAdmin as SupabaseClient;
  const internalEmails = internalAccountEmails();

  try {
    const read = await scoreboardReadCache.get(client);
    const [{ metrics, sources }, attention] = await Promise.all([
      loadUsageMetrics(client, new Date(), { hiddenEmails: internalEmails, waitlistTotal: null, board: read }),
      readAdminAttention(client),
    ]);

    let cockpit: FounderCockpit | null = null;
    try {
      const exclusion = withoutInternalAccounts(read.input, internalUserIds(read.extras.emailByUserId, internalEmails));
      const board = buildScoreboard(exclusion.input);
      cockpit = buildFounderCockpit(exclusion.input, board);
      cockpit.atRisk = attachOwnerContacts(cockpit.atRisk, read.extras.ownerNames, read.extras.ownerEmails);
    } catch (error) {
      console.error('[admin-overview] could not build this week', error);
    }

    const partial = sources
      .filter((source) => source.status !== 'ok' || source.truncated)
      .map((source) => source.table);

    return NextResponse.json(
      { overview: buildAdminOverview({ metrics, cockpit, attention, partial }) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[admin-overview] could not build the overview', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not build the overview.' },
      { status: 500 }
    );
  }
}
