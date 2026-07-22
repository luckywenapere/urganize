import { NextRequest, NextResponse } from 'next/server';
import {
  buildTaskSchemaResponse,
  getAuthenticatedAdmin,
  isTaskSchemaMissingError,
  loadWorkspaceAccessContext,
} from '@/lib/tasks-server';
import {
  getWorkspaceArtist,
  renameWorkspaceArtist,
} from '@/lib/artists-server';

// Both routes are gated by NEXT_PUBLIC_FEATURE_WORKSPACE so the legacy
// behaviour (Settings "Artist profile" writes profiles.artist_name)
// continues to work in environments where the flag is off. When the flag is
// off these routes return 404 so the client can fall back to the legacy UI.

const isFlagOn = () => process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

export async function GET(request: NextRequest) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    const artist = await getWorkspaceArtist(adminClient, access.primaryWorkspaceId);

    return NextResponse.json({
      workspaceId: access.primaryWorkspaceId,
      artist: artist
        ? {
            id: artist.id,
            name: artist.name,
            slug: artist.slug,
          }
        : null,
    });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load workspace artist.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const nextName = typeof body.name === 'string' ? body.name : '';

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    const artist = await getWorkspaceArtist(adminClient, access.primaryWorkspaceId);
    if (!artist) {
      return NextResponse.json(
        { error: 'No artist exists for this workspace yet. Create a release to seed one.' },
        { status: 404 }
      );
    }

    // Workspace ownership is implied by primaryWorkspaceId resolving — that
    // helper only returns workspaces the user owns or is a member of. For
    // the rename path we additionally check that the artist's workspace_id
    // matches the resolved workspace (no cross-tenant edits).
    if (artist.workspaceId !== access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await renameWorkspaceArtist(adminClient, artist.id, nextName);
    if (result.conflict) {
      // Another artist in the same workspace already owns this slug. The
      // pre-check / 23505 backstop in renameWorkspaceArtist supplied the
      // user-facing message; surface it with HTTP 409 so the client can
      // tell "conflict" apart from "validation error".
      return NextResponse.json(
        { error: result.error || 'An artist with that name already exists in this workspace.' },
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
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not rename workspace artist.' },
      { status: 500 }
    );
  }
}
