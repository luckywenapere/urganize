import { NextRequest, NextResponse } from 'next/server';
import { internalAccountEmails, verifyAdmin } from '../_shared';
import { NPS_SCOPE, categorizeNpsScore, computeNps, latestNpsResponse, normalizeNpsState } from '@/lib/nps';

// Net Promoter Score answers (2026-10-11). Reads the ui_state_drafts rows the
// in-app ask writes (scope 'nps', one per person; lib/nps.ts) and leaves our
// own accounts out, the same list every admin page uses.
//
// The headline score counts each person ONCE, by their latest answer, which
// is how NPS is normally reported. Every answer is still listed below it.

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

type DraftRow = { user_id: string; payload_json: unknown };
type ProfileRow = { id: string; name: string | null; email: string | null };

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;
  const db = adminResult.supabaseAdmin;

  const { data, error } = await db
    .from('ui_state_drafts')
    .select('user_id,payload_json')
    .eq('scope', NPS_SCOPE)
    .limit(5000);
  if (error) {
    return NextResponse.json({ error: error.message || 'Could not load NPS answers' }, { status: 500 });
  }

  const drafts = (data ?? []) as DraftRow[];
  const userIds = drafts.map((row) => row.user_id);
  const profiles = new Map<string, ProfileRow>();
  for (let i = 0; i < userIds.length; i += 200) {
    const { data: chunk } = await db
      .from('profiles')
      .select('id,name,email')
      .in('id', userIds.slice(i, i + 200));
    for (const profile of (chunk ?? []) as ProfileRow[]) profiles.set(profile.id, profile);
  }

  const internal = internalAccountEmails();
  const nowMs = Date.now();
  const latestScores: number[] = [];
  const recentLatestScores: number[] = [];
  let shown = 0;
  let dismissed = 0;
  const rows: Array<{
    userId: string;
    name: string;
    email: string;
    score: number;
    category: string;
    reason: string;
    at: string;
  }> = [];

  for (const draft of drafts) {
    const profile = profiles.get(draft.user_id);
    const email = (profile?.email ?? '').toLowerCase();
    if (email && internal.has(email)) continue;
    const state = normalizeNpsState(draft.payload_json);
    if (state.lastShownAt) shown += 1;
    if (state.lastDismissedAt) dismissed += 1;
    const latest = latestNpsResponse(state);
    if (latest) {
      latestScores.push(latest.score);
      if (nowMs - Date.parse(latest.at) <= 90 * DAY_MS) recentLatestScores.push(latest.score);
    }
    for (const response of state.responses) {
      rows.push({
        userId: draft.user_id,
        name: profile?.name ?? '',
        email: profile?.email ?? '',
        score: response.score,
        category: categorizeNpsScore(response.score),
        reason: response.reason,
        at: response.at,
      });
    }
  }

  rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return NextResponse.json({
    overall: computeNps(latestScores),
    last90Days: computeNps(recentLatestScores),
    peopleShown: shown,
    peopleWhoClosed: dismissed,
    rows: rows.slice(0, 500),
  });
}
