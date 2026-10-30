import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { isSkippableWarning } from '@/lib/distribution-rules';
import { skipDistributionWarning } from '@/lib/distribution-server';

/**
 * POST /api/releases/[releaseId]/distribution/skip { code } (founder, Oct 31,
 * 2026): the team says "we've missed it" to a warning, and it stops showing on
 * this rollout for everyone. Only warnings in SKIPPABLE_WARNINGS (today the
 * tight Spotify pitch window); an error can never be skipped. Same access as
 * ordering: any member, not a guest.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code : '';
  if (!isSkippableWarning(code)) {
    return NextResponse.json({ error: 'This one cannot be skipped.' }, { status: 400 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const saved = await skipDistributionWarning(admin, releaseId, code);
  if (!saved) {
    return NextResponse.json({ error: 'Could not skip it. Try again.' }, { status: 500 });
  }
  return NextResponse.json({ skipped: code });
}
