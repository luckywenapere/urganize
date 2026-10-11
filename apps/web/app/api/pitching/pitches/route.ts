import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CURATOR_PLAYLISTS_TABLE,
  PITCHES_TABLE,
  SENT_PITCH_LIST_LIMIT,
  ensureReleaseVisible,
  flagOffResponse,
  isPitchingFeatureEnabled,
  loadCuratorNames,
  loadCuratorPhotoUrls,
  parsePitchSongFields,
  requireTeamUser,
  resolvePitcherName,
  sentPitchColumns,
  toSentPitch,
} from '../_shared';
import { MAX_WAITING_PITCHES_PER_RELEASE, detectPitchPlatform } from '@/lib/pitching';
import { decideReleaseAccess } from '@/lib/release-access';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { isPitchPaymentsEnabled } from '@/lib/pitch-payments';
import { CURATOR_NOW_PAID, CURATOR_UNAVAILABLE, UNPAID_PITCH_EXISTS } from '@/lib/pitch-payment-copy';
import { PAYMENTS_TABLE, loadCuratorPaymentStates } from '@/lib/pitch-payments-server';

/**
 * Pitches this team has sent, newest first.
 *
 * TWO MODES, and `releaseId` is what picks between them:
 *
 *   - With it: one release's pitches, exactly as this route has always
 *     behaved — visibility checked through ensureReleaseVisible, one query
 *     filtered on that release. This is what the release scene calls.
 *   - Without it: every release's, for the Pitching page (2026-09-09, founder:
 *     "Playlist pitching should be accessible app wide"). Before that page
 *     existed there was nowhere to ask this question from, which is why the
 *     param used to be required.
 *
 * THE TEAM-WIDE READ IS FILTERED TWICE, and the second filter is the one that
 * matters. Owner ids alone would hand an artist-scoped teammate every pitch
 * their team ever sent, including ones for releases they are not allowed to
 * see — `releaseOwnerIds` is a team boundary, not a per-release one. So the
 * referenced releases are loaded and each row is put through the shared
 * decideReleaseAccess, the same rule the events list uses for the same reason.
 * Cloning that rule as SQL is how eleven route groups drifted apart.
 *
 * A pitch whose release was deleted (`release_id` null) survives the filter on
 * the owner check alone: it is this team's own pitch, the curator may still be
 * sitting on it, and hiding it would lose the answer. The page labels it.
 *
 * A paid pitch also carries its deadline and what was paid for it. The price is
 * the team's own payment, so it is theirs to see; what the curator was actually
 * sent never is. Like the curator inbox, that follows the ROW rather than the
 * feature flag: an artist who paid for a pitch keeps seeing its deadline and
 * its refund even if paid pitching is switched off afterwards.
 */
export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireTeamUser(request);
  if ('error' in auth && auth.error) return auth.error;

  const releaseId = new URL(request.url).searchParams.get('releaseId') || '';

  if (releaseId) {
    const visible = await ensureReleaseVisible(auth.adminClient, releaseId, auth.user);
    if ('error' in visible) return visible.error;

    const { data, error } = await readWithPaymentColumns((columns) =>
      auth.adminClient
        .from(PITCHES_TABLE)
        .select(columns)
        .eq('release_id', releaseId)
        .order('created_at', { ascending: false })
        .limit(SENT_PITCH_LIST_LIMIT)
    );

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Could not load pitches.' },
        { status: 500 }
      );
    }

    const rows = (data || []) as unknown as Array<Record<string, unknown>>;
    const [names, prices, photos] = await Promise.all([
      loadCuratorNames(
        auth.adminClient,
        rows.map((row) => String(row.curator_user_id || ''))
      ),
      loadPaidPrices(auth.adminClient, rows),
      loadCuratorPhotoUrls(
        auth.adminClient,
        rows.map((row) => String(row.curator_user_id || ''))
      ),
    ]);

    return NextResponse.json({
      pitches: rows.map((row) =>
        toSentPitch(
          row,
          names.get(String(row.curator_user_id || '')) || 'Playlist owner',
          visible.title || null,
          { priceKobo: prices.get(String(row.id)) ?? null },
          photos.get(String(row.curator_user_id || '')) || null
        )
      ),
    });
  }

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user as never);
  const ownerIds = access.releaseOwnerIds.length ? access.releaseOwnerIds : [auth.user.id];

  const { data, error } = await readWithPaymentColumns((columns) =>
    auth.adminClient
      .from(PITCHES_TABLE)
      .select(columns)
      .in('owner_user_id', ownerIds)
      .order('created_at', { ascending: false })
      .limit(SENT_PITCH_LIST_LIMIT)
  );

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load pitches.' },
      { status: 500 }
    );
  }

  const rows = (data || []) as unknown as Array<Record<string, unknown>>;
  const releases = await loadPitchReleases(
    auth.adminClient,
    rows.map((row) => String(row.release_id || ''))
  );

  const readable = rows.filter((row) => {
    const rowReleaseId = String(row.release_id || '');
    // A deleted release leaves nothing to check beyond the owner filter above.
    if (!rowReleaseId) return true;
    const release = releases.get(rowReleaseId);
    // A release we cannot read back is one this caller should not be told
    // about: fail closed, unlike the counts elsewhere in this app, because the
    // cost here is showing somebody another artist's work rather than refusing
    // an action they could retry.
    if (!release) return false;
    return (
      decideReleaseAccess({
        releaseOwnerId: release.ownerUserId,
        releaseArtistId: release.artistId,
        userId: auth.user.id,
        access,
        write: false,
      }) === 'allow'
    );
  });

  const [names, prices, photos] = await Promise.all([
    loadCuratorNames(
      auth.adminClient,
      readable.map((row) => String(row.curator_user_id || ''))
    ),
    loadPaidPrices(auth.adminClient, readable),
    loadCuratorPhotoUrls(
      auth.adminClient,
      readable.map((row) => String(row.curator_user_id || ''))
    ),
  ]);

  return NextResponse.json({
    pitches: readable.map((row) =>
      toSentPitch(
        row,
        names.get(String(row.curator_user_id || '')) || 'Playlist owner',
        releases.get(String(row.release_id || ''))?.title || null,
        { priceKobo: prices.get(String(row.id)) ?? null },
        photos.get(String(row.curator_user_id || '')) || null
      )
    ),
    // The list is capped, so say when it was cut rather than letting the page
    // imply it is showing everything.
    truncated: rows.length >= SENT_PITCH_LIST_LIMIT,
  });
}

