import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/app/api/admin/_shared';
import { isAltlinkConfigured } from '@/lib/altlink/client';
import { backfillSmartLinks } from '@/lib/altlink/server';

// One-off Altlink backfill (Oct 2026 pilot): every rollout that already has a
// UPC or ISRC and no link. GET is a dry run that calls nothing; POST makes the
// links, about 100 a minute (Altlink allows 120). Idempotent: a rollout that has
// a link is skipped, and Altlink dedupes on our release id anyway.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const report = await backfillSmartLinks(admin.supabaseAdmin, { dryRun: true });
  return NextResponse.json({ configured: isAltlinkConfigured(), report });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  if (!isAltlinkConfigured()) return NextResponse.json({ error: 'ALTLINK_API_KEY is not set.' }, { status: 503 });
  const limit = Number(new URL(request.url).searchParams.get('limit')) || 150;
  const report = await backfillSmartLinks(admin.supabaseAdmin, { dryRun: false, limit: Math.min(limit, 150) });
  return NextResponse.json({ report });
}
