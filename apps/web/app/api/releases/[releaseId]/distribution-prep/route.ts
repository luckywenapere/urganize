import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { syncDistributionPrepTasks } from '@/lib/distribution-prep-tasks-server';

/**
 * Keeps the three distribution prep tasks in step with the check before
 * distribution (#851): adds them, dates them from release day, and ticks them
 * when the check passes. The workspace calls this when a rollout is opened and
 * when a scene closes. A POST because it writes, like the editorial pitch
 * backfill it copies.
 *
 * Any member may trigger it, a guest is refused, a non-member gets the
 * existence-hiding 404. The client treats every refusal as a quiet no-op.
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

  // Never throws and never fails the page.
  const result = await syncDistributionPrepTasks(admin, releaseId);
  return NextResponse.json(result);
}
