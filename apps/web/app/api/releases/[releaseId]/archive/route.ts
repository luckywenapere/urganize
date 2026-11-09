import { NextRequest, NextResponse } from 'next/server';
import { requireActiveAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import { ensureReleaseOwnership } from '@/app/api/releases/_shared';
import { decideArchiveToggle } from '@/lib/release-activity';

// POST /api/releases/[releaseId]/archive — shelve a finished release, or bring
// one back. Body: { archived: boolean }.
//
// WHY A DEDICATED ROUTE RATHER THAN PATCH. The release PATCH handler is a
// full-row REPLACE, not a merge: it unconditionally writes title, slug,
// release_date, description, artist_name and status from the request body. So a
// sparse `PATCH { status: 'archived' }` blanks the description and then 400s on
// the now-empty title. This route writes `status` and nothing else, which is the
// whole reason it exists. (Chappi's update_release works around the same trap by
// reading the release first and merging — see the note in its tool family.)
//
// Restore is the same endpoint with `archived: false`, deliberately. An archive
// that cannot be undone reads as a delete, and users treat it that way: they
// avoid it, keep dead releases around, and the active-release ceiling stops
// meaning anything. Restoring writes `draft` because nothing records what the
// status was before — see RESTORED_STATUS.
//
// Not flag-gated. Unusual for a new surface here, but `update_release` already
// accepts `status: 'archived'` and is not confirmation-gated, and the assistant
// is live — so archiving is already reachable in production and every path
// downstream of it (the identity card's active count, recap eligibility) is
// already live. A button adds a deliberate way to reach a state the assistant
// can already produce, not a new behaviour. It also keeps the Manager tier's
// cap copy honest: "archive one you have finished" must never be advice a user
// cannot take.

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'A rollout id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const archived = body?.archived;
  if (typeof archived !== 'boolean') {
    return NextResponse.json(
      { error: 'archived must be true or false.' },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  // Owner-only, and 404 rather than 403 on someone else's release — the
  // established convention in this route group, so ownership is not probeable.
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  // lib/release-activity.ts decides the move. Restoring something that was
  // never archived is a no-op now rather than a write of `draft` over it.
  const decision = decideArchiveToggle(ownership.release.status, archived);
  if (!decision.write) {
    return NextResponse.json({ releaseId, status: decision.status, archived });
  }
  const status = decision.to;

  const { data: written, error } = await adminClient
    .from('releases')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', releaseId)
    // The row's REAL owner, which the ownership check just resolved. Filtering
    // on the caller's id matched nothing for a team Manager (#854 lets them
    // archive), so their archive answered success and changed nothing.
    .eq('owner_user_id', ownership.release.ownerUserId)
    // Still in the state the decision was made from: two taps, or two tabs,
    // cannot both move it.
    .eq('status', decision.from)
    .select('id');

  if (!error && (written ?? []).length === 0) {
    return NextResponse.json(
      { error: 'This rollout changed while you were looking at it. Refresh and try again.' },
      { status: 409 }
    );
  }

  if (error) {
    console.error('[releases/archive] could not update status:', error.message);
    return NextResponse.json(
      { error: archived ? 'Could not archive this rollout.' : 'Could not restore this rollout.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ releaseId, status, archived });
}