type PitchRead = { data: unknown; error: { code?: string | null; message?: string } | null };

/**
 * Read the list with the payment columns, falling back to the columns it always
 * read when the database answers that they do not exist (42703). That is only
 * ever a database the payments migration has not reached yet; after it is
 * applied the fallback is never taken. Nothing is reported to the user and
 * there is no SQL to run, so this is not the retired schema-missing pattern.
 */
async function readWithPaymentColumns(read: (columns: string) => PromiseLike<PitchRead>): Promise<PitchRead> {
  const first = await read(sentPitchColumns(true));
  if (first.error?.code === '42703') return read(sentPitchColumns(false));
  return first;
}

/** What was paid for each paid pitch in the list, from the payment rows. */
async function loadPaidPrices(
  adminClient: SupabaseClient,
  rows: Array<Record<string, unknown>>
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const ids = rows.filter((row) => row.payment_kind === 'paid').map((row) => String(row.id));
  if (!ids.length) return prices;
  const { data } = await adminClient.from(PAYMENTS_TABLE).select('pitch_id,price_kobo').in('pitch_id', ids);
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    prices.set(String(row.pitch_id), Number(row.price_kobo) || 0);
  }
  return prices;
}

/** The releases a set of pitches point at, for the access filter and the title. */
async function loadPitchReleases(
  adminClient: SupabaseClient,
  releaseIds: string[]
): Promise<Map<string, { ownerUserId: string; artistId: string; title: string }>> {
  const found = new Map<string, { ownerUserId: string; artistId: string; title: string }>();
  const ids = Array.from(new Set(releaseIds.filter(Boolean)));
  if (!ids.length) return found;

  const { data } = await adminClient
    .from('releases')
    .select('id,owner_user_id,artist_id,title')
    .in('id', ids);

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    found.set(String(row.id || ''), {
      ownerUserId: String(row.owner_user_id || ''),
      artistId: String(row.artist_id || ''),
      title: String(row.title || ''),
    });
  }
  return found;
}

/**
 * Sends one FREE pitch.
 *
 * Everything the curator card renders is written here, denormalized: the song
 * title and artist name, the playlist name, and who sent it. That is what keeps
 * the curator's read path away from team data entirely.
 *
 * Two brakes, both enforced server-side because a client cannot be trusted with
 * either: at most ten pitches waiting per release, and at most one waiting pitch
 * per playlist (a unique partial index, so a race loses at the database rather
 * than slipping through).
 *
 * With curator pitch payments switched on, this route refuses a curator who
 * charges (the paid way is POST /api/pitching/quote, then checkout) and one
 * whose inbox is paused. A curator with no live price keeps taking free pitches
 * exactly as before (founder call: paid pitching is opt-in).
 *
 * Pitching to your OWN playlist is allowed for a free pitch and needs no guard:
 * a dual account (team + playlist owner) simply matches both of
 * playlist_pitches' select policies on the same row, and every cap above still
 * applies. It is also the cheapest way to try the round trip end to end. Paying
 * yourself is the thing the quote route refuses.
 */
