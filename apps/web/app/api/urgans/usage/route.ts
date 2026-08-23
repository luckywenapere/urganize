import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '@/app/api/_shared/auth';
import { isChappiEnabled } from '@/lib/chappi/config';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { getUsageSnapshot } from '@/lib/urgans-usage-server';

// GET /api/urgans/usage — how much of the assistant window this team has spent.
//
// A small dedicated route rather than another field on /api/subscription-status,
// which is cached: this number changes on every assistant turn, so serving it
// from a cached payload would show a stale count exactly when it matters.
//
// Returns `limit: null` for an uncapped team, which is every team except a
// paying Manager one, and the banner renders nothing on null.

export async function GET(request: NextRequest) {
  if (!isChappiEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (!team.primaryWorkspaceId) {
    return NextResponse.json({ used: 0, limit: null, approaching: false });
  }

  const snapshot = await getUsageSnapshot(auth.adminClient, {
    workspaceId: team.primaryWorkspaceId,
    ownerUserId: team.ownerUserId,
    tier: team.tier,
  });

  return NextResponse.json(snapshot);
}
