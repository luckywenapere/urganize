import { NextRequest, NextResponse } from 'next/server';
import { requireActiveAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import { ensureReleaseOwnership } from '@/app/api/releases/_shared';
import { listWorkspaceArtists, reassignReleaseArtist } from '@/lib/artists-server';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';

// POST /api/releases/[releaseId]/artist — file this release under a different
// artist. Body: { artistId: string }.
//
// WHY THIS EXISTS AT ALL. Rosters shipped 2026-08-30 with a picker on release
// creation, and that picker preselects the first artist — so filing a release
// under the wrong one became possible for the first time, with no way to
// correct it short of deleting the release. This is the correction.
//
// WHY A DEDICATED ROUTE RATHER THAN PATCH, and it is a stronger reason than the
// archive route's. The release PATCH is a full-row replace that DELIBERATELY
// refuses to touch the artist: with the workspace flag on it ignores
// `body.artistName` and rewrites the existing value, precisely so the edit form
// cannot desync the cached name from the link. Accepting an artist there would
// reopen the thing that guard exists to prevent. This route owns the artist and
// touches nothing else.
//
// OWNER-ONLY, and that is a real decision rather than copied convention.
// Everything else in the release-scene group is team-aware since v1.5.1, but
// moving a release CHANGES WHO CAN SEE IT: an artist-scoped teammate sees
// exactly the releases whose artist_id matches their scope, so this grants the
// release to one person's view and removes it from another's. That is an access
// change wearing the clothes of an edit, and it belongs with the other
// owner-only release-row mutations (PATCH, DELETE, schedule, archive).
//
// Not flag-gated: it is reachable only from the roster UI, which is already
// behind NEXT_PUBLIC_FEATURE_WORKSPACE, and a release always has an artist, so
// there is no state here that does not already exist.

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'A release id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const artistId = typeof body?.artistId === 'string' ? body.artistId.trim() : '';
  if (!artistId) {
    return NextResponse.json({ error: 'An artist is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  // Owner-only, and 404 rather than 403 on someone else's release — the
  // established convention in this route group, so ownership is not probeable.
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  try {
    // The target has to be on the CALLER'S roster. Resolving it that way rather
    // than reading the artist row and comparing workspaces afterwards means an
    // artist on someone else's team is indistinguishable from one that does not
    // exist, so this cannot be used to probe for ids — the same shape the
    // rename route uses.
    //
    // primaryWorkspaceId is the right workspace here even though it can resolve
    // to a JOINED team for someone who owns no releases: this caller owns THIS
    // release, so that exception cannot apply.
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    const roster = await listWorkspaceArtists(adminClient, access.primaryWorkspaceId);
    const target = roster.find((artist) => artist.id === artistId);
    if (!target) {
      return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
    }

    if (ownership.release.artistId === target.id) {
      return NextResponse.json({
        artist: { id: target.id, name: target.name },
        changed: false,
      });
    }

    const result = await reassignReleaseArtist(adminClient, {
      releaseId,
      artist: target,
    });
    if (result.error) {
      console.error('[releases/artist] could not reassign:', result.error);
      return NextResponse.json({ error: 'Could not move this release.' }, { status: 500 });
    }

    return NextResponse.json({
      artist: { id: target.id, name: target.name },
      changed: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not move this release.' },
      { status: 500 }
    );
  }
}
