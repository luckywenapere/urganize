import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { canJoinArtists, dismissArtistPair, joinArtists, loadDuplicatePairs } from '@/lib/artist-merge-server';

// Look-alike artists on the team (#865): "Dorian" and "Babyboy Dorian".
//
// GET lists the pairs to ask about. Only the owner and admins get any, since a
// join removes an artist; everyone else gets an empty list, not an error.
// POST answers one pair: { action: 'join', keepId, dropId } moves everything
// onto keepId and removes dropId; { action: 'dismiss', a, b } remembers they
// are different people.

const isFlagOn = () => process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

export async function GET(request: NextRequest) {
  if (!isFlagOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
    if (!access.primaryWorkspaceId || !canJoinArtists(access, auth.user)) {
      return NextResponse.json({ pairs: [] });
    }
    const pairs = await loadDuplicatePairs(auth.adminClient, access.primaryWorkspaceId);
    return NextResponse.json({ pairs });
  } catch {
    return NextResponse.json({ pairs: [] });
  }
}

export async function POST(request: NextRequest) {
  if (!isFlagOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const action = text(body?.action);
  if (action !== 'join' && action !== 'dismiss') {
    return NextResponse.json({ error: 'Choose join or dismiss.' }, { status: 400 });
  }

  try {
    const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
    if (!access.primaryWorkspaceId) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    if (!canJoinArtists(access, auth.user)) {
      return NextResponse.json({ error: 'Only the team owner or an admin can do this.' }, { status: 403 });
    }

    const error =
      action === 'join'
        ? await joinArtists(auth.adminClient, {
            workspaceId: access.primaryWorkspaceId,
            keepId: text(body?.keepId),
            dropId: text(body?.dropId),
          })
        : await dismissArtistPair(auth.adminClient, {
            workspaceId: access.primaryWorkspaceId,
            userId: auth.user.id,
            a: text(body?.a),
            b: text(body?.b),
          });
    if (error) return NextResponse.json({ error }, { status: error === 'Artist not found.' ? 404 : 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save that.' },
      { status: 500 }
    );
  }
}
