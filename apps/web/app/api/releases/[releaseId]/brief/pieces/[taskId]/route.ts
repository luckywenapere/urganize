import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { setTaskOnBrief } from '@/lib/release-brief-server';
import { badRequest, briefDisabled, briefFailure, missingReleaseId, notConfigured } from '../../_shared';

/**
 * PATCH { show } puts one of this rollout's activities on the brief's What
 * we're making, or takes it off (#897 phase 3). Anyone on the team who can
 * edit the plan. Not held by the approve lock: it changes what the brief
 * lists from the plan, not what the brief says.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ releaseId: string; taskId: string }> }) {
  const disabled = briefDisabled();
  if (disabled) return disabled;

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, taskId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const body = (await request.json().catch(() => null)) as { show?: unknown } | null;
  if (typeof body?.show !== 'boolean') return badRequest('Say whether it shows on the brief.');

  const saved = await setTaskOnBrief(admin, { releaseId, taskId, show: body.show });
  if (!saved.ok) return briefFailure(saved);
  return NextResponse.json(saved.value);
}
