import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, ensureOwnedWorkspace, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { ARTISTS_TABLE } from '@/lib/artists-server';
import { canImportOnto } from '@/lib/artist-merge';
import { isImportProvider, isSafeSourceId } from '@/lib/artist-import/providers';
import { importArtistCatalogue } from '@/lib/artist-import/server';
import { enrichCatalogueCodes } from '@/lib/artist-import/links-server';
import { afterResponse } from '@/lib/after-response';

// Saves an artist and their releases onto the signed-in team. Body:
// { provider, id, name, artistId? }; artistId puts the releases on a roster
// artist the person chose (#865). That artist can be on the team the person
// belongs to, not only the one they own, because the Artists page shows the
// team's roster: the releases are saved onto the artist's own team. The releases are pulled again here from the source
// id, so a client can never send a list of releases to store.
export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as {
    provider?: unknown;
    id?: unknown;
    name?: unknown;
    artistId?: unknown;
    sync?: unknown;
  } | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!body || !isImportProvider(body.provider) || !isSafeSourceId(body.id) || !name) {
    return NextResponse.json({ error: 'Choose an artist first.' }, { status: 400 });
  }

  const artistId = typeof body.artistId === 'string' && body.artistId ? body.artistId : undefined;

  try {
    const workspace = await ensureOwnedWorkspace(auth.adminClient, auth.user);
    let workspaceId = workspace.id;
    if (artistId) {
      const chosen = await auth.adminClient
        .from(ARTISTS_TABLE)
        .select('workspace_id')
        .eq('id', artistId)
        .maybeSingle();
      const artistWorkspaceId = String((chosen.data as { workspace_id?: string } | null)?.workspace_id ?? '');
      if (artistWorkspaceId && artistWorkspaceId !== workspace.id) {
        const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
        const ownerId = access.primaryWorkspace?.ownerId ?? '';
        const allowed =
          artistWorkspaceId === access.primaryWorkspaceId &&
          canImportOnto({
            isOwner: ownerId === auth.user.id,
            role: access.memberRoleByOwnerId[ownerId],
            scopeArtistId: access.artistScopeByWorkspaceId[artistWorkspaceId] ?? null,
            artistId,
          });
        if (!allowed) {
          return NextResponse.json({ error: 'You cannot add releases to that artist.' }, { status: 403 });
        }
        workspaceId = artistWorkspaceId;
      }
    }
    const outcome = await importArtistCatalogue(auth.adminClient, {
      workspaceId,
      userId: auth.user.id,
      provider: body.provider,
      sourceId: body.id,
      name,
      artistId,
      sync: body.sync !== false,
    });
    if (!outcome.ok) {
      const status = outcome.reason === 'artist_limit' ? 403 : outcome.reason === 'source_unreachable' ? 502 : 500;
      return NextResponse.json({ error: outcome.message, reason: outcome.reason }, { status });
    }
    // UPC and ISRC fill in after the reply; the catalogue read finishes what
    // this batch leaves.
    afterResponse('catalogue codes', () => enrichCatalogueCodes(auth.adminClient, outcome.artistId));
    return NextResponse.json(outcome);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not import the artist.' },
      { status: 500 }
    );
  }
}
