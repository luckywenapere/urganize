import { NextRequest, NextResponse } from 'next/server';
import { afterResponse } from '@/lib/after-response';
import { IDEAS_TABLE, notifyPlanReady } from '@/lib/rollout-ideas-server';
import {
  createAdminClient,
  ensureReleaseTeamWriteAccess,
  ideasEnabled,
  notFoundResponse,
  requireActiveAuthenticatedUser,
  toIdeasRelease,
} from '../_shared';

/**
 * "Your plan for <title> is ready" (2026-10-26). The planner intake calls this
 * after a plan it opened from the Ideas card lands. Owner only (plan building
 * is the owner's), and only for a rollout that has ideas. One push per rollout
 * tag, so building twice replaces, never stacks.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!ideasEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;
  const release = toIdeasRelease(access.release);
  if (release.ownerUserId !== auth.user.id) {
    return NextResponse.json({ ok: true, sent: false });
  }

  const ideas = await adminClient
    .from(IDEAS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('release_id', releaseId);
  if (ideas.error || !ideas.count) return NextResponse.json({ ok: true, sent: false });

  afterResponse('rollout plan ready push', () => notifyPlanReady(adminClient, { release, builderId: auth.user.id }));
  return NextResponse.json({ ok: true, sent: true });
}
