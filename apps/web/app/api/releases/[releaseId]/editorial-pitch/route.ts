import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { ensureEditorialPitchTask } from '@/lib/editorial-pitch-server';

/**
 * The once-only backfill of the Spotify editorial pitch step.
 *
 * A rollout planned before the pitch step existed gets it the first time
 * somebody opens it (the workspace calls this once when a rollout is scoped).
 * This is a POST, never a GET, because it writes: nothing in this app writes on
 * a read.
 *
 * Team-aware like every scene route group, writes included: any member may
 * trigger it, a guest is refused, a non-member gets the existence-hiding 404.
 * The client treats every refusal as a quiet no-op, since a person who cannot
 * write simply does not get the step until somebody who can opens the rollout.
 *
 * Not behind a feature flag: the step is part of the plan, live at merge.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  // Never throws and never fails the page: an outcome of 'skipped' means nothing
  // was decided or recorded, and the next open tries again.
  const result = await ensureEditorialPitchTask(admin, releaseId);
  return NextResponse.json(result);
}
