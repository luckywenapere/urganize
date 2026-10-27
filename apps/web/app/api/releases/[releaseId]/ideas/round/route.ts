import { NextRequest, NextResponse } from 'next/server';
import { isIdeaRoundEnabled } from '@/lib/idea-round';
import { canUserRunIdeaRound, closeIdeaRound } from '@/lib/idea-round-server';
import {
  createAdminClient,
  ensureReleaseTeamWriteAccess,
  ideasEnabled,
  notFoundResponse,
  requireActiveAuthenticatedUser,
} from '../_shared';

/**
 * Close a rollout's idea round (2026-10-27): no more ideas come in, everyone
 * asked can read all of them, and the brief is written next (the browser then
 * runs release.brief_from_ideas). Only the rollout owner or a team owner/admin.
 *
 *   POST { action: 'close' }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!ideasEnabled() || !isIdeaRoundEnabled()) return notFoundResponse();

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

  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== 'close') return NextResponse.json({ error: 'action must be close.' }, { status: 400 });

  if (!(await canUserRunIdeaRound(adminClient, access.release.ownerUserId, auth.user))) {
    return NextResponse.json({ error: 'Only the owner can close the round.' }, { status: 403 });
  }

  const closed = await closeIdeaRound(adminClient, releaseId, auth.user.id);
  if (!closed.ok) return NextResponse.json({ error: closed.error }, { status: closed.status });
  return NextResponse.json({ state: closed.value.state });
}
