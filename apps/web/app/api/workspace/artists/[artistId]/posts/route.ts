import { NextRequest, NextResponse } from 'next/server';
import { addDays, lagosDay } from '@/lib/whatsapp/chase-rules';
import { normalizePostInput, weekStart, type PostInput } from '@/lib/posting-plan';
import { createArtistPosts, listArtistPosts } from '@/lib/posting-plan-server';
import { loadPosters, resolvePostingScope } from './_shared';

// One artist's posting plan (2026-10-27). GET: eight weeks back to ten ahead,
// plus today and who can post. POST: one post, or { posts: [...] } for a week
// UrgAns laid out. Note: docs/notes/2026-10-27-posting-plan.md.

const MAX_POSTS_PER_CALL = 60;

export async function GET(request: NextRequest, context: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await context.params;
  const scope = await resolvePostingScope(request, artistId);
  if ('error' in scope) return scope.error;

  try {
    const today = lagosDay(new Date());
    const monday = weekStart(today);
    const [posts, people] = await Promise.all([
      listArtistPosts(scope.adminClient, scope.workspaceId, artistId, {
        from: addDays(monday, -56),
        to: addDays(monday, 70),
      }),
      loadPosters(scope),
    ]);
    return NextResponse.json({ today, artistName: scope.artistName, posts, people });
  } catch (error) {
    console.error('[posting-plan] list failed:', error);
    return NextResponse.json({ error: 'Could not load the posting plan.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await context.params;
  const scope = await resolvePostingScope(request, artistId);
  if ('error' in scope) return scope.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = Array.isArray(body.posts) ? (body.posts as Record<string, unknown>[]) : [body];
  if (!raw.length) return NextResponse.json({ error: 'Add at least one post.' }, { status: 400 });
  if (raw.length > MAX_POSTS_PER_CALL) {
    return NextResponse.json({ error: `Add up to ${MAX_POSTS_PER_CALL} posts at a time.` }, { status: 400 });
  }

  const posts: PostInput[] = [];
  for (const entry of raw) {
    const parsed = normalizePostInput(entry ?? {});
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    posts.push(parsed.value);
  }

  try {
    // Who posts has to be on the team; anyone else falls back to the caller.
    const people = new Set((await loadPosters(scope)).map((person) => person.userId));
    const checked = posts.map((post) => ({
      ...post,
      ownerUserId: post.ownerUserId && people.has(post.ownerUserId) ? post.ownerUserId : null,
    }));
    const created = await createArtistPosts(scope.adminClient, {
      workspaceId: scope.workspaceId,
      artistId,
      createdBy: scope.userId,
      posts: checked,
    });
    return NextResponse.json({ posts: created }, { status: 201 });
  } catch (error) {
    console.error('[posting-plan] create failed:', error);
    return NextResponse.json({ error: 'Could not add the post.' }, { status: 500 });
  }
}
