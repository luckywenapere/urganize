import { NextRequest, NextResponse } from 'next/server';
import { loadWorkspaceAccessContext, requireAuthenticatedAdmin } from '@/lib/tasks-server';
import { loadTeamPresenceMembers } from '@/lib/home/team-presence-server';

// Home's team presence (URG-250). Home's first paint gets the same list inside
// GET /api/home (URG-320); this route is only the periodic refresh. Never
// breaks Home: a read failure answers an empty list.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  try {
    const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
    const members = await loadTeamPresenceMembers(auth.adminClient, auth.user, access.primaryWorkspaceId);
    return NextResponse.json({ members });
  } catch (error) {
    console.error('[home/team] request failed:', error);
    return NextResponse.json({ error: 'Could not load your team.' }, { status: 500 });
  }
}
