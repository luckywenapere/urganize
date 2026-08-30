import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { listWorkspaceArtists, renameWorkspaceArtist } from '@/lib/artists-server';

// Rename one artist.
//
// This is the whole of what the singular /api/workspace/artist's PATCH used to
// do, except that it names its subject instead of assuming there is only one.
// `renameWorkspaceArtist` is unchanged and still write-throughs to the artist
// name cached on every one of that artist's releases and their metadata rows.
//
// There is deliberately NO DELETE. Removing an artist needs an answer for what
// happens to their releases, and it has a quiet privacy edge:
// workspace_members.artist_scope_id is ON DELETE SET NULL, so deleting an
// artist silently upgrades a teammate scoped to them into seeing everything.
// Neither is a decision to make inside a route handler.

const isFlagOn = () => process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ artistId: string }> }
) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;
  const { artistId } = await context.params;

  if (!artistId) {
    return NextResponse.json({ error: 'Artist id is required.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const nextName = typeof body.name === 'string' ? body.name : '';

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    // Authorize by reading the caller's OWN roster and looking for this id,
    // rather than fetching the artist and comparing its workspace afterwards.
    // Same outcome, but an artist on someone else's team is indistinguishable
    // from one that does not exist, so this cannot be used to probe for ids.
    const roster = await listWorkspaceArtists(adminClient, access.primaryWorkspaceId);
    const target = roster.find((artist) => artist.id === artistId);
    if (!target) {
      return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
    }

    const result = await renameWorkspaceArtist(adminClient, target.id, nextName);
    if (result.conflict) {
      return NextResponse.json(
        { error: result.error || 'An artist with that name is already on your roster.' },
        { status: 409 }
      );
    }
    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error || 'Rename failed.' }, { status: 400 });
    }

    return NextResponse.json({
      workspaceId: access.primaryWorkspaceId,
      artist: {
        id: result.data.artist.id,
        name: result.data.artist.name,
        slug: result.data.artist.slug,
      },
      releasesUpdated: result.data.releasesUpdated,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not rename artist.' },
      { status: 500 }
    );
  }
}
