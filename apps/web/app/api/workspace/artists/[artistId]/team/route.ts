import { NextRequest, NextResponse } from 'next/server';
import {
  loadWorkspaceAccessContext,
  loadWorkspaceMembers,
  requireAuthenticatedAdmin,
} from '@/lib/tasks-server';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { splitTeamByArtistScope } from '@/lib/artist-overview';

// Who works on one artist, for the artist page (Catalogue, Phase 1).
//
// Read-only. Members limited to this artist (workspace_members.artist_scope_id)
// come back apart from those who see every artist. `GET /api/workspace/members`
// does not carry the scope, and widening that payload would reach every surface
// that reads it, so the question is answered here instead.
//
// Behind the artist page's flag AND the workspace flag the artist routes
// already need. A 404 when either is off, the plan/EPK precedent.

const isFlagOn = () =>
  process.env.NEXT_PUBLIC_FEATURE_ARTIST_PAGE === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ artistId: string }> }
) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const { artistId } = await context.params;
  if (!artistId) {
    return NextResponse.json({ error: 'Artist id is required.' }, { status: 400 });
  }

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    const workspaceId = access.primaryWorkspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    // Authorize through the caller's own roster, so an artist on another team
    // is indistinguishable from one that does not exist.
    const roster = await listWorkspaceArtists(adminClient, workspaceId);
    if (!roster.some((artist) => artist.id === artistId)) {
      return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
    }

    const [members, scopeResult] = await Promise.all([
      loadWorkspaceMembers(adminClient, workspaceId, auth.user.id),
      adminClient
        .from('workspace_members')
        .select('id, artist_scope_id')
        .eq('workspace_id', workspaceId)
        .neq('status', 'removed'),
    ]);
    if (scopeResult.error) throw scopeResult.error;

    const scopeByMemberId = new Map<string, string | null>(
      (scopeResult.data || []).map((row) => [
        String(row.id),
        row.artist_scope_id ? String(row.artist_scope_id) : null,
      ])
    );

    const { scoped, everyone } = splitTeamByArtistScope(members, scopeByMemberId, artistId);
    const shape = (list: typeof members) =>
      list.map((member) => ({
        id: member.id,
        name: member.name || member.email,
        role: member.role,
        status: member.status,
      }));

    return NextResponse.json({ scoped: shape(scoped), everyone: shape(everyone) });
  } catch {
    return NextResponse.json({ error: 'Could not load the team.' }, { status: 500 });
  }
}
