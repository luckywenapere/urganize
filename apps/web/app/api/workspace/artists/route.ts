import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import {
  checkArtistAllowance,
  createWorkspaceArtist,
  listWorkspaceArtists,
} from '@/lib/artists-server';
import { recordLimitHit } from '@/lib/seats-server';

// The team's artist roster.
//
// Replaces the singular /api/workspace/artist, which returned exactly one row
// and had exactly one consumer. Both live behind NEXT_PUBLIC_FEATURE_WORKSPACE
// for the same reason it did: with the flag off, Settings falls back to the
// legacy "Artist profile" editor that writes profiles.artist_name, and these
// routes must 404 rather than half-answer.
//
// THE CEILING IS ENFORCED HERE AND IN ONE OTHER PLACE. `POST /api/releases`
// will mint an artist for any caller that names one we have not seen, so this
// route is not the only door. Both call `checkArtistAllowance`. See the note on
// that helper.
//
// Rename lives in [artistId]/route.ts because it names a specific artist; a
// roster has no single subject for a PATCH.

const isFlagOn = () => process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

/** The wire shape, shared by both handlers so the client sees one artist type. */
function toPayload(artist: { id: string; name: string; slug: string }) {
  return { id: artist.id, name: artist.name, slug: artist.slug };
}

export async function GET(request: NextRequest) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    const artists = await listWorkspaceArtists(adminClient, access.primaryWorkspaceId);

    // The ceiling rides along so Settings can show "2 of 5" and disable Add
    // without a second round trip. `null` means no ceiling OR an unreadable
    // tier, and the client renders nothing either way — the honest fallback,
    // matching how the seat limit is surfaced on /api/workspace/members.
    const allowance = await checkArtistAllowance(adminClient, access.primaryWorkspaceId);

    return NextResponse.json({
      workspaceId: access.primaryWorkspaceId,
      artists: artists.map(toPayload),
      artistLimit: allowance.limit,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load artists.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name : '';

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    // Validation before the ceiling, so an empty name is answered as the
    // mistake it is rather than as a billing problem.
    if (!name.trim()) {
      return NextResponse.json({ error: 'Artist name cannot be empty.' }, { status: 400 });
    }

    const allowance = await checkArtistAllowance(adminClient, access.primaryWorkspaceId);
    if (!allowance.allowed) {
      await recordLimitHit(adminClient, {
        workspaceId: access.primaryWorkspaceId,
        actorUserId: auth.user.id,
        key: allowance.key,
        limit: allowance.limit,
        current: allowance.current,
      });
      return NextResponse.json({ error: allowance.message }, { status: 409 });
    }

    // owner_user_id is the ACTING user, matching what the lookup-or-create
    // branch in POST /api/releases has always written. It is retained for the
    // cascade to auth.users and the existing RLS pattern; workspace_id is what
    // scopes the artist, and that is what every read filters on.
    const result = await createWorkspaceArtist(adminClient, {
      workspaceId: access.primaryWorkspaceId,
      ownerUserId: auth.user.id,
      name,
    });

    if (result.conflict) {
      return NextResponse.json(
        { error: result.error || 'That artist is already on your roster.' },
        { status: 409 }
      );
    }
    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error || 'Could not add artist.' }, { status: 400 });
    }

    return NextResponse.json(
      { workspaceId: access.primaryWorkspaceId, artist: toPayload(result.data) },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not add artist.' },
      { status: 500 }
    );
  }
}
