import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { isIdeaRoundEnabled } from '@/lib/idea-round';
import {
  approveBrief,
  canUserRunIdeaRound,
  settleBriefItem,
  startNewBriefVersion,
} from '@/lib/idea-round-server';
import { badRequest, briefDisabled, briefFailure, missingReleaseId, notConfigured } from '../_shared';

/**
 * The brief's review step (2026-10-27): pick a side where the ideas disagree,
 * approve the brief (it locks, and the plan is built from it next), or make a
 * new version (it unlocks; tasks already built are never changed). Only the
 * rollout owner or a team owner/admin.
 *
 *   POST { action: 'settle', itemId, option }
 *   POST { action: 'approve' }
 *   POST { action: 'new_version' }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const disabled = briefDisabled();
  if (disabled) return disabled;
  if (!isIdeaRoundEnabled()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  if (!(await canUserRunIdeaRound(admin, access.release.ownerUserId, auth.user))) {
    return NextResponse.json({ error: 'Only the owner or a team admin can do that.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; itemId?: unknown; option?: unknown };

  if (body.action === 'settle') {
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    const option = typeof body.option === 'number' ? body.option : -1;
    if (!itemId || option < 0) return badRequest('Pick one of the options.');
    const settled = await settleBriefItem(admin, { releaseId, itemId, optionIndex: option, actorId: auth.user.id });
    if (!settled.ok) return briefFailure(settled);
    return NextResponse.json(settled.value);
  }

  if (body.action === 'approve') {
    const approved = await approveBrief(admin, { releaseId, actorId: auth.user.id });
    if (!approved.ok) return briefFailure(approved);
    return NextResponse.json({ state: approved.value.state, version: approved.value.approvedVersion });
  }

  if (body.action === 'new_version') {
    const reopened = await startNewBriefVersion(admin, releaseId);
    if (!reopened.ok) return briefFailure(reopened);
    return NextResponse.json({ state: reopened.value.state });
  }

  return badRequest('action must be settle, approve or new_version.');
}
