import { NextRequest, NextResponse } from 'next/server';
import {
  CONTENT_POSTS_TABLE,
  createAdminClient,
  ensureCalendarInRelease,
  ensureReleaseOwnership,
  isContentCalendarFeatureEnabled,
  isValidPostFormat,
  isValidPostPillar,
  isValidPostStatus,
  isValidScheduledDate,
  loadSharedGroupCounts,
  requireActiveAuthenticatedUser,
  toContentPost,
  validatePostCaption,
  validatePostTitle,
} from '../../content-calendars/_shared';

type RouteContext = { params: Promise<{ releaseId: string; postId: string }> };

// 404 (never 403) when the post is missing or hangs off another release, so
// probing cannot tell the difference. Release ownership is already proven by
// ensureReleaseOwnership before this runs.
async function loadPostInRelease(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  postId: string,
  releaseId: string
): Promise<{ error: NextResponse } | { post: Record<string, unknown> }> {
  const { data: post, error } = await adminClient
    .from(CONTENT_POSTS_TABLE)
    .select('*')
    .eq('id', postId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message || 'Could not load post.' }, { status: 500 }) };
  }

  if (!post || String(post.release_id || '') !== releaseId) {
    return { error: NextResponse.json({ error: 'Post not found.' }, { status: 404 }) };
  }

  return { post: post as Record<string, unknown> };
}

type PostPatchBody = {
  applyToLinked?: unknown;
  calendarId?: unknown;
  scheduledDate?: unknown;
  title?: unknown;
  caption?: unknown;
  format?: unknown;
  status?: unknown;
  pillar?: unknown;
  postedUrl?: unknown;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isContentCalendarFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, postId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }
  if (!postId) {
    return NextResponse.json({ error: 'Post id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const existing = await loadPostInRelease(adminClient, postId, releaseId);
  if ('error' in existing) return existing.error;

  const body = (await request.json().catch(() => null)) as PostPatchBody | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 });
  }

  // Phase A: no linked-sibling propagation. Rejected rather than silently
  // ignored so a Phase B client cannot half-work against a Phase A server.
  if (body.applyToLinked !== undefined) {
    return NextResponse.json({ error: 'Sharing is not available yet.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.calendarId !== undefined) {
    const calendarId = typeof body.calendarId === 'string' ? body.calendarId.trim() : '';
    if (!calendarId) {
      return NextResponse.json({ error: 'calendarId must be a non-empty string.' }, { status: 400 });
    }
    // Tenancy boundary (hardening item 1): a post can only move to a
    // calendar on the same release.
    const calendarCheck = await ensureCalendarInRelease(adminClient, calendarId, releaseId);
    if ('error' in calendarCheck) return calendarCheck.error;
    updates.calendar_id = calendarId;
  }

  if (body.scheduledDate !== undefined) {
    if (!isValidScheduledDate(body.scheduledDate)) {
      return NextResponse.json(
        { error: 'scheduledDate must use YYYY-MM-DD format.' },
        { status: 400 }
      );
    }
    updates.scheduled_date = body.scheduledDate;
  }

  if (body.title !== undefined) {
    const title = validatePostTitle(body.title);
    if (title.error) {
      return NextResponse.json({ error: title.error }, { status: 400 });
    }
    updates.title = title.value;
  }

  if (body.caption !== undefined) {
    const caption = validatePostCaption(body.caption);
    if (caption.error) {
      return NextResponse.json({ error: caption.error }, { status: 400 });
    }
    updates.caption = caption.value;
  }

  if (body.format !== undefined) {
    if (!isValidPostFormat(body.format)) {
      return NextResponse.json(
        { error: 'Pick a format from the list.' },
        { status: 400 }
      );
    }
    updates.format = body.format;
  }

  if (body.status !== undefined) {
    if (!isValidPostStatus(body.status)) {
      return NextResponse.json(
        { error: 'Status must be Draft, Ready or Posted.' },
        { status: 400 }
      );
    }
    updates.status = body.status;
  }

  if (body.pillar !== undefined) {
    if (body.pillar !== null && !isValidPostPillar(body.pillar)) {
      return NextResponse.json(
        { error: 'Pick a pillar from the list, or leave it empty.' },
        { status: 400 }
      );
    }
    updates.pillar = body.pillar;
  }

  if (body.postedUrl !== undefined) {
    if (body.postedUrl !== null && typeof body.postedUrl !== 'string') {
      return NextResponse.json({ error: 'postedUrl must be a string or null.' }, { status: 400 });
    }
    // Meaningful once status is posted, but deliberately not hard-blocked on
    // it (the modal saves status and link together). Empty clears the link.
    const postedUrl = typeof body.postedUrl === 'string' ? body.postedUrl.trim() : '';
    updates.posted_url = postedUrl || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
  }

  const updateResult = await adminClient
    .from(CONTENT_POSTS_TABLE)
    .update(updates)
    .eq('id', postId)
    .eq('release_id', releaseId)
    .select('*')
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    return NextResponse.json(
      { error: updateResult.error?.message || 'Could not update post.' },
      { status: 500 }
    );
  }

  const updated = updateResult.data as Record<string, unknown>;

  // Phase A: shared_group_id is always null, so this resolves to 1 without a
  // query (hardening item 14 keeps the read path ready for Phase B).
  const sharedCounts = await loadSharedGroupCounts(adminClient, [
    updated.shared_group_id ? String(updated.shared_group_id) : null,
  ]);
  if ('error' in sharedCounts) return sharedCounts.error;

  const sharedCount = updated.shared_group_id
    ? sharedCounts.counts.get(String(updated.shared_group_id)) || 1
    : 1;

  return NextResponse.json({ post: toContentPost(updated, sharedCount) });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isContentCalendarFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, postId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }
  if (!postId) {
    return NextResponse.json({ error: 'Post id is required.' }, { status: 400 });
  }

  // Phase A: no linked-sibling delete.
  if (request.nextUrl.searchParams.get('linked') === 'true') {
    return NextResponse.json({ error: 'Sharing is not available yet.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const existing = await loadPostInRelease(adminClient, postId, releaseId);
  if ('error' in existing) return existing.error;

  const deleteResult = await adminClient
    .from(CONTENT_POSTS_TABLE)
    .delete()
    .eq('id', postId)
    .eq('release_id', releaseId);

  if (deleteResult.error) {
    return NextResponse.json(
      { error: deleteResult.error.message || 'Could not delete post.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
