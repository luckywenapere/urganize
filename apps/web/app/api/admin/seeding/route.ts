import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/app/api/admin/_shared';
import { createAdminClient } from '@/app/api/_shared/auth';
import { checkSeedBatch, summarizeSeeding } from '@/lib/seeding';
import { listSeeded, seedManagers } from '@/lib/seeding-server';

// Founder-led seeding: the operator list and the batch create. Admin only
// (ADMIN_EMAILS through verifyAdmin, checked first). Not behind a flag: it
// creates private, unlisted profiles that nobody sees until the person
// publishes, so there is nothing to switch on.
//
// POST returns each person's link and ready-to-send messages ONCE. Only the
// sha256 of a link is stored, so a link cannot be shown again; "New link" on
// the list makes a fresh one.

function resolveAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return supabaseUrl ? createAdminClient(supabaseUrl) : null;
}

const notConfigured = () =>
  NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const client = resolveAdminClient();
  if (!client) return notConfigured();

  const listed = await listSeeded(client);
  if (!listed.ok) return NextResponse.json({ error: listed.error }, { status: 500 });
  const summary = summarizeSeeding(listed.rows, new Date());
  return NextResponse.json({ rows: listed.rows, summary });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const client = resolveAdminClient();
  if (!client) return notConfigured();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a valid request body.' }, { status: 400 });
  }

  const checked = checkSeedBatch((body as { rows?: unknown } | null)?.rows);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

  const outcomes = await seedManagers(client, {
    actorUserId: admin.userId,
    rows: checked.rows,
    origin: new URL(request.url).origin,
  });
  return NextResponse.json({ outcomes });
}
