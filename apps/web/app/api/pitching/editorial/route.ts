import { NextRequest, NextResponse } from 'next/server';

import { loadEditorialOverview } from '@/lib/editorial-overview-server';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { flagOffResponse, isPitchingFeatureEnabled, requireTeamUser } from '../_shared';

/**
 * Where every visible rollout's editorial pitch stands, for the Pitching page.
 * Read only: the pitch itself is edited in the task pop-up, so this holds no
 * second copy of it. Behind the same flag as the rest of /api/pitching.
 */
export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireTeamUser(request);
  if ('error' in auth && auth.error) return auth.error;

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user as never);
  const rows = await loadEditorialOverview(auth.adminClient, access, auth.user.id, new Date());
  if (!rows) return NextResponse.json({ error: 'Could not load editorial pitches.' }, { status: 500 });
  return NextResponse.json({ rows });
}
