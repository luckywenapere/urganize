import { NextRequest, NextResponse } from 'next/server';
import { requireUrgansAccess } from '@/app/api/_shared/urgans-access';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { isCreditsEnabled } from '@/lib/credits/config';
import { HISTORY_PAGE_ROWS, readLedgerHistory } from '@/lib/credits/credits-server';
import { buildHistory } from '@/lib/credits/history';

// GET /api/urgans/credits/history?before=<iso>
//
// Every spend, top-up, monthly grant and trial grant for the caller's team,
// newest first, with the date and the amount. The credit history screen reads it.
//
// Read-only and shows only what is the person's own business (history.ts): not
// the provider's cost, not the models, not the tokens. It does NOT go through
// getCreditSnapshot, which grants what a team is owed: looking at a list is not
// a reason to write to it. 404 when credits are off, the flag-gate body exactly.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/;

export async function GET(request: NextRequest) {
  if (!isCreditsEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireUrgansAccess(request);
  if ('error' in auth) return auth.error;

  const beforeParam = request.nextUrl.searchParams.get('before');
  if (beforeParam && !ISO_DATE.test(beforeParam)) {
    return NextResponse.json({ error: 'before must be a timestamp.' }, { status: 400 });
  }

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (!team.primaryWorkspaceId) {
    return NextResponse.json({ entries: [], nextBefore: null });
  }

  const rows = await readLedgerHistory(auth.adminClient, team.primaryWorkspaceId, {
    before: beforeParam,
  });
  if (!rows) {
    return NextResponse.json({ error: 'Could not read your credit history.' }, { status: 500 });
  }

  // A full page means there may be more. The cursor is the oldest row's own
  // time, so the next page starts strictly before it.
  const nextBefore = rows.length >= HISTORY_PAGE_ROWS ? rows[rows.length - 1].created_at : null;

  return NextResponse.json({ entries: buildHistory(rows), nextBefore });
}
