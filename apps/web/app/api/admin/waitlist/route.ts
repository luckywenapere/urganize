import { NextRequest, NextResponse } from 'next/server';
import { getNeonClient, verifyAdmin } from '../_shared';

// Waitlist admin data, ported from apps/homepage/app/admin/waitlist
// (founder request, 2026-07-30: one admin hub). Same Neon queries against
// the marketing site's "User" table (the waitlist), but gated by
// verifyAdmin (ADMIN_EMAILS) instead of the homepage's shared-secret
// cookie. The homepage page remains untouched.

type WaitlistStatsRow = { total: string; latest: string | null };
type CountRow = { label: string | null; count: string };

type WaitlistRow = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: string | null;
  teamSize: string | null;
  releaseVolume: string | null;
  primaryNeed: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | Date;
};

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;

  const sql = getNeonClient();
  if (!sql) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured on this deployment — the waitlist lives in the marketing site’s Neon database.' },
      { status: 500 }
    );
  }

  const trimmedQuery = String(req.nextUrl.searchParams.get('q') || '').trim();
  const likeQuery = `%${trimmedQuery}%`;

  try {
    const stats = (await sql`
      SELECT
        COUNT(*)::text AS total,
        MAX("createdAt")::text AS latest
      FROM "User"
    `) as WaitlistStatsRow[];

    const roleCounts = (await sql`
      SELECT role AS label, COUNT(*)::text AS count
      FROM "User"
      GROUP BY role
      ORDER BY COUNT(*) DESC, role ASC
    `) as CountRow[];

    const rows = trimmedQuery
      ? ((await sql`
          SELECT
            id, email, name, phone, role,
            "teamSize", "releaseVolume", "primaryNeed", "metadata", "createdAt"
          FROM "User"
          WHERE
            email ILIKE ${likeQuery}
            OR name ILIKE ${likeQuery}
            OR COALESCE(phone, '') ILIKE ${likeQuery}
            OR COALESCE(role, '') ILIKE ${likeQuery}
            OR COALESCE("teamSize", '') ILIKE ${likeQuery}
            OR COALESCE("releaseVolume", '') ILIKE ${likeQuery}
            OR COALESCE("primaryNeed", '') ILIKE ${likeQuery}
          ORDER BY "createdAt" DESC
          LIMIT 200
        `) as WaitlistRow[])
      : ((await sql`
          SELECT
            id, email, name, phone, role,
            "teamSize", "releaseVolume", "primaryNeed", "metadata", "createdAt"
          FROM "User"
          ORDER BY "createdAt" DESC
          LIMIT 200
        `) as WaitlistRow[]);

    return NextResponse.json({
      stats: stats[0] ?? { total: '0', latest: null },
      roleCounts,
      rows: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        phone: row.phone,
        role: row.role,
        teamSize: row.teamSize,
        releaseVolume: row.releaseVolume,
        primaryNeed: row.primaryNeed,
        source: typeof row.metadata?.source === 'string' ? row.metadata.source : null,
        createdAt: String(row.createdAt),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load the waitlist.' },
      { status: 500 }
    );
  }
}
