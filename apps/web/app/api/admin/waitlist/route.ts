import { NextRequest, NextResponse } from 'next/server';
import { getNeonClient, verifyAdmin } from '../_shared';

// Waitlist admin data, ported from apps/homepage/app/admin/waitlist
// (founder request, 2026-07-30: one admin hub). Same Neon queries against
// the marketing site's "User" table (the waitlist), but gated by
// verifyAdmin (ADMIN_EMAILS) instead of the homepage's shared-secret
// cookie. The homepage page remains untouched.
//
// 2026-08-04: added waitlist operations — contact tracking (count +
// timestamp), an outcome status pipeline, admin notes, and filtering by
// contact state. See the four new "User" columns added in
// apps/homepage/prisma/migrations/20260804100000_user_waitlist_ops.

type WaitlistStatsRow = { total: string; latest: string | null };
type CountRow = { label: string | null; count: string };

const CONTACT_STATUSES = ['new', 'contacted', 'responded', 'converted', 'not_interested'] as const;
type ContactStatus = (typeof CONTACT_STATUSES)[number];

const isContactStatus = (value: unknown): value is ContactStatus =>
  typeof value === 'string' && (CONTACT_STATUSES as readonly string[]).includes(value);

const CONTACT_FILTERS = ['not_contacted', 'contacted_once', 'contacted_twice_plus'] as const;
type ContactFilter = (typeof CONTACT_FILTERS)[number] | ContactStatus;

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
  contactCount: number;
  lastContactedAt: string | Date | null;
  contactStatus: string;
  adminNotes: string | null;
};

function shapeRow(row: WaitlistRow) {
  return {
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
    contactCount: row.contactCount,
    lastContactedAt: row.lastContactedAt ? String(row.lastContactedAt) : null,
    contactStatus: row.contactStatus,
    adminNotes: row.adminNotes,
  };
}

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
  const rawFilter = String(req.nextUrl.searchParams.get('filter') || '').trim();
  const filter: ContactFilter | null =
    (CONTACT_FILTERS as readonly string[]).includes(rawFilter) || isContactStatus(rawFilter)
      ? (rawFilter as ContactFilter)
      : null;

  const selectCols = `
    id, email, name, phone, role,
    "teamSize", "releaseVolume", "primaryNeed", "metadata", "createdAt",
    "contactCount", "lastContactedAt", "contactStatus", "adminNotes"
  `;

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

    const statusCounts = (await sql`
      SELECT "contactStatus" AS label, COUNT(*)::text AS count
      FROM "User"
      GROUP BY "contactStatus"
    `) as CountRow[];

    const notContactedRow = (await sql`
      SELECT COUNT(*)::text AS count FROM "User" WHERE "contactCount" = 0
    `) as { count: string }[];
    const contactedOnceRow = (await sql`
      SELECT COUNT(*)::text AS count FROM "User" WHERE "contactCount" = 1
    `) as { count: string }[];
    const contactedTwicePlusRow = (await sql`
      SELECT COUNT(*)::text AS count FROM "User" WHERE "contactCount" >= 2
    `) as { count: string }[];

    let rows: WaitlistRow[];
    if (trimmedQuery && filter) {
      rows = (await sql`
        SELECT ${sql.unsafe(selectCols)}
        FROM "User"
        WHERE (
          email ILIKE ${likeQuery}
          OR name ILIKE ${likeQuery}
          OR COALESCE(phone, '') ILIKE ${likeQuery}
          OR COALESCE(role, '') ILIKE ${likeQuery}
          OR COALESCE("teamSize", '') ILIKE ${likeQuery}
          OR COALESCE("releaseVolume", '') ILIKE ${likeQuery}
          OR COALESCE("primaryNeed", '') ILIKE ${likeQuery}
        )
        AND (
          (${filter} = 'not_contacted' AND "contactCount" = 0)
          OR (${filter} = 'contacted_once' AND "contactCount" = 1)
          OR (${filter} = 'contacted_twice_plus' AND "contactCount" >= 2)
          OR "contactStatus" = ${filter}
        )
        ORDER BY "createdAt" DESC
        LIMIT 200
      `) as WaitlistRow[];
    } else if (trimmedQuery) {
      rows = (await sql`
        SELECT ${sql.unsafe(selectCols)}
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
      `) as WaitlistRow[];
    } else if (filter) {
      rows = (await sql`
        SELECT ${sql.unsafe(selectCols)}
        FROM "User"
        WHERE
          (${filter} = 'not_contacted' AND "contactCount" = 0)
          OR (${filter} = 'contacted_once' AND "contactCount" = 1)
          OR (${filter} = 'contacted_twice_plus' AND "contactCount" >= 2)
          OR "contactStatus" = ${filter}
        ORDER BY "createdAt" DESC
        LIMIT 200
      `) as WaitlistRow[];
    } else {
      rows = (await sql`
        SELECT ${sql.unsafe(selectCols)}
        FROM "User"
        ORDER BY "createdAt" DESC
        LIMIT 200
      `) as WaitlistRow[];
    }

    return NextResponse.json({
      stats: stats[0] ?? { total: '0', latest: null },
      roleCounts,
      statusCounts,
      contactCounts: {
        notContacted: notContactedRow[0]?.count ?? '0',
        contactedOnce: contactedOnceRow[0]?.count ?? '0',
        contactedTwicePlus: contactedTwicePlusRow[0]?.count ?? '0',
      },
      rows: rows.map(shapeRow),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load the waitlist.' },
      { status: 500 }
    );
  }
}

type PatchBody =
  | { id: number; action: 'contact' }
  | { id: number; action: 'set_status'; status: string }
  | { id: number; action: 'set_notes'; notes: string | null };

export async function PATCH(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;

  const sql = getNeonClient();
  if (!sql) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured on this deployment — the waitlist lives in the marketing site’s Neon database.' },
      { status: 500 }
    );
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'A valid waitlist id is required.' }, { status: 400 });
  }

  const selectCols = `
    id, email, name, phone, role,
    "teamSize", "releaseVolume", "primaryNeed", "metadata", "createdAt",
    "contactCount", "lastContactedAt", "contactStatus", "adminNotes"
  `;

  try {
    let updated: WaitlistRow[];

    if (body.action === 'contact') {
      // Only auto-advance new -> contacted; never downgrade someone who's
      // already responded / converted / been marked not interested.
      updated = (await sql`
        UPDATE "User"
        SET
          "contactCount" = "contactCount" + 1,
          "lastContactedAt" = NOW(),
          "contactStatus" = CASE WHEN "contactStatus" = 'new' THEN 'contacted' ELSE "contactStatus" END
        WHERE id = ${id}
        RETURNING ${sql.unsafe(selectCols)}
      `) as WaitlistRow[];
    } else if (body.action === 'set_status') {
      if (!isContactStatus(body.status)) {
        return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
      }
      updated = (await sql`
        UPDATE "User"
        SET "contactStatus" = ${body.status}
        WHERE id = ${id}
        RETURNING ${sql.unsafe(selectCols)}
      `) as WaitlistRow[];
    } else if (body.action === 'set_notes') {
      const trimmedNotes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';
      updated = (await sql`
        UPDATE "User"
        SET "adminNotes" = ${trimmedNotes || null}
        WHERE id = ${id}
        RETURNING ${sql.unsafe(selectCols)}
      `) as WaitlistRow[];
    } else {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Waitlist entry not found.' }, { status: 404 });
    }

    return NextResponse.json({ row: shapeRow(updated[0]) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not update this entry.' },
      { status: 500 }
    );
  }
}
