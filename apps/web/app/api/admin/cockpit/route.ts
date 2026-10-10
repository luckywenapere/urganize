import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getNeonClient, internalAccountEmails, verifyAdmin } from '../_shared';
import { buildScoreboard } from '@/lib/scoreboard';
import { attachOwnerContacts, buildFounderCockpit } from '@/lib/founder-cockpit';
import { buildFunnels, FUNNEL_WINDOWS, type WaitlistEntry } from '@/lib/admin-funnel';
import type { AdminReadSource } from '@/lib/admin-read-server';
import { scoreboardReadCache } from '@/lib/scoreboard-cache-server';
import { churnSummary } from '@/lib/admin-churn';
import { buildUrgansUsage } from '@/lib/admin-urgans-usage';
import { loadUrgansUsageRows } from '@/lib/admin-urgans-usage-server';
import { RODI_PER_USD } from '@/lib/credits/pricing';
import { internalUserIds, isInternalRow, withoutInternalAccounts } from '@/lib/admin-internal-accounts';
import { buildRunway } from '@/lib/admin-runway';
import { readRunwaySettings } from '@/lib/admin-runway-server';
import { loadDirectoryGrowth } from '@/lib/directory-growth-server';

// GET /api/admin/cockpit — the founder cockpit at the top of /admin
// (2026-10-09). The Scoreboard's own reads and definitions, plus which way each
// number moved this week and which teams need a message. Read-only: nothing is
// stored or written.
//
// Gated by ADMIN_EMAILS through verifyAdmin like every admin route, and not
// flag-gated (the /admin/scoreboard precedent). It reads the same rows as the
// Scoreboard, so it gets the same full minute.
//
// Since iteration 2 (2026-10-09) it also returns the sign-up funnel
// (lib/admin-funnel.ts), which adds one read: the marketing site's waitlist,
// run alongside the Supabase reads. Iteration 3 added the UrgAns panel
// (lib/admin-urgans-usage.ts): two more reads, the AI usage log and the credit
// ledger's spends and refunds over the last 8 weeks, also in parallel.
// Iteration 4 added the owner's name and email to each "Needs a message" team
// (read with the owners' profiles the Scoreboard already loads, no new query).
// Iteration 5 (2026-10-10): the Scoreboard's rows come from the read cache the
// Scoreboard route shares (lib/scoreboard-cache-server.ts), so opening both
// pages reads them once; and the churn numbers (lib/admin-churn.ts) are worked
// out from the same rows, with no new read.
// Iteration 6 (2026-10-10, the founder's answers): our own team's accounts are
// left out (lib/admin-internal-accounts.ts, the same list /admin/metrics hides,
// applied to the Scoreboard route too so the two still agree; `?team=1` puts
// them back, like /admin/metrics); and runway / default alive from the figures
// the founder typed in (one more read, app_settings, in parallel with the
// UrgAns reads; written only by /api/admin/runway).

export const maxDuration = 60;

const WAITLIST_SOURCE = 'waitlist (marketing site)';

/**
 * The waitlist joins inside the funnel's widest window, from the marketing
 * site's Neon "User" table (the same DATABASE_URL /admin/waitlist reads).
 * Emails stay on the server: only counts leave this route. Null, with the
 * reason as a source, when the database is not configured or the read fails,
 * so the funnel shows "Not tracked" instead of a zero.
 */
