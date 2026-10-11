import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamReadAccess } from '@/lib/release-access-server';
import { listListedPromoChannels, loadReleaseGenre } from '@/lib/promo-channels-server';

/**
 * GET /api/releases/[releaseId]/promo-channels: the promo channel directory as
 * the Promo scene and the plan banner see it for one rollout. Every listed
 * channel, plus the rollout's genre so the screen can rank the ones that fit
 * (suggestPromoChannels in lib/promo-channels.ts, deterministic, no credits).
 *
 * Team-aware like every scene route group: any member (and a read-only guest)
 * may read, a non-member gets the existence-hiding 404. Adding a channel to the
 * rollout is an ordinary activity create through POST /api/tasks, which carries
 * its own guest refusal.
 *
 * Before the migration is applied the answer is 200 with `ready: false` and no
 * channels, so the scene shows a quiet "coming soon" line instead of an error.
 */
export async function GET(
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

  const access = await ensureReleaseTeamReadAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const [directory, genre] = await Promise.all([
    listListedPromoChannels(admin),
    loadReleaseGenre(admin, releaseId),
  ]);

  if (!directory.ok) {
    if (directory.reason === 'not_ready') {
      return NextResponse.json(
        { ready: false, channels: [], genre },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json({ error: 'Could not load promo channels. Try again.' }, { status: 500 });
  }

  return NextResponse.json(
    { ready: true, channels: directory.channels, genre },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
