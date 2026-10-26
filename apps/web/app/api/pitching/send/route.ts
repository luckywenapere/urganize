import { NextRequest, NextResponse } from 'next/server';
import {
  CURATOR_PLAYLISTS_TABLE,
  PITCHES_TABLE,
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
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { curatorsOnTheTeam } from '@/lib/pitch-quotes-server';
import { afterResponse } from '@/lib/after-response';
import { notifyCuratorOfNewPitch } from '@/lib/pitch-submission-notice-server';
import {
  CURATOR_PAUSED,
  MAX_CREDIT_PITCHES_PER_SEND,
  NOT_ENOUGH_CREDITS,
  OWN_TEAM_CURATOR,
  isPitchCreditsEnabled,
  normalizeCreditPrice,
} from '@/lib/pitch-credits';
import {
  isMissingSchema,
  notifyCuratorsOfCreditPitches,
  readTeamCredits,
  sendCreditPitches,
  type CreditPitchItem,
} from '@/lib/pitch-credits-server';

/**
 * POST /api/pitching/send: send one song to several curators, paid from the
 * team's credit balance (Pitch on credits, URG-345).
 *
 * Body: { releaseId, playlistIds[], songTitle, songUrl, note, requestId }.
 *
 * The charge and the pitches are written together by send_credit_pitches(),
 * which reads each playlist's tier itself (the price is never the client's),
 * checks the balance under a per-team lock, and refuses the whole send when it
 * is short: 402 with what is needed, so the picker can open the top-up sheet.
 * `requestId` makes a retry or a double tap charge once.
 *
 * Guards, server-side: the rollout must be visible to the caller; at most 10
 * pitches waiting per rollout; one waiting pitch per playlist per rollout; a
 * paused curator takes nothing; and a paid-tier pitch can never go to a curator
 * on the sender's own team (money must not flow back to the sender). A
 * Free-tier pitch to your own playlist stays allowed, as it always was.
 *
 * Before the migration is applied the playlists have no tier, so everything is
 * Free and the pitches are written the old way, one row each.
 */

const REQUEST_ID = /^[A-Za-z0-9-]{8,80}$/;

export async function POST(request: NextRequest) {
  if (!isPitchingFeatureEnabled() || !isPitchCreditsEnabled()) return flagOffResponse();

  const auth = await requireTeamUser(request);
  if ('error' in auth && auth.error) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const releaseId = typeof payload.releaseId === 'string' ? payload.releaseId : '';
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
  const playlistIds = Array.isArray(payload.playlistIds)
    ? Array.from(new Set(payload.playlistIds.filter((id): id is string => typeof id === 'string' && id.length > 0)))
    : [];
  if (!releaseId || playlistIds.length === 0) {
    return NextResponse.json({ error: 'Pick a rollout and at least one curator.' }, { status: 400 });
  }
  if (playlistIds.length > MAX_CREDIT_PITCHES_PER_SEND) {
    return NextResponse.json({ error: `Pick up to ${MAX_CREDIT_PITCHES_PER_SEND} curators at a time.` }, { status: 400 });
  }
  if (!REQUEST_ID.test(requestId)) {
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 400 });
  }

  const song = parsePitchSongFields(payload);
  if ('error' in song) return song.error;

  const visible = await ensureReleaseVisible(auth.adminClient, releaseId, auth.user);
  if ('error' in visible) return visible.error;

  // The tier is read here only to decide the guards; the database function
  // reads it again under a lock for the charge.
  let migrated = true;
  const readPlaylists = (columns: string) =>
    auth.adminClient.from(CURATOR_PLAYLISTS_TABLE).select(columns).in('id', playlistIds);
  let { data: playlistRows, error: playlistError } = await readPlaylists('id,name,curator_user_id,credit_price');
  if (playlistError && isMissingSchema(playlistError)) {
    migrated = false;
    ({ data: playlistRows, error: playlistError } = await readPlaylists('id,name,curator_user_id'));
  }
  if (playlistError) {
    return NextResponse.json({ error: playlistError.message || 'Could not load the playlists.' }, { status: 500 });
  }
  const playlists = (playlistRows || []) as unknown as Array<Record<string, unknown>>;
  if (playlists.length !== playlistIds.length) {
    return NextResponse.json({ error: 'A playlist you picked is gone. Pick again.' }, { status: 404 });
  }

  const paidCuratorIds = playlists
    .filter((row) => normalizeCreditPrice(row.credit_price) > 0)
    .map((row) => String(row.curator_user_id || ''));
  const curatorIds = playlists.map((row) => String(row.curator_user_id || ''));

  // Paused curators, read up front so the answer can name the problem.
  const { data: pausedRows } = await auth.adminClient
    .from('curator_profiles')
    .select('user_id,inbox_paused_at')
    .in('user_id', curatorIds);
  if (((pausedRows || []) as Array<Record<string, unknown>>).some((row) => row.inbox_paused_at)) {
    return NextResponse.json({ error: CURATOR_PAUSED, code: 'curator_paused' }, { status: 409 });
  }

  if (paidCuratorIds.length) {
    const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user as never);
    const onTeam = await curatorsOnTheTeam(auth.adminClient, Array.from(new Set(paidCuratorIds)), {
      payerUserId: auth.user.id,
      ownerUserId: visible.ownerUserId,
      payerTeamOwnerIds: access.releaseOwnerIds,
    });
    if (onTeam === null) {
      return NextResponse.json(
        { error: 'Could not check that right now. Try again in a minute.', code: 'team_check_failed' },
        { status: 503 }
      );
    }
    if (onTeam.size) {
      return NextResponse.json({ error: OWN_TEAM_CURATOR, code: 'own_team' }, { status: 403 });
    }
  }

  const [pitcherName, names, photos] = await Promise.all([
    resolvePitcherName(auth.adminClient, auth.user),
    loadCuratorNames(auth.adminClient, curatorIds),
    loadCuratorPhotoUrls(auth.adminClient, curatorIds),
  ]);
  const artistName = visible.artistName || visible.title || 'Unknown artist';
  const songPlatform = detectPitchPlatform(song.songUrl);

  if (!migrated) {
    return sendFreeBeforeMigration({
      admin: auth.adminClient,
      userId: auth.user.id,
      releaseId,
      ownerUserId: visible.ownerUserId,
      releaseTitle: visible.title || null,
      pitcherName,
      artistName,
      song: { ...song, songPlatform },
      playlists,
      names,
      photos,
    });
  }

  const credits = await readTeamCredits(auth.adminClient, auth.user);
  if (!credits) {
    return NextResponse.json({ error: 'Could not read your credits. Try again in a minute.' }, { status: 503 });
  }

  const items: CreditPitchItem[] = playlists.map((row) => ({
    playlist_id: String(row.id),
    release_id: releaseId,
    release_owner_id: visible.ownerUserId,
    pitcher_name: pitcherName,
    song_title: song.songTitle,
    artist_name: artistName,
    song_url: song.songUrl,
    song_platform: songPlatform,
    note: song.note,
    curator_name: names.get(String(row.curator_user_id || '')) || '',
  }));

  const outcome = await sendCreditPitches(auth.adminClient, {
    workspaceId: credits.workspaceId,
    ownerUserId: credits.ownerUserId,
    actorUserId: auth.user.id,
    requestId,
    items,
  });

  switch (outcome.result) {
    case 'insufficient':
      return NextResponse.json(
        {
          error: NOT_ENOUGH_CREDITS,
          code: 'insufficient',
          needed: outcome.needed,
          balance: outcome.balance,
          short: outcome.short,
        },
        { status: 402 }
      );
    case 'at_limit':
      return NextResponse.json(
        {
          error: `This rollout already has ${MAX_WAITING_PITCHES_PER_RELEASE} pitches waiting. Wait for replies before sending more.`,
          code: 'at_limit',
        },
        { status: 409 }
      );
    case 'duplicate':
      return NextResponse.json(
        { error: 'One of these curators already has a pitch waiting for this rollout.', code: 'duplicate' },
        { status: 409 }
      );
    case 'paused':
      return NextResponse.json({ error: CURATOR_PAUSED, code: 'curator_paused' }, { status: 409 });
    case 'not_found':
      return NextResponse.json({ error: 'A playlist you picked is gone. Pick again.' }, { status: 404 });
    case 'unmigrated':
    case 'error':
      return NextResponse.json({ error: 'Could not send. Nothing was charged. Try again.' }, { status: 500 });
    case 'sent':
      break;
  }

  const { data: sentRows } = await auth.adminClient
    .from(PITCHES_TABLE)
    .select(`${sentPitchColumns(true)},credits_charged`)
    .in('id', outcome.pitchIds);

  const pitchIds = outcome.pitchIds;
  afterResponse('pitch-credits-notify', () => notifyCuratorsOfCreditPitches(auth.adminClient, pitchIds));

  return NextResponse.json(
    {
      pitches: ((sentRows || []) as unknown as Array<Record<string, unknown>>).map((row) =>
        toSentPitch(
          row,
          names.get(String(row.curator_user_id || '')) || 'Playlist owner',
          visible.title || null,
          null,
          photos.get(String(row.curator_user_id || '')) || null
        )
      ),
      charged: outcome.charged,
      balance: outcome.balanceAfter,
    },
    { status: 201 }
  );
}

