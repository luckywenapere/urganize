import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, ensureOwnedWorkspace } from '@/lib/tasks-server';
import { isImportProvider, isSafeSourceId } from '@/lib/artist-import/providers';
import { importArtistCatalogue } from '@/lib/artist-import/server';

// Saves an artist and their releases onto the signed-in team. Body:
// { provider, id, name }. The releases are pulled again here from the source
// id, so a client can never send a list of releases to store.
export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as { provider?: unknown; id?: unknown; name?: unknown } | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!body || !isImportProvider(body.provider) || !isSafeSourceId(body.id) || !name) {
    return NextResponse.json({ error: 'Choose an artist first.' }, { status: 400 });
  }

  try {
    const workspace = await ensureOwnedWorkspace(auth.adminClient, auth.user);
    const outcome = await importArtistCatalogue(auth.adminClient, {
      workspaceId: workspace.id,
      userId: auth.user.id,
      provider: body.provider,
      sourceId: body.id,
      name,
    });
    if (!outcome.ok) {
      const status = outcome.reason === 'artist_limit' ? 403 : outcome.reason === 'source_unreachable' ? 502 : 500;
      return NextResponse.json({ error: outcome.message, reason: outcome.reason }, { status });
    }
    return NextResponse.json(outcome);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not import the artist.' },
      { status: 500 }
    );
  }
}
