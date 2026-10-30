import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { parseBriefGuestInvite } from '@/lib/brief-guests';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { canUserManageBriefShare } from '@/lib/release-brief-server';
import { inviteBriefGuest } from '@/lib/release-brief-guests-server';
import { badRequest, briefDisabled, missingReleaseId, notConfigured } from '../_shared';

/**
 * POST { name, email?, taskIds } shares the brief with a person (#897 phase
 * 6): a guest limited to this rollout, their part assigned when they join.
 * Only the rollout's owner or a team owner/admin, like the view link. No paid
 * seat; 5 per rollout (Oyin, 31 Oct 2026).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
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

  if (!(await canUserManageBriefShare(admin, access.release.ownerUserId, auth.user))) {
    return NextResponse.json({ error: 'Only the rollout’s owner or a team admin can share the brief.' }, { status: 403 });
  }

  const parsed = parseBriefGuestInvite(await request.json().catch(() => null));
  if (!parsed.ok) return badRequest(parsed.error);

  const meta = auth.user.user_metadata as Record<string, unknown> | undefined;
  const fullName = typeof meta?.full_name === 'string' ? meta.full_name : '';
  const created = await inviteBriefGuest(admin, {
    releaseId,
    releaseOwnerId: access.release.ownerUserId,
    releaseTitle: access.release.title || 'a rollout',
    invite: parsed.value,
    inviter: auth.user,
    inviterName: fullName.split(' ')[0] || auth.user.email || 'A teammate',
  });
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });
  return NextResponse.json(created.value, { status: 201 });
}
