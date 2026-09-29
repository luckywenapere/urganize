import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CURATOR_PLAYLISTS_TABLE,
  PITCHES_TABLE,
  ensureReleaseVisible,
  flagOffResponse,
  parsePitchSongFields,
  requireTeamUser,
  resolvePitcherName,
} from '../_shared';
import { MAX_WAITING_PITCHES_PER_RELEASE, detectPitchPlatform } from '@/lib/pitching';
import {
  MAX_PITCHES_PER_CHECKOUT,
  isPitchPaymentsEnabled,
  toArtistQuoteView,
} from '@/lib/pitch-payments';
import { PAYMENTS_UNAVAILABLE, PITCHES_CHANGED, TOO_MANY_IN_ONE_CHECKOUT } from '@/lib/pitch-payment-copy';
import { isPaystackConfigured } from '@/lib/paystack-server';
import {
  checkPaidCurators,
  insertPitchQuote,
  type QuoteRefusal,
  type QuoteTarget,
} from '@/lib/pitch-quotes-server';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';

/**
 * Price a paid pitch checkout: up to five curators for one song, in one
 * payment.
 *
 * TWO MODES:
 *   - { releaseId, playlistIds, songTitle, songUrl, note } saves one pitch per
 *     playlist as 'awaiting_payment' and prices them. A pitch already waiting
 *     for payment on the same playlist is reused, so an abandoned checkout is
 *     picked up again rather than duplicated.
 *   - { pitchIds } prices pitches that were saved earlier and never paid for,
 *     which is the "Try again" after a payment that did not go through.
 *
 * THE CLIENT NEVER SENDS A PRICE. Every amount comes from curator_pricing on the
 * server, and the quote is frozen for 30 minutes.
 *
 * NO PITCH REACHES A CURATOR HERE. Their inbox cannot read 'awaiting_payment'
 * (the select policy and the inbox route both exclude it); only a payment
 * Paystack confirms moves it on. So a refused or abandoned checkout leaves
 * nothing in anybody's inbox.
 */
export async function POST(request: NextRequest) {
  if (!isPitchPaymentsEnabled()) return flagOffResponse();

  const auth = await requireTeamUser(request);
  if ('error' in auth && auth.error) return auth.error;

  if (!isPaystackConfigured()) {
    return NextResponse.json({ error: PAYMENTS_UNAVAILABLE }, { status: 503 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const pitchIds = uniqueStrings(payload.pitchIds);
  if (pitchIds.length) return quoteSavedPitches(auth, pitchIds);
  return quoteNewPitches(auth, payload);
}

type TeamAuth = {
  user: { id: string; email?: string | null };
  adminClient: SupabaseClient;
};

const uniqueStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)))
    : [];

const refuse = (refusal: QuoteRefusal) =>
  NextResponse.json({ error: refusal.error, code: refusal.code }, { status: refusal.status });

