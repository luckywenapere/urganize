import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { deleteBriefDecision } from '@/lib/release-brief-server';
import { briefDisabled, briefFailure, missingReleaseId, notConfigured } from '../../_shared';

/** DELETE a decision: whoever wrote it, or the rollout's owner or a team admin. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string; decisionId: string }> }
) {
  const disabled = briefDisabled();
  if (disabled) return disabled;

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, decisionId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const deleted = await deleteBriefDecision(admin, {
    releaseId,
    rowId: decisionId,
    user: auth.user,
    releaseOwnerId: access.release.ownerUserId,
  });
  if (!deleted.ok) return briefFailure(deleted);
  return NextResponse.json(deleted.value);
}