async function readWaitlist(): Promise<{ entries: WaitlistEntry[] | null; source: AdminReadSource }> {
  const sql = getNeonClient();
  if (!sql) {
    return {
      entries: null,
      source: { table: WAITLIST_SOURCE, rows: 0, status: 'missing', truncated: false, message: 'DATABASE_URL is not set' },
    };
  }
  const days = Math.max(...FUNNEL_WINDOWS);
  try {
    const rows = (await sql`
      SELECT email, "createdAt" AS "joinedAt"
      FROM "User"
      WHERE "createdAt" >= NOW() - (${days}::int * INTERVAL '1 day')
    `) as Array<{ email: string | null; joinedAt: string | Date | null }>;
    const entries: WaitlistEntry[] = rows
      .filter((row) => row.email && row.joinedAt)
      .map((row) => ({
        email: String(row.email),
        joinedAt: row.joinedAt instanceof Date ? row.joinedAt.toISOString() : String(row.joinedAt),
      }));
    return { entries, source: { table: WAITLIST_SOURCE, rows: entries.length, status: 'ok', truncated: false } };
  } catch (error) {
    console.error('[admin-cockpit] could not read the waitlist', error);
    return {
      entries: null,
      source: {
        table: WAITLIST_SOURCE,
        rows: 0,
        status: 'error',
        truncated: false,
        message: error instanceof Error ? error.message : 'read failed',
      },
    };
  }
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const client = admin.supabaseAdmin as SupabaseClient;

  try {
    const fresh = request.nextUrl.searchParams.get('fresh') === '1';
    const includeTeam = request.nextUrl.searchParams.get('team') === '1';
    const [{ input: fullInput, sources, extras }, waitlist] = await Promise.all([
      scoreboardReadCache.get(client, { fresh }),
      readWaitlist(),
    ]);
    // Our own accounts out (the cached rows are never changed; a new input is
    // made). Same call as GET /api/admin/scoreboard, so the pages agree.
    const internalEmails = includeTeam ? new Set<string>() : internalAccountEmails();
    const exclusion = withoutInternalAccounts(fullInput, internalUserIds(extras.emailByUserId, internalEmails));
    const input = exclusion.input;
    // After the shared read, so the UrgAns windows end at the same moment as
    // every other number (a cached read keeps the time it was made).
    const [urgansRows, runwayRead, directoryRead] = await Promise.all([
      loadUrgansUsageRows(client, input.now),
      readRunwaySettings(client, input.now),
      // Iteration 7 (2026-10-10): the Directory tile. Its own try inside, so a
      // directory read that fails never takes the rest of the cockpit with it.
      loadDirectoryGrowth(client, input, exclusion).catch((error) => {
        console.error('[admin-cockpit] could not read the directory numbers', error);
        return null;
      }),
    ]);
    const usageRows = urgansRows.usage?.filter((row) => !isInternalRow(row, exclusion)) ?? null;
    const ledgerRows = urgansRows.ledger?.filter((row) => !isInternalRow(row, exclusion)) ?? null;
    const waitlistEntries =
      waitlist.entries?.filter((entry) => !internalEmails.has(entry.email.trim().toLowerCase())) ?? null;
    const board = buildScoreboard(input);
    const cockpit = buildFounderCockpit(input, board);
    // Owner name and email for the "Needs a message" teams only (iteration 4),
    // so the founder knows who to write to. Admin-only behind verifyAdmin.
    cockpit.atRisk = attachOwnerContacts(cockpit.atRisk, extras.ownerNames, extras.ownerEmails);
    return NextResponse.json(
      {
        cockpit,
        funnels: buildFunnels(input, waitlistEntries, extras.ownerEmails),
        churn: churnSummary(input),
        urgans: buildUrgansUsage(
          input,
          board.secondRelease,
          usageRows,
          ledgerRows,
          RODI_PER_USD
        ),
        runway: buildRunway(runwayRead.settings, {
          subscriptions: input.subscriptions,
          mrrMinor: board.mrrMinor,
          now: input.now,
        }),
        runwayReadable: runwayRead.source.status === 'ok',
        directory: directoryRead ? directoryRead.growth.tile : null,
        ourTeamsLeftOut: exclusion.workspaceIds.size,
        includeTeam,
        sources: [
          ...sources,
          waitlist.source,
          ...urgansRows.sources,
          runwayRead.source,
          ...(directoryRead ? directoryRead.sources : []),
        ],
      },
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
