import { NextRequest, NextResponse } from 'next/server';
import {
  NOTES_TABLE,
  createAdminClient,
  isNotesFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../../_shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Undo an import: removes every note that came in with this batch, and only the caller's. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ importId: string }> }
) {
  if (!isNotesFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { importId } = await context.params;
  if (!importId || !UUID.test(importId)) {
    return NextResponse.json({ error: 'Import id is not valid.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data, error } = await adminClient
    .from(NOTES_TABLE)
    .delete()
    .eq('owner_user_id', auth.user.id)
    .eq('import_id', importId)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not undo the import.' }, { status: 500 });
  }
  return NextResponse.json({ removed: (data || []).length });
}
