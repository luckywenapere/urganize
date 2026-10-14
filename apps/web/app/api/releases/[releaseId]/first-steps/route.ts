import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamReadAccess } from '@/lib/release-access-server';
import { readHasTeam } from '@/lib/next-moves-server';
import { SONG_CATEGORY } from '@/lib/song';

/**
 * What a new rollout's first steps tick off from (URG-293): is the song there,
 * is the cover art there, does the caller's team have anyone in it yet. Read
 * only, and only what the checklist needs, so it stays cheap enough to re-read
 * every time a scene closes. Any read that fails comes back as null (unknown),
 * which the card treats as not done rather than guessing.
 *
 * Team-aware like the other scene routes: a non-member gets the existence-
 * hiding 404 from ensureReleaseTeamReadAccess.
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

  const [releaseResult, songResult, hasTeam] = await Promise.all([
    admin.from('releases').select('artwork_asset_id').eq('id', releaseId).maybeSingle(),
    admin
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('release_id', releaseId)
      .eq('category', SONG_CATEGORY),
    readHasTeam(admin, auth.user.id).catch(() => null),
  ]);

  let hasCoverArt: boolean | null = null;
  if (!releaseResult.error) {
    const artworkId = (releaseResult.data as { artwork_asset_id?: string | null } | null)
      ?.artwork_asset_id;
    if (!artworkId) {
      hasCoverArt = false;
    } else {
      // A pointer to a row that is gone reads as no artwork, as in distribution.
      const artwork = await admin.from('assets').select('id').eq('id', artworkId).maybeSingle();
      hasCoverArt = artwork.error ? null : Boolean(artwork.data);
    }
  }

  const hasSong = songResult.error || songResult.count === null ? null : songResult.count > 0;

  return NextResponse.json({ firstSteps: { hasSong, hasCoverArt, hasTeam } });
}
