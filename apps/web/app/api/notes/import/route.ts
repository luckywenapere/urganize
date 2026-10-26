import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { parseCommitPayload } from '@/lib/note-import/commit';
import {
  NOTES_TABLE,
  createAdminClient,
  isNotesFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../_shared';

/**
 * Bring your notes: saves the notes a person chose to keep from an import.
 *
 * The chat or file was read in their browser and is never uploaded; this route
 * only ever sees the kept notes. Every row carries one import_id so the whole
 * batch can be undone (DELETE /api/notes/import/[importId]).
 */
export async function POST(request: NextRequest) {
  if (!isNotesFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = parseCommitPayload(payload);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { source, items } = parsed.value;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  // Every rollout named must be the caller's own. One query for the batch.
  const releaseIds = [
    ...new Set(items.map((item) => item.releaseId).filter((id): id is string => Boolean(id))),
  ];
  if (releaseIds.length > 0) {
    const { data, error } = await adminClient
      .from('releases')
      .select('id')
      .is('deleted_at', null)
      .eq('owner_user_id', auth.user.id)
      .in('id', releaseIds);
    if (error) {
      return NextResponse.json({ error: error.message || 'Could not check rollouts.' }, { status: 500 });
    }
    if ((data || []).length !== releaseIds.length) {
      return NextResponse.json({ error: 'Rollout not found.' }, { status: 404 });
    }
  }

  const importId = randomUUID();
  const nowIso = new Date().toISOString();
  const rows = items.map((item) => ({
    owner_user_id: auth.user.id,
    release_id: item.releaseId,
    body: item.body,
    source: `import:${source}`,
    import_id: importId,
    created_at: item.at || nowIso,
    updated_at: item.at || nowIso,
  }));

  for (let start = 0; start < rows.length; start += 100) {
    const { error } = await adminClient.from(NOTES_TABLE).insert(rows.slice(start, start + 100));
    if (error) {
      // A half-saved batch would be confusing, so take back what landed.
      await adminClient
        .from(NOTES_TABLE)
        .delete()
        .eq('owner_user_id', auth.user.id)
        .eq('import_id', importId);
      return NextResponse.json({ error: error.message || 'Could not save the notes.' }, { status: 500 });
    }
  }

  return NextResponse.json({ importId, count: rows.length }, { status: 201 });
}
