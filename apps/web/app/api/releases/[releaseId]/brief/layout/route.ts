import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { parseBoardLayout } from '@/lib/brief-board-layout';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { canUserManageBriefShare, resetBoardLayout, saveBoardLayout } from '@/lib/release-brief-server';
import { badRequest, briefDisabled, briefFailure, missingReleaseId, notConfigured } from '../_shared';

/**
 * Where the brief board's cards sit (#897 phase 1b). PUT { cards } saves the
 * whole board at once; DELETE puts it back to the default layout. Only the
 * rollout's owner or a team owner/admin may; the approve lock does not apply,
 * because arranging changes how the brief looks, not what it says.
 */

async function guard(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const disabled = briefDisabled();
  if (disabled) return { error: disabled };

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return { error: auth.error };

  const { releaseId } = await context.params;
  if (!releaseId) return { error: missingReleaseId() };

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return { error: notConfigured() };

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return { error: access.error };

  const allowed = await canUserManageBriefShare(admin, access.release.ownerUserId, auth.user);
  if (!allowed) {
    return {
      error: NextResponse.json(
        { error: 'Only the rollout’s owner or a team admin can arrange the brief.' },
        { status: 403 }
      ),
    };
  }
  return { admin, releaseId, userId: auth.user.id };
}

export async function PUT(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const ready = await guard(request, context);
  if ('error' in ready) return ready.error;

  const parsed = parseBoardLayout(await request.json().catch(() => null));
  if (!parsed.ok) return badRequest(parsed.error);

  const saved = await saveBoardLayout(ready.admin, {
    releaseId: ready.releaseId,
    layout: parsed.value,
    actorId: ready.userId,
  });
  if (!saved.ok) return briefFailure(saved);
  return NextResponse.json({ layout: saved.value });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const ready = await guard(request, context);
  if ('error' in ready) return ready.error;

  const reset = await resetBoardLayout(ready.admin, ready.releaseId);
  if (!reset.ok) return briefFailure(reset);
  return NextResponse.json({ layout: null });
}
