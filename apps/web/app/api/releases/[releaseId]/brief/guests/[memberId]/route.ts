import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { canUserManageBriefShare } from '@/lib/release-brief-server';
import { removeBriefGuest } from '@/lib/release-brief-guests-server';
import { briefDisabled, missingReleaseId, notConfigured } from '../../_shared';

/**
 * DELETE takes a brief guest off the rollout (#897 phase 6). Their activities
 * stay in the plan, unassigned. Only the rollout's owner or a team owner/admin.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string; memberId: string }> }
) {
  const disabled = briefDisabled();
  if (disabled) return disabled;

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, memberId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  if (!(await canUserManageBriefShare(admin, access.release.ownerUserId, auth.user))) {
    return NextResponse.json({ error: 'Only the rollout’s owner or a team admin can remove a guest.' }, { status: 403 });
  }

  const removed = await removeBriefGuest(admin, { releaseId, memberId });
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status });
  return NextResponse.json(removed.value);
}
