import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { isPitchKitEnabled, loadPitchKit } from '@/lib/release-epk-server';
import { saveReleaseKitArtist, type ArtistKitPatch } from '@/lib/release-kit-publish-server';

/**
 * PUT: the About {artist} row in a rollout's Pitch this! (2026-10-17). Saves
 * the artist's short bio and/or who to write to straight onto the artist's
 * standing kit, making the kit first when there is none, and answers the
 * fresh pitch kit. See saveReleaseKitArtist for the rules.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  if (!isPitchKitEnabled() || process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS !== 'true') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send what you want to save.' }, { status: 400 });
  }
  const patch: ArtistKitPatch = {};
  if (typeof body.shortBio === 'string') patch.shortBio = body.shortBio;
  if (typeof body.contactEmail === 'string') patch.contactEmail = body.contactEmail;
  if (patch.shortBio === undefined && patch.contactEmail === undefined) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const result = await saveReleaseKitArtist(admin, { releaseId, actorUserId: auth.user.id, patch });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
  const fresh = await loadPitchKit(admin, releaseId);
  if ('error' in fresh) return NextResponse.json({ error: fresh.error }, { status: fresh.status });
  return NextResponse.json({ pitchKit: fresh.pitchKit });
}
