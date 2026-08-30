import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import {
  countArtistDeletionBlockers,
  deleteWorkspaceArtist,
  describeArtistDeletionBlock,
  listWorkspaceArtists,
  renameWorkspaceArtist,
} from '@/lib/artists-server';

// Rename or remove one artist.
//
// PATCH is the whole of what the singular /api/workspace/artist's PATCH used to
// do, except that it names its subject instead of assuming there is only one.
// `renameWorkspaceArtist` is unchanged and still write-throughs to the artist
// name cached on every one of that artist's releases and their metadata rows.
//
// DELETE ONLY EVER REMOVES AN ARTIST THAT IS ATTACHED TO NOTHING, and both
// refusals are deliberate rather than conservative:
//
//   - Releases. The database refuses this too since 20260830100000 made
//     releases_artist_id_fkey ON DELETE RESTRICT, but as a constraint error. The
//     check here is what makes it a sentence naming the number. Cascading was
//     never on the table: it would destroy release history, files and credits
//     behind a button labelled "remove".
//   - Teammates scoped to this artist. Nothing in the database stops this, and
//     it is the quieter harm: artist_scope_id is ON DELETE SET NULL and NULL
//     means FULL visibility, so removing the artist silently promotes them to
//     seeing every release.
//
// Reassigning-on-delete was rejected: it hides a data decision inside a delete.
// Moving releases is its own explicit action (POST /api/releases/[id]/artist).

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

export async function DELETE(
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

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    // Same authorization shape as PATCH: read the caller's OWN roster and look
    // for this id, so an artist on another team is indistinguishable from one
    // that does not exist and this cannot be used to probe for ids.
    const roster = await listWorkspaceArtists(adminClient, access.primaryWorkspaceId);
    const target = roster.find((artist) => artist.id === artistId);
    if (!target) {
      return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
    }

    // Refusing to remove the LAST artist is not about data integrity — that
    // delete would succeed. It is that a team with no artist has no implicit
    // artist for release creation to fall back on, so the next release would
    // silently mint one from the owner's name. Keeping one is the honest floor.
    if (roster.length === 1) {
      return NextResponse.json(
        { error: 'This is your only artist. Add another before removing this one.' },
        { status: 409 }
      );
    }

    // FAILS CLOSED: null means we could not read what would be lost, and
    // describeArtistDeletionBlock turns that into a refusal rather than letting
    // the delete proceed on an unknown.
    const blockers = await countArtistDeletionBlockers(adminClient, artistId);
    const blocked = describeArtistDeletionBlock(blockers);
    if (blocked) {
      return NextResponse.json({ error: blocked, blockers }, { status: 409 });
    }

    const result = await deleteWorkspaceArtist(adminClient, {
      artistId,
      workspaceId: access.primaryWorkspaceId,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ removed: { id: target.id, name: target.name } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not remove this artist.' },
      { status: 500 }
    );
  }
}
