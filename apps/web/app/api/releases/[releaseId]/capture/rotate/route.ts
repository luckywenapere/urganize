import { NextRequest, NextResponse } from 'next/server';
import {
  CAPTURE_PAGE_COLUMNS,
  RELEASE_CAPTURE_PAGES_TABLE,
  createAdminClient,
  ensureReleaseTeamWriteAccess,
  generateShareToken,
  isCaptureFeatureEnabled,
  requireActiveAuthenticatedUser,
  toReleaseCapturePage,
} from '../_shared';

/**
 * Rotate a capture page's share token (2026-08-14).
 *
 * Its own endpoint rather than a flag on PATCH, and that separation is the
 * point: the editor autosaves on a debounce, so anything reachable from a save
 * can happen without the manager meaning it — and rotating kills a URL that
 * may already be in a bio, a story, and a hundred DMs.
 *
 * An UPDATE, not a delete-and-recreate (the credits-link precedent): the old
 * token stops resolving the instant this commits, while the authored copy and
 * every email already collected stay exactly where they are.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isCaptureFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const { data: updated, error } = await adminClient
    .from(RELEASE_CAPTURE_PAGES_TABLE)
    .update({ share_token: generateShareToken() })
    .eq('release_id', releaseId)
    .select(CAPTURE_PAGE_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not create a new link.' },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: 'No capture page exists yet for this release.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ page: toReleaseCapturePage(updated as Record<string, unknown>) });
}
