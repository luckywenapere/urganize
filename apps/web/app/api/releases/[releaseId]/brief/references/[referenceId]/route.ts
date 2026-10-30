import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { briefLockedFailure } from '@/lib/idea-round-server';
import { deleteBriefReference, setBriefReferenceCaption } from '@/lib/release-brief-server';
import { parseCaption } from '@/lib/brief-media';
import { badRequest, briefDisabled, briefFailure, missingReleaseId, notConfigured } from '../../_shared';

/** DELETE a reference: whoever added it, or the rollout's owner or a team admin. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string; referenceId: string }> }
) {
  const disabled = briefDisabled();
  if (disabled) return disabled;

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, referenceId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  // An approved brief is locked until someone makes a new version (2026-10-27).
  const locked = await briefLockedFailure(admin, releaseId);
  if (locked) return briefFailure(locked);

  const deleted = await deleteBriefReference(admin, {
    releaseId,
    rowId: referenceId,
    user: auth.user,
    releaseOwnerId: access.release.ownerUserId,
  });
  if (!deleted.ok) return briefFailure(deleted);
  return NextResponse.json(deleted.value);
}

/** PATCH { caption }: the line under a picture or link (#897 phase 2). Whoever added it, or a lead. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string; referenceId: string }> }
) {
  const disabled = briefDisabled();
  if (disabled) return disabled;

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, referenceId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const locked = await briefLockedFailure(admin, releaseId);
  if (locked) return briefFailure(locked);

  const caption = parseCaption(await request.json().catch(() => null));
  if (!caption.ok) return badRequest(caption.error);

  const saved = await setBriefReferenceCaption(admin, {
    releaseId,
    rowId: referenceId,
    caption: caption.value,
    user: auth.user,
    releaseOwnerId: access.release.ownerUserId,
  });
  if (!saved.ok) return briefFailure(saved);
  return NextResponse.json(saved.value);
}
