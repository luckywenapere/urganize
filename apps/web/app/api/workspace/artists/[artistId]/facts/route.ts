import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { validateFactInput } from '@/lib/artist-facts';
import {
  listArtistFacts,
  loadFactAuthors,
  resolveFactArtist,
  saveArtistFact,
} from '@/lib/artist-facts-server';
import { logFactEdit } from './log';

// What UrgAns remembers about one artist (lib/artist-facts.ts). GET lists the
// facts with the first names of who said them; POST adds or replaces one by
// hand. UrgAns writes through its own tools (save_artist_fact), not here.

export async function GET(request: NextRequest, context: { params: Promise<{ artistId: string }> }) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { artistId } = await context.params;

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
  const artist = await resolveFactArtist(auth.adminClient, access, artistId);
  if (!artist) return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });

  const facts = await listArtistFacts(auth.adminClient, artist.id);
  const authors = await loadFactAuthors(auth.adminClient, facts);
  return NextResponse.json({ facts, authors, me: auth.user.id });
}

export async function POST(request: NextRequest, context: { params: Promise<{ artistId: string }> }) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { artistId } = await context.params;
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
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

  await logFactEdit(auth.adminClient, {
    tool: 'memory.save_fact',
    userId: auth.user.id,
    artist,
    before: saved.plan.kind === 'replace' ? saved.plan.previous : null,
    after: saved.fact,
  });
  return NextResponse.json({ fact: saved.fact });
}
