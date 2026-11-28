import { NextRequest, NextResponse } from 'next/server';
import { requireActiveAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import { ensureReleaseOwnership } from '@/app/api/releases/_shared';
import { writeTestReleaseByPerson } from '@/lib/test-release';

// POST /api/releases/[releaseId]/test — the owner says a rollout is a test, or
// that it is real after all (#1442, 2026-11-28). Body: { isTest: boolean }.
//
// A dedicated route for the archive route's reason: the release PATCH is a
// full-row replace, so a sparse write through it would blank the title. This
// writes `metadata` and nothing else, read-modify-write, because that JSONB
// column carries other keys (planner flags, the share offer).
//
// Saying it is real also records the answer (test_release_dismissed), so the
// daily sweep never tags the rollout again. Owner-only, 404 on someone else's
// rollout, like archive and delete.

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
  const isTest = body?.isTest;
  if (typeof isTest !== 'boolean') {
    return NextResponse.json({ error: 'isTest must be true or false.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const { data: row, error: readError } = await adminClient
    .from('releases')
    .select('metadata')
    .eq('id', releaseId)
    .maybeSingle();
  if (readError || !row) {
    console.error('[releases/test] could not read metadata:', readError?.message);
    return NextResponse.json({ error: 'Could not update this rollout.' }, { status: 500 });
  }

  const metadata = writeTestReleaseByPerson(
    (row as { metadata?: Record<string, unknown> | null }).metadata ?? null,
    isTest
  );

  const { error } = await adminClient
    .from('releases')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', releaseId)
    .eq('owner_user_id', ownership.release.ownerUserId);

  if (error) {
    console.error('[releases/test] could not update metadata:', error.message);
    return NextResponse.json({ error: 'Could not update this rollout.' }, { status: 500 });
  }

  return NextResponse.json({ releaseId, isTest });
}
