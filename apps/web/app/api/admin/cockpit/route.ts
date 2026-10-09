import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getNeonClient, verifyAdmin } from '../_shared';
import { buildScoreboard } from '@/lib/scoreboard';
import { buildFounderCockpit } from '@/lib/founder-cockpit';
import { buildFunnels, FUNNEL_WINDOWS, type WaitlistEntry } from '@/lib/admin-funnel';
import type { AdminReadSource } from '@/lib/admin-read-server';
import { loadScoreboardInput } from '@/lib/scoreboard-server';

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
// run alongside the Supabase reads.

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
    const [{ input, sources, extras }, waitlist] = await Promise.all([
      loadScoreboardInput(client, new Date()),
      readWaitlist(),
    ]);
    const board = buildScoreboard(input);
    return NextResponse.json(
      {
        cockpit: buildFounderCockpit(input, board),
        funnels: buildFunnels(input, waitlist.entries, extras.ownerEmails),
        sources: [...sources, waitlist.source],
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
