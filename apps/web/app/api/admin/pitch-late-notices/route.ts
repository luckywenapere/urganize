import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/app/api/admin/_shared';
import { sendMissedPitchNotices } from '@/lib/pitch-submission-notice-server';

// One-off catch-up for curators who were never told about a free pitch
// (2026-10-26). GET is a dry run that sends nothing; POST sends the late notice
// with an apology, 50 pitches a call by default (?limit=, max 200). Idempotent:
// a pitch whose email key is already logged is skipped, so repeat POSTs until
// `missed` reaches 0.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const report = await sendMissedPitchNotices(admin.supabaseAdmin, { dryRun: true });
  return NextResponse.json({ report });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 50, 200);
  const report = await sendMissedPitchNotices(admin.supabaseAdmin, { dryRun: false, limit });
  return NextResponse.json({ report });
}
