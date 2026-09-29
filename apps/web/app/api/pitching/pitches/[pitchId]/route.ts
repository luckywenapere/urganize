import { NextRequest, NextResponse } from 'next/server';
import {
  PITCHES_TABLE,
  ensureReleaseVisible,
  flagOffResponse,
  isPitchingFeatureEnabled,
  requireTeamUser,
} from '../../_shared';
import { ONLY_UNPAID_REMOVABLE } from '@/lib/pitch-payment-copy';
import { supersedeOpenQuotes } from '@/lib/pitch-quotes-server';

/**
 * Remove a pitch nobody has paid for. The only kind of pitch a team can delete:
 * a sent pitch belongs to the curator's inbox, and a paid one is a record of
 * money.
 *
 * Any quote still pricing it stops being payable. If the artist pays that quote
 * anyway, in a tab left open, the payment arrives for a pitch that is gone and
 * lands in needs_review for a refund, so no money is lost either way.
 *
 * Gated on PITCHING, deliberately not on pitch payments. This is cleanup, not
 * creation: an unpaid pitch holds its playlist's one waiting slot (the unique
 * index counts 'awaiting_payment'), so if paid pitching is switched off with
 * unpaid pitches still sitting there, the team has to be able to clear them or
 * they could never pitch that playlist for free again. A row in that state can
 * only exist once the payments migration is applied, so this cannot reach a
 * table that is not there.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ pitchId: string }> }
) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireTeamUser(request);
  if ('error' in auth && auth.error) return auth.error;

  const { pitchId } = await context.params;
  if (!pitchId) return NextResponse.json({ error: 'Pitch id is required.' }, { status: 400 });

  const { data: pitch, error: readError } = await auth.adminClient
    .from(PITCHES_TABLE)
    .select('id,release_id,status')
    .eq('id', pitchId)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: 'Could not load the pitch.' }, { status: 500 });

  const row = pitch as Record<string, unknown> | null;
  const releaseId = row ? String(row.release_id || '') : '';
  if (!row || !releaseId) return NextResponse.json({ error: 'Pitch not found.' }, { status: 404 });

  const visible = await ensureReleaseVisible(auth.adminClient, releaseId, auth.user);
  if ('error' in visible) {
    return NextResponse.json({ error: 'Pitch not found.' }, { status: 404 });
  }

  if (row.status !== 'awaiting_payment') {
    return NextResponse.json({ error: ONLY_UNPAID_REMOVABLE }, { status: 409 });
  }

  const { data: deleted, error } = await auth.adminClient
    .from(PITCHES_TABLE)
    .delete()
    .eq('id', pitchId)
    .eq('status', 'awaiting_payment')
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not remove the pitch.' }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: ONLY_UNPAID_REMOVABLE }, { status: 409 });

  await supersedeOpenQuotes(auth.adminClient, releaseId, [pitchId]);

  return NextResponse.json({ removed: true });
}
