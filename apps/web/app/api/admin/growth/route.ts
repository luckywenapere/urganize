import { NextRequest, NextResponse } from 'next/server';
import { getNeonClient, verifyAdmin } from '../_shared';

// Growth (weekly signup) data, ported from
// apps/homepage/app/dashboard/(protected)/growth (founder request,
// 2026-07-30: one admin hub). Same Neon query — cumulative user counts per
// ISO week over the last 12 weeks — gated by verifyAdmin instead of the
// homepage's shared-secret cookie. The homepage page remains untouched.

type CountRow = { total: string };
type WeeklyRow = { weekLabel: string; totalUsers: string | number };

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;

  const sql = getNeonClient();
  if (!sql) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured on this deployment — growth data lives in the marketing site’s Neon database.' },
      { status: 500 }
    );
  }

  try {
    const totalRows = (await sql`
      SELECT COUNT(*)::text AS total
      FROM "User"
    `) as CountRow[];

    const total = Number(totalRows[0]?.total ?? '0');
    if (total === 0) {
      return NextResponse.json({ total: 0, weeks: [] });
    }

    const rows = (await sql`
      WITH weeks AS (
        SELECT generate_series(
          date_trunc('week', NOW())::date - INTERVAL '11 weeks',
          date_trunc('week', NOW())::date,
          INTERVAL '1 week'
        ) AS week_start
      )
      SELECT
        to_char(week_start, 'IYYY-"W"IW') AS "weekLabel",
        (
          SELECT COUNT(*)::int
          FROM "User"
          WHERE "createdAt" < week_start + INTERVAL '1 week'
        ) AS "totalUsers"
      FROM weeks
      ORDER BY week_start ASC
    `) as WeeklyRow[];

    return NextResponse.json({
      total,
      weeks: rows.map((row) => ({
        weekLabel: row.weekLabel,
        totalUsers: Number(row.totalUsers),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load growth data.' },
      { status: 500 }
    );
  }
}
