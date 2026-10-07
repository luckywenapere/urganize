import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../../_shared';
import { isEmailConfigured } from '@/lib/email';
import {
  planTeamNoticeBackfill,
  runTeamNoticeBackfill,
} from '@/lib/team-notices-server';

// /api/admin/teams/notices — email the owners of teams the founder already
// comped or extended, before the live notice existed.
//
// GET   counts what would be sent. Writes nothing.
// POST  sends one run (up to BACKFILL_RUN_LIMIT). Pressing again sends the rest;
//       a change already emailed is skipped by its dedupe key.

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  try {
    const plan = await planTeamNoticeBackfill(admin.supabaseAdmin as SupabaseClient);
    return NextResponse.json({
      emailConfigured: isEmailConfigured(),
      toSend: plan.toSend.length,
      alreadySent: plan.alreadySent,
      noOwner: plan.noOwner,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not count the notices.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: 'Email is not configured on this environment, so nothing was sent.' },
      { status: 503 }
    );
  }

  const client = admin.supabaseAdmin as SupabaseClient;
  try {
    const plan = await planTeamNoticeBackfill(client);
    const result = await runTeamNoticeBackfill(client, plan.toSend, admin.userId);
    return NextResponse.json({ ok: true, ...result, alreadySent: plan.alreadySent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The notices did not send.' },
      { status: 500 }
    );
  }
}
