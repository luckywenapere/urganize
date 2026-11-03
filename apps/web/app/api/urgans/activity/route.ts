// GET /api/urgans/activity — "What UrgAns did".
//
// ?releaseId=<id>  one rollout's actions, for anyone who can read the rollout.
// (none)           every rollout the caller can see, plus anything the caller
//                  asked for themselves. Settings > UrgAns.
//
// Read-only over urgans_action_log (lib/urgans-action-log.ts). Last 30 days,
// newest first, at most 100 rows. Rows with no rollout made by a teammate are
// left out of the all-rollouts view on purpose: the log's workspace_id is a
// hint, not proof of who may see a row, and visibility here follows rollouts.

import { NextRequest, NextResponse } from 'next/server';
import { requireUrgansAccess } from '@/app/api/_shared/urgans-access';
import { loadProfilesByIds, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { ensureReleaseTeamReadAccess } from '@/lib/release-access-server';
import { ReleaseService } from '@/lib/services/release-service';
import { URGANS_ACTION_LOG_TABLE } from '@/lib/urgans-action-log-server';
import type { UrgansActivityRow } from '@/lib/urgans-activity';

const DAYS = 30;
const LIMIT = 100;
const MAX_RELEASES = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LogRow = {
  id: string;
  created_at: string;
  source: UrgansActivityRow['source'];
  trigger: string;
  tool: string;
  actor_user_id: string | null;
  release_id: string | null;
  object_type: string | null;
  object_id: string | null;
  args: Record<string, unknown> | null;
  before: unknown;
  after: unknown;
  confirmed: boolean;
  ok: boolean;
  summary: string | null;
  error: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireUrgansAccess(request);
  if ('error' in auth) return auth.error;
  const { adminClient, user } = auth;

  const releaseId = request.nextUrl.searchParams.get('releaseId')?.trim() || '';
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

  let query = adminClient
    .from(URGANS_ACTION_LOG_TABLE)
    .select(
      'id,created_at,source,trigger,tool,actor_user_id,release_id,object_type,object_id,args,before,after,confirmed,ok,summary,error'
    )
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (releaseId) {
    if (!UUID.test(releaseId)) return NextResponse.json({ error: 'Rollout not found.' }, { status: 404 });
    const access = await ensureReleaseTeamReadAccess(adminClient, releaseId, user);
    if ('error' in access) return access.error;
    query = query.eq('release_id', releaseId);
  } else {
    const ctx = await loadWorkspaceAccessContext(adminClient, user);
    const releases = await new ReleaseService(adminClient).getReleasesForUser(
      user.id,
      ctx.releaseOwnerIds,
      ctx.artistScopeByOwnerId,
      ctx.releaseScopeByOwnerId
    );
    const ids = (releases || [])
      .map((release: { id?: string }) => release.id)
      .filter((id): id is string => typeof id === 'string' && UUID.test(id))
      .slice(0, MAX_RELEASES);
    query = ids.length
      ? query.or(`release_id.in.(${ids.join(',')}),actor_user_id.eq.${user.id}`)
      : query.eq('actor_user_id', user.id);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[urgans-activity] read failed:', error.message);
    return NextResponse.json({ error: 'Could not load what AI did.' }, { status: 500 });
  }

  const rows = ((data as LogRow[] | null) ?? []).map(
    (row): UrgansActivityRow => ({
      id: row.id,
      createdAt: row.created_at,
      source: row.source,
      trigger: row.trigger,
      tool: row.tool,
      actorUserId: row.actor_user_id,
      releaseId: row.release_id,
      objectType: row.object_type,
      objectId: row.object_id,
      args: row.args,
      before: row.before,
      after: row.after,
      confirmed: row.confirmed,
      ok: row.ok,
      summary: row.summary,
      error: row.error,
    })
  );

  const profiles = await loadProfilesByIds(
    adminClient,
    rows.map((row) => row.actorUserId).filter((id): id is string => Boolean(id))
  );
  const names: Record<string, string> = {};
  for (const [id, profile] of profiles) {
    names[id] = (profile.name || profile.email || '').trim();
  }

  return NextResponse.json({ viewerId: user.id, rows, names });
}
