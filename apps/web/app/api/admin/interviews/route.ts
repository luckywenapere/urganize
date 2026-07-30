import { NextRequest, NextResponse } from 'next/server';
import { getNeonClient, verifyAdmin } from '../_shared';

// Booked artist-interview slots, ported from
// apps/homepage/app/dashboard/(protected)/interviews into the admin hub
// (2026-07-30, same pass that retired the homepage admin surfaces). Same
// Neon query against "InterviewSlot"; the PUBLIC booking form and its API
// stay on the homepage — only the internal view lives here.

type InterviewRow = {
  id: number;
  artistName: string;
  phone: string;
  imessage: string;
  date: string;
  bookedAt: string;
};

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;

  const sql = getNeonClient();
  if (!sql) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured on this deployment — interview bookings live in the marketing site’s Neon database.' },
      { status: 500 }
    );
  }

  try {
    const rows = (await sql`
      SELECT
        id,
        "artistName",
        phone,
        imessage,
        to_char("slotDate", 'FMDay, FMMon FMDD, YYYY') AS "date",
        to_char("createdAt", 'YYYY-MM-DD HH24:MI') AS "bookedAt"
      FROM "InterviewSlot"
      ORDER BY "slotDate" ASC
    `) as InterviewRow[];

    return NextResponse.json({ slots: rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load interview slots.' },
      { status: 500 }
    );
  }
}
