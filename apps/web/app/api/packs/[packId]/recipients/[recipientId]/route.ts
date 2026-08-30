import { NextRequest, NextResponse } from 'next/server';
import {
  asRow,
  createAdminClient,
  ensureSetlistAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '@/app/api/events/_shared';

const PACKS_TABLE = 'dj_packs';
const RECIPIENTS_TABLE = 'dj_pack_recipients';

/**
 * Revoke one person's link.
 *
 * A SOFT revoke — the row stays with `revoked_at` set, rather than being
 * deleted. Two reasons, and both matter: the access log points at this row, so
 * deleting it would blank the name beside every download they already made
 * (the one deterrent on an unreleased track); and a manager who revoked a link
 * should still see that they did, rather than watching the person vanish from
 * a list they remember adding to.
 *
 * Everything the recipient already downloaded is, of course, still downloaded.
 * This stops the link, not the past.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ packId: string; recipientId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { packId, recipientId } = await context.params;
  if (!packId || !recipientId) {
    return NextResponse.json({ error: 'A pack and a recipient are required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const pack = await adminClient
    .from(PACKS_TABLE)
    .select('id,setlist_id')
    .eq('id', packId)
    .maybeSingle();

  if (pack.error) {
    return NextResponse.json(
      { error: pack.error.message || 'Could not load the pack.' },
      { status: 500 }
    );
  }
  if (!pack.data) {
    return NextResponse.json({ error: 'Pack not found.' }, { status: 404 });
  }

  const setlistId = String(asRow(pack.data).setlist_id || '');
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, true);
  if ('error' in access) return access.error;

  const { error } = await adminClient
    .from(RECIPIENTS_TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', recipientId)
    .eq('pack_id', packId);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not revoke that link.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ revoked: true });
}
