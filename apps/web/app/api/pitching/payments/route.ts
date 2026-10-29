import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { flagOffResponse } from '../_shared';
import { isPitchPaymentsEnabled, toArtistQuoteView } from '@/lib/pitch-payments';
import { PAYMENTS_TABLE, QUOTES_TABLE } from '@/lib/pitch-payments-server';
import { QUOTE_COLUMNS } from '@/lib/pitch-quotes-server';
import { decideReleaseAccess } from '@/lib/release-access';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import type { PitchReceipt } from '@/types/pitch-payments';

const RECEIPT_LIMIT = 100;

/**
 * The team's pitch payment history: one receipt per paid checkout, newest
 * first, each line saying whether that pitch was refunded.
 *
 * NOT BEHIND THE PAYWALL, on the data export's reasoning: these are records of
 * money a team already spent, and the people who most need them are the ones a
 * lapsed plan would lock out. It is behind the feature flag, like the rest of
 * the paid pitching screens.
 *
 * Filtered twice, the same way the team-wide pitch list is: owner ids first,
 * then each receipt's rollout through decideReleaseAccess, so an artist-scoped
 * teammate never sees what another artist's pitches cost. A receipt whose
 * rollout was deleted survives on the owner check alone.
 *
 * Every receipt goes through toArtistQuoteView, which builds it field by field:
 * the curator's nominal share, never what they were actually sent.
 */
export async function GET(request: NextRequest) {
  if (!isPitchPaymentsEnabled()) return flagOffResponse();

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await loadWorkspaceAccessContext(admin, auth.user as never);
  const ownerIds = access.releaseOwnerIds.length ? access.releaseOwnerIds : [auth.user.id];

  const { data, error } = await admin
    .from(QUOTES_TABLE)
    .select(QUOTE_COLUMNS)
    .in('owner_user_id', ownerIds)
    .in('status', ['paid', 'needs_review'])
    .order('paid_at', { ascending: false, nullsFirst: false })
    .limit(RECEIPT_LIMIT);

  if (error) {
    return NextResponse.json({ error: 'Could not load your payments.' }, { status: 500 });
  }

  const rows = (data || []) as unknown as Array<Record<string, unknown>>;

  const releaseIds = Array.from(new Set(rows.map((row) => String(row.release_id || '')).filter(Boolean)));
  const releases = new Map<string, { ownerUserId: string; artistId: string; title: string }>();
  if (releaseIds.length) {
    const { data: releaseRows } = await admin
      .from('releases')
      .select('id,owner_user_id,artist_id,title')
      .is('deleted_at', null)
      .in('id', releaseIds);
    for (const row of (releaseRows || []) as Array<Record<string, unknown>>) {
      releases.set(String(row.id), {
        ownerUserId: String(row.owner_user_id || ''),
        artistId: String(row.artist_id || ''),
        title: String(row.title || ''),
      });
    }
  }

  const readable = rows.filter((row) => {
    const releaseId = String(row.release_id || '');
    if (!releaseId) return true;
    const release = releases.get(releaseId);
    if (!release) return false;
    return (
      decideReleaseAccess({
        releaseOwnerId: release.ownerUserId,
        releaseArtistId: release.artistId,
        releaseId,
        userId: auth.user.id,
        access,
        write: false,
      }) === 'allow'
    );
  });

  // Each pitch's payment status, for the refund state on its line, and the
  // song each receipt was for. The song comes from the payment rows, which
  // keep a copy of it, so a receipt still names its song after the pitch or
  // the rollout is deleted. A checkout still in review has no payment rows yet,
  // so its song comes from its pitches.
  const statusByPitch = new Map<string, string>();
  const songByQuote = new Map<string, string>();
  const quoteIds = readable.map((row) => String(row.id));
  if (quoteIds.length) {
    const { data: payments } = await admin
      .from(PAYMENTS_TABLE)
      .select('quote_id,pitch_id,status,song_title')
      .in('quote_id', quoteIds);
    for (const payment of (payments || []) as Array<Record<string, unknown>>) {
      if (payment.pitch_id) statusByPitch.set(String(payment.pitch_id), String(payment.status || ''));
      const quoteId = String(payment.quote_id || '');
      if (quoteId && !songByQuote.has(quoteId) && payment.song_title) {
        songByQuote.set(quoteId, String(payment.song_title));
      }
    }
  }

  const unnamed = readable.filter((row) => !songByQuote.has(String(row.id)));
  const pitchIds = unnamed.flatMap((row) =>
    (Array.isArray(row.lines) ? (row.lines as Array<Record<string, unknown>>) : [])
      .map((line) => String(line.pitch_id || ''))
      .filter(Boolean)
  );
  if (pitchIds.length) {
    const { data: pitches } = await admin
      .from('playlist_pitches')
      .select('id,song_title')
      .in('id', Array.from(new Set(pitchIds)));
    const songByPitch = new Map(
      ((pitches || []) as Array<Record<string, unknown>>).map((row) => [String(row.id), String(row.song_title || '')])
    );
    for (const row of unnamed) {
      const lines = Array.isArray(row.lines) ? (row.lines as Array<Record<string, unknown>>) : [];
      const song = lines.map((line) => songByPitch.get(String(line.pitch_id || ''))).find(Boolean);
      if (song) songByQuote.set(String(row.id), song);
    }
  }

  const receipts: PitchReceipt[] = readable.map((row) => ({
    ...toArtistQuoteView(row as Parameters<typeof toArtistQuoteView>[0], statusByPitch),
    songTitle: songByQuote.get(String(row.id)) || '',
    releaseTitle: releases.get(String(row.release_id || ''))?.title || null,
    releaseId: releases.has(String(row.release_id || '')) ? String(row.release_id) : null,
  }));

  return NextResponse.json({ receipts, truncated: rows.length >= RECEIPT_LIMIT });
}