async function countWaiting(adminClient: SupabaseClient, releaseId: string): Promise<number | null> {
  const { count, error } = await adminClient
    .from(PITCHES_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('release_id', releaseId)
    .eq('status', 'new');
  return error ? null : count || 0;
}

function waitingCapRefusal(waiting: number | null, adding: number): NextResponse | null {
  if (waiting === null) {
    return NextResponse.json({ error: 'Could not check your pitches.' }, { status: 500 });
  }
  if (waiting + adding > MAX_WAITING_PITCHES_PER_RELEASE) {
    return NextResponse.json(
      {
        error: `This rollout can have ${MAX_WAITING_PITCHES_PER_RELEASE} pitches waiting at once. Wait for replies before sending more.`,
      },
      { status: 409 }
    );
  }
  return null;
}

async function quoteNewPitches(auth: TeamAuth, payload: Record<string, unknown>) {
  const releaseId = typeof payload.releaseId === 'string' ? payload.releaseId : '';
  const playlistIds = uniqueStrings(payload.playlistIds);
  if (!releaseId || !playlistIds.length) {
    return NextResponse.json({ error: 'Pick a rollout and at least one playlist.' }, { status: 400 });
  }
  if (playlistIds.length > MAX_PITCHES_PER_CHECKOUT) {
    return NextResponse.json({ error: TOO_MANY_IN_ONE_CHECKOUT(MAX_PITCHES_PER_CHECKOUT) }, { status: 400 });
  }

  const song = parsePitchSongFields(payload);
  if ('error' in song) return song.error;

  const visible = await ensureReleaseVisible(auth.adminClient, releaseId, auth.user);
  if ('error' in visible) return visible.error;

  const { data: playlistRows, error: playlistError } = await auth.adminClient
    .from(CURATOR_PLAYLISTS_TABLE)
    .select('id,name,curator_user_id')
    .in('id', playlistIds);
  if (playlistError) {
    return NextResponse.json({ error: 'Could not load the playlists.' }, { status: 500 });
  }
  const playlists = (playlistRows || []) as Array<Record<string, unknown>>;
  if (playlists.length !== playlistIds.length) {
    return NextResponse.json({ error: 'Playlist not found.' }, { status: 404 });
  }

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user as never);
  const check = await checkPaidCurators(auth.adminClient, {
    curatorUserIds: playlists.map((row) => String(row.curator_user_id || '')),
    payerUserId: auth.user.id,
    ownerUserId: visible.ownerUserId,
    payerTeamOwnerIds: access.releaseOwnerIds,
  });
  if (!check.ok) return refuse(check);

  // Pitches already on these playlists for this release. One already sent
  // blocks a second; one waiting for payment is reused.
  const { data: existingRows, error: existingError } = await auth.adminClient
    .from(PITCHES_TABLE)
    .select('id,playlist_id,status')
    .eq('release_id', releaseId)
    .in('playlist_id', playlistIds)
    .in('status', ['new', 'awaiting_payment']);
  if (existingError) {
    return NextResponse.json({ error: 'Could not check your pitches.' }, { status: 500 });
  }
  const existing = (existingRows || []) as Array<Record<string, unknown>>;
  if (existing.some((row) => row.status === 'new')) {
    return NextResponse.json(
      { error: 'One of these playlists already has a pitch waiting for this rollout.' },
      { status: 409 }
    );
  }

  const capRefusal = waitingCapRefusal(await countWaiting(auth.adminClient, releaseId), playlistIds.length);
  if (capRefusal) return capRefusal;

  const pitcherName = await resolvePitcherName(auth.adminClient, auth.user);
  const songFields = {
    created_by: auth.user.id,
    pitcher_name: pitcherName,
    song_title: song.songTitle,
    artist_name: visible.artistName || visible.title || 'Unknown artist',
    song_url: song.songUrl,
    song_platform: detectPitchPlatform(song.songUrl),
    note: song.note,
  };

  const reuseByPlaylist = new Map(existing.map((row) => [String(row.playlist_id), String(row.id)]));
  const created: string[] = [];
  const targets: QuoteTarget[] = [];

  for (const playlist of playlists) {
    const playlistId = String(playlist.id);
    const curatorUserId = String(playlist.curator_user_id || '');
    const playlistName = String(playlist.name || '');
    const reuseId = reuseByPlaylist.get(playlistId);

    if (reuseId) {
      const { error } = await auth.adminClient
        .from(PITCHES_TABLE)
        .update({ ...songFields, playlist_name: playlistName })
        .eq('id', reuseId)
        .eq('status', 'awaiting_payment');
      if (error) {
        await removeCreated(auth.adminClient, created);
        return NextResponse.json({ error: 'Could not save your pitch.' }, { status: 500 });
      }
      targets.push({ pitchId: reuseId, curatorUserId, playlistName });
      continue;
    }

    const { data, error } = await auth.adminClient
      .from(PITCHES_TABLE)
      .insert({
        ...songFields,
        release_id: releaseId,
        owner_user_id: visible.ownerUserId,
        curator_user_id: curatorUserId,
        playlist_id: playlistId,
        playlist_name: playlistName,
        status: 'awaiting_payment',
        payment_kind: 'paid',
      })
      .select('id')
      .maybeSingle();

    if (error || !data) {
      await removeCreated(auth.adminClient, created);
      if (error?.code === '23505') {
        return NextResponse.json(
          { error: 'One of these playlists already has a pitch waiting for this rollout.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Could not save your pitch.' }, { status: 500 });
    }
    const pitchId = String((data as Record<string, unknown>).id);
    created.push(pitchId);
    targets.push({ pitchId, curatorUserId, playlistName });
  }

  const quote = await insertPitchQuote(auth.adminClient, {
    payerUserId: auth.user.id,
    ownerUserId: visible.ownerUserId,
    releaseId,
    targets,
    states: check.states,
  });
  if (!quote.ok) {
    await removeCreated(auth.adminClient, created);
    return refuse(quote);
  }

  return NextResponse.json(
    { quote: toArtistQuoteView(quote.row as Parameters<typeof toArtistQuoteView>[0]) },
    { status: 201 }
  );
}

async function quoteSavedPitches(auth: TeamAuth, pitchIds: string[]) {
  if (pitchIds.length > MAX_PITCHES_PER_CHECKOUT) {
    return NextResponse.json({ error: TOO_MANY_IN_ONE_CHECKOUT(MAX_PITCHES_PER_CHECKOUT) }, { status: 400 });
  }

  const { data, error } = await auth.adminClient
    .from(PITCHES_TABLE)
    .select('id,release_id,curator_user_id,playlist_name,status,payment_kind')
    .in('id', pitchIds);
  if (error) {
    return NextResponse.json({ error: 'Could not load your pitches.' }, { status: 500 });
  }
  const rows = (data || []) as Array<Record<string, unknown>>;
  const releaseIds = new Set(rows.map((row) => String(row.release_id || '')));
  const unpaid = rows.every((row) => row.status === 'awaiting_payment' && row.payment_kind === 'paid');
  if (rows.length !== pitchIds.length || !unpaid || releaseIds.size !== 1 || releaseIds.has('')) {
    return NextResponse.json({ error: PITCHES_CHANGED, code: 'pitches_changed' }, { status: 409 });
  }
  const releaseId = String(rows[0].release_id);

  const visible = await ensureReleaseVisible(auth.adminClient, releaseId, auth.user);
  if ('error' in visible) return visible.error;

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user as never);
  const check = await checkPaidCurators(auth.adminClient, {
    curatorUserIds: rows.map((row) => String(row.curator_user_id || '')),
    payerUserId: auth.user.id,
    ownerUserId: visible.ownerUserId,
    payerTeamOwnerIds: access.releaseOwnerIds,
  });
  if (!check.ok) return refuse(check);

  const capRefusal = waitingCapRefusal(await countWaiting(auth.adminClient, releaseId), rows.length);
  if (capRefusal) return capRefusal;

  const quote = await insertPitchQuote(auth.adminClient, {
    payerUserId: auth.user.id,
    ownerUserId: visible.ownerUserId,
    releaseId,
    targets: rows.map((row) => ({
      pitchId: String(row.id),
      curatorUserId: String(row.curator_user_id || ''),
      playlistName: String(row.playlist_name || ''),
    })),
    states: check.states,
  });
  if (!quote.ok) return refuse(quote);

  return NextResponse.json(
    { quote: toArtistQuoteView(quote.row as Parameters<typeof toArtistQuoteView>[0]) },
    { status: 201 }
  );
}

/** Undo pitches this request created, when the quote could not be made. Only
 *  ever the ones still waiting for payment, so nothing paid is touched. */
async function removeCreated(adminClient: SupabaseClient, ids: string[]) {
  if (!ids.length) return;
  await adminClient.from(PITCHES_TABLE).delete().in('id', ids).eq('status', 'awaiting_payment');
}
