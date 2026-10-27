import { NextRequest, NextResponse } from 'next/server';
import { isPostPlatform, isPostStatus, isValidDay, MAX_WHAT_LENGTH } from '@/lib/posting-plan';
import { deleteArtistPost, updateArtistPost, type PostPatch } from '@/lib/posting-plan-server';
import { loadPosters, resolvePostingScope } from '../_shared';

// Change or remove one planned post (2026-10-27): mark it done or skipped,
// move its day, or edit what, where and who.

type Params = { params: Promise<{ artistId: string; postId: string }> };

export async function PATCH(request: NextRequest, context: Params) {
  const { artistId, postId } = await context.params;
  const scope = await resolvePostingScope(request, artistId);
  if ('error' in scope) return scope.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: PostPatch = {};
  if (body.what !== undefined) {
    const what = typeof body.what === 'string' ? body.what.trim() : '';
    if (!what || what.length > MAX_WHAT_LENGTH) {
      return NextResponse.json({ error: 'Say what to post, in under 200 characters.' }, { status: 400 });
    }
    patch.what = what;
  }
  if (body.postDay !== undefined) {
    if (!isValidDay(body.postDay)) return NextResponse.json({ error: 'Pick a day.' }, { status: 400 });
    patch.postDay = body.postDay;
  }
  if (body.platform !== undefined) patch.platform = isPostPlatform(body.platform) ? body.platform : null;
  if (body.status !== undefined) {
    if (!isPostStatus(body.status)) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
    patch.status = body.status;
  }

  try {
    if (body.ownerUserId !== undefined) {
      const people = new Set((await loadPosters(scope)).map((person) => person.userId));
      if (typeof body.ownerUserId !== 'string' || !people.has(body.ownerUserId)) {
        return NextResponse.json({ error: 'Pick someone on your team.' }, { status: 400 });
      }
      patch.ownerUserId = body.ownerUserId;
    }
    const post = await updateArtistPost(scope.adminClient, { workspaceId: scope.workspaceId, artistId, postId }, patch);
    if (!post) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    return NextResponse.json({ post });
  } catch (error) {
    console.error('[posting-plan] update failed:', error);
    return NextResponse.json({ error: 'Could not save the post.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: Params) {
  const { artistId, postId } = await context.params;
  const scope = await resolvePostingScope(request, artistId);
  if ('error' in scope) return scope.error;

  try {
    const removed = await deleteArtistPost(scope.adminClient, { workspaceId: scope.workspaceId, artistId, postId });
    if (!removed) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[posting-plan] delete failed:', error);
    return NextResponse.json({ error: 'Could not remove the post.' }, { status: 500 });
  }
}