/**
 * The database has no tiers yet (migration not applied): every playlist is
 * Free, so write each pitch the way the free route always has. Nothing is
 * charged. Once the migration is applied this path is never taken again.
 */
async function sendFreeBeforeMigration(input: {
  admin: Parameters<typeof loadCuratorNames>[0];
  userId: string;
  releaseId: string;
  ownerUserId: string;
  releaseTitle: string | null;
  pitcherName: string;
  artistName: string;
  song: { songTitle: string; songUrl: string; note: string; songPlatform: string | null };
  playlists: Array<Record<string, unknown>>;
  names: Map<string, string>;
  photos: Map<string, string>;
}) {
  const { count } = await input.admin
    .from(PITCHES_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('release_id', input.releaseId)
    .eq('status', 'new');
  if ((count || 0) + input.playlists.length > MAX_WAITING_PITCHES_PER_RELEASE) {
    return NextResponse.json(
      {
        error: `This rollout already has ${MAX_WAITING_PITCHES_PER_RELEASE} pitches waiting. Wait for replies before sending more.`,
        code: 'at_limit',
      },
      { status: 409 }
    );
  }

  const sent: Array<Record<string, unknown>> = [];
  for (const playlist of input.playlists) {
    const { data, error } = await input.admin
      .from(PITCHES_TABLE)
      .insert({
        release_id: input.releaseId,
        owner_user_id: input.ownerUserId,
        created_by: input.userId,
        pitcher_name: input.pitcherName,
        curator_user_id: String(playlist.curator_user_id || ''),
        playlist_id: String(playlist.id),
        playlist_name: String(playlist.name || ''),
        song_title: input.song.songTitle,
        artist_name: input.artistName,
        song_url: input.song.songUrl,
        song_platform: input.song.songPlatform,
        note: input.song.note,
      })
      .select(sentPitchColumns(false))
      .maybeSingle();
    if (error && error.code !== '23505') {
      return NextResponse.json({ error: error.message || 'Could not send the pitch.' }, { status: 500 });
    }
    if (data) sent.push(data as unknown as Record<string, unknown>);
  }
  const sentIds = sent.map((row) => String(row.id || '')).filter(Boolean);
  afterResponse('pitch-new-notify', async () => {
    for (const id of sentIds) await notifyCuratorOfNewPitch(input.admin as never, id);
  });

  return NextResponse.json(
    {
      pitches: sent.map((row) =>
        toSentPitch(
          row,
          input.names.get(String(row.curator_user_id || '')) || 'Playlist owner',
          input.releaseTitle,
          null,
          input.photos.get(String(row.curator_user_id || '')) || null
        )
      ),
      charged: 0,
      balance: null,
    },
    { status: 201 }
  );
}
