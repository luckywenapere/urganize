import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { validateFactInput } from '@/lib/artist-facts';
import { deleteArtistFact, resolveFactArtist, saveArtistFact } from '@/lib/artist-facts-server';
import { logFactEdit } from '../log';

type Params = { params: Promise<{ artistId: string; factId: string }> };

// Change or remove one fact by hand, from the artist page.

export async function PATCH(request: NextRequest, context: Params) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { artistId, factId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { topic?: unknown; value?: unknown };

  const input = validateFactInput({ topic: body.topic, value: body.value });
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
  const artist = await resolveFactArtist(auth.adminClient, access, artistId);
  if (!artist) return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });

  const saved = await saveArtistFact(auth.adminClient, {
    artist,
    topic: input.topic,
    value: input.value,
    source: 'manual',
    userId: auth.user.id,
    factId,
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

  if (saved.plan.kind === 'replace') {
    await logFactEdit(auth.adminClient, {
      tool: 'memory.save_fact',
      userId: auth.user.id,
      artist,
      before: saved.plan.previous,
      after: saved.fact,
    });
  }
  return NextResponse.json({ fact: saved.fact });
}

export async function DELETE(request: NextRequest, context: Params) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { artistId, factId } = await context.params;

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
  const artist = await resolveFactArtist(auth.adminClient, access, artistId);
  if (!artist) return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });

  const removed = await deleteArtistFact(auth.adminClient, artist, factId);
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status });

  await logFactEdit(auth.adminClient, {
    tool: 'memory.forget_fact',
    userId: auth.user.id,
    artist,
    before: removed.fact,
    after: null,
  });
  return NextResponse.json({ ok: true });
}