export async function POST(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireTeamUser(request);
  if ('error' in auth && auth.error) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const releaseId = typeof payload.releaseId === 'string' ? payload.releaseId : '';
  const playlistId = typeof payload.playlistId === 'string' ? payload.playlistId : '';
  if (!releaseId || !playlistId) {
    return NextResponse.json({ error: 'Pick a rollout and a playlist.' }, { status: 400 });
  }

  const song = parsePitchSongFields(payload);
  if ('error' in song) return song.error;

  const visible = await ensureReleaseVisible(auth.adminClient, releaseId, auth.user);
  if ('error' in visible) return visible.error;

  const { data: playlist, error: playlistError } = await auth.adminClient
    .from(CURATOR_PLAYLISTS_TABLE)
    .select('id,name,curator_user_id')
    .eq('id', playlistId)
    .maybeSingle();

  if (playlistError) {
    return NextResponse.json(
      { error: playlistError.message || 'Could not load the playlist.' },
      { status: 500 }
    );
  }
  if (!playlist) {
    return NextResponse.json({ error: 'Playlist not found.' }, { status: 404 });
  }

  const curatorUserId = String(playlist.curator_user_id || '');
  const withPayments = isPitchPaymentsEnabled();

  if (withPayments) {
    const states = await loadCuratorPaymentStates(auth.adminClient, [curatorUserId]);
    const state = states.get(curatorUserId);
    if (state?.paused) {
      return NextResponse.json({ error: CURATOR_UNAVAILABLE, code: 'curator_paused' }, { status: 409 });
    }
    if (state && state.priceKobo !== null) {
      return NextResponse.json({ error: CURATOR_NOW_PAID, code: 'curator_paid' }, { status: 409 });
    }
  }

  // The waiting-pitch cap. There is a small window between this count and the
  // insert below; at this scale one extra pitch slipping through is a better
  // trade than locking the table, and the per-playlist unique index still holds.
  const { count: waitingCount, error: countError } = await auth.adminClient
    .from(PITCHES_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('release_id', releaseId)
    .eq('status', 'new');

  if (countError) {
    return NextResponse.json(
      { error: countError.message || 'Could not check your pitches.' },
      { status: 500 }
    );
  }
  if ((waitingCount || 0) >= MAX_WAITING_PITCHES_PER_RELEASE) {
    return NextResponse.json(
      {
        error: `This rollout already has ${MAX_WAITING_PITCHES_PER_RELEASE} pitches waiting. Wait for replies before sending more.`,
      },
      { status: 409 }
    );
  }

  const pitcherName = await resolvePitcherName(auth.adminClient, auth.user);

  const { data, error } = await auth.adminClient
    .from(PITCHES_TABLE)
    .insert({
      release_id: releaseId,
      owner_user_id: visible.ownerUserId,
      created_by: auth.user.id,
      pitcher_name: pitcherName,
      curator_user_id: curatorUserId,
      playlist_id: playlistId,
      playlist_name: String(playlist.name || ''),
      song_title: song.songTitle,
      artist_name: visible.artistName || visible.title || 'Unknown artist',
      song_url: song.songUrl,
      song_platform: detectPitchPlatform(song.songUrl),
      note: song.note,
    })
    .select(sentPitchColumns(withPayments))
    .maybeSingle();

  if (error) {
    // 23505: the one-waiting-pitch-per-playlist index caught a duplicate. The
    // pitch in the way may be an unpaid one the team started, which is asked
    // whether or not payments are on now: an unpaid pitch left over from when
    // they were is still in the way, and the team can remove it.
    if (error.code === '23505') {
      const unpaid = await hasUnpaidPitch(auth.adminClient, releaseId, playlistId);
      return NextResponse.json(
        {
          error: unpaid
            ? UNPAID_PITCH_EXISTS
            : 'This playlist already has a pitch waiting for this rollout.',
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Could not send the pitch.' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'Could not send the pitch.' }, { status: 500 });
  }

  const [names, photos] = await Promise.all([
    loadCuratorNames(auth.adminClient, [curatorUserId]),
    loadCuratorPhotoUrls(auth.adminClient, [curatorUserId]),
  ]);

  return NextResponse.json(
    {
      pitch: toSentPitch(
        data as unknown as Record<string, unknown>,
        names.get(curatorUserId) || 'Playlist owner',
        // So a pitch sent from the Pitching page lands in the right group
        // without waiting for a refetch.
        visible.title || null,
        withPayments ? { priceKobo: null } : null,
        photos.get(curatorUserId) || null
      ),
    },
    { status: 201 }
  );
}

async function hasUnpaidPitch(adminClient: SupabaseClient, releaseId: string, playlistId: string) {
  const { data } = await adminClient
    .from(PITCHES_TABLE)
    .select('id')
    .eq('release_id', releaseId)
    .eq('playlist_id', playlistId)
    .eq('status', 'awaiting_payment')
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
