import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { canUserManageBriefShare, setBriefShare } from '@/lib/release-brief-server';
import { badRequest, briefDisabled, briefFailure, missingReleaseId, notConfigured } from '../_shared';

/**
 * PATCH { enabled } turns the brief's read-only view link on or off. Only the
 * rollout's owner or a team owner/admin may; anyone else on the team gets 403
 * (they can still copy a link that is already on, from the GET payload).
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const disabled = briefDisabled();
  if (disabled) return disabled;

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== 'boolean') return badRequest('Say whether the link is on or off.');

  const allowed = await canUserManageBriefShare(admin, access.release.ownerUserId, auth.user);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Only the rollout’s owner or a team admin can change the view link.' },
      { status: 403 }
    );
  }

  const saved = await setBriefShare(admin, { releaseId, enabled: body.enabled, actorId: auth.user.id });
  if (!saved.ok) return briefFailure(saved);
  return NextResponse.json({ share: saved.value });
}
