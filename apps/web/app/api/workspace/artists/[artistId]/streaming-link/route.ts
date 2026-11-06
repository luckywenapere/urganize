import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { isImportProvider, isSafeSourceId } from '@/lib/artist-import/providers';
import { linkArtistStreaming, skipArtistStreaming } from '@/lib/artist-streaming/server';
import { importArtistCatalogue } from '@/lib/artist-import/server';
import { enrichCatalogueCodes } from '@/lib/artist-import/links-server';
import { fillArtistRollouts } from '@/lib/release-out-now/server';
import { afterResponse } from '@/lib/after-response';

// Linking one artist to their streaming profile (Nov 2026, #1088).
//
// POST { provider: 'deezer' | 'itunes', id }   link them; the server checks the
//   id with the service itself and links the other services on its own.
// POST { notOnStreaming: true }                 stop asking for now.
//
// The artist must be on the caller's team: another team's artist reads as not found.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const isFlagOn = () => process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

export async function POST(request: NextRequest, context: { params: Promise<{ artistId: string }> }) {
  if (!isFlagOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;
  const { artistId } = await context.params;
  if (!artistId) return NextResponse.json({ error: 'Artist id is required.' }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { provider?: unknown; id?: unknown; notOnStreaming?: unknown };

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    const workspaceId = access.primaryWorkspaceId;
    if (!workspaceId) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });

    if (body.notOnStreaming === true) {
      const found = await skipArtistStreaming(adminClient, { workspaceId, artistId });
      return found
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: 'That artist is not on your team.' }, { status: 404 });
    }

    if (!isImportProvider(body.provider) || !isSafeSourceId(body.id)) {
      return NextResponse.json({ error: 'Pick the artist from the list.' }, { status: 400 });
    }
    const result = await linkArtistStreaming(adminClient, {
      workspaceId,
      artistId,
      provider: body.provider,
      sourceId: body.id,
    });
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
    // After the reply (#1090): their old releases come in, the same as the
    // import, and every rollout of theirs already here gets its codes and
    // smart link. Nothing about it is shown.
    const provider = body.provider;
    const sourceId = body.id;
    afterResponse('link fills the past', async () => {
      const imported = await importArtistCatalogue(adminClient, {
        workspaceId,
        userId: auth.user.id,
        provider,
        sourceId,
        name: '',
        artistId,
      });
      if (imported.ok) await enrichCatalogueCodes(adminClient, artistId);
      await fillArtistRollouts(adminClient, artistId);
    });
    return NextResponse.json({ ok: true, linked: result.linked });
  } catch (error) {
    console.error('[artist-streaming] link failed', { artistId, message: error instanceof Error ? error.message : 'error' });
    return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 });
  }
}
