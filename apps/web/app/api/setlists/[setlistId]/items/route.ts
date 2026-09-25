import { NextRequest, NextResponse } from 'next/server';
import {
  parseSetlistItemCreate,
  resolveItemDuration,
  resolveRowVersion,
  summarizeSetlist,
  type SetlistSummaryItem,
} from '@/lib/setlist';
import {
  SETLIST_ITEMS_TABLE,
  SETLIST_ITEM_COLUMNS,
  SONGS_TABLE,
  SONG_VERSIONS_TABLE,
  asRow,
  createAdminClient,
  ensureSetlistAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
  versionBelongsToSong,
} from '@/app/api/events/_shared';

type SongFile = {
  id: string;
  label: string;
  fileName: string;
  durationSeconds: number | null;
  createdAt: string | null;
};

/**
 * The set, in order, with everything the running total needs already
 * resolved — plus the total itself.
 *
 * The summary is computed HERE as well as on the client, and both call the
 * same pure summarizeSetlist. That is the point: a total shown while dragging
 * and a total checked when a pack is sent cannot disagree, because there is
 * one implementation (the asset-constants.ts pattern).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { setlistId } = await context.params;
  if (!setlistId) {
    return NextResponse.json({ error: 'A set id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, false);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient!
    .from(SETLIST_ITEMS_TABLE)
    .select(SETLIST_ITEM_COLUMNS)
    .eq('setlist_id', setlistId)
    .order('position', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load the set.' },
      { status: 500 }
    );
  }

  const rows = (data || []).map((row) => asRow(row));

  // Two batched reads rather than a join per row. Only the songs actually in
  // the set, so a set of talk items costs nothing.
  const songIds = [...new Set(rows.map((row) => String(row.song_id || '')).filter(Boolean))];

  const songs = new Map<string, Record<string, unknown>>();
  if (songIds.length > 0) {
    const result = await adminClient!
      .from(SONGS_TABLE)
      .select('id,title,duration_seconds,musical_key,bpm')
      .in('id', songIds);
    for (const row of result.data || []) {
      const song = asRow(row);
      songs.set(String(song.id), song);
    }
  }

  // EVERY file on those songs, not only the ones a row named. A row that has
  // not chosen a file plays its song's default (resolveRowVersion), and the
  // row's picker needs the song's whole list to offer a choice.
  const filesBySong = new Map<string, SongFile[]>();
  if (songIds.length > 0) {
    const result = await adminClient!
      .from(SONG_VERSIONS_TABLE)
      .select('id,song_id,label,file_name,duration_seconds,created_at')
      .in('song_id', songIds);
    for (const row of result.data || []) {
      const file = asRow(row);
      const songId = String(file.song_id || '');
      const list = filesBySong.get(songId) || [];
      list.push({
        id: String(file.id || ''),
        label: String(file.label || 'original'),
        fileName: String(file.file_name || ''),
        durationSeconds:
          typeof file.duration_seconds === 'number' && file.duration_seconds > 0
            ? file.duration_seconds
            : null,
        createdAt: file.created_at ? String(file.created_at) : null,
      });
      filesBySong.set(songId, list);
    }
  }

  const asSeconds = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

  const items = rows.map((row) => {
    const song = songs.get(String(row.song_id || '')) || null;
    const files = song ? filesBySong.get(String(song.id)) || [] : [];
    const { version, chosen } = resolveRowVersion(
      row.song_version_id ? String(row.song_version_id) : null,
      files
    );

    const inputs: SetlistSummaryItem = {
      itemType: String(row.item_type || 'song') as SetlistSummaryItem['itemType'],
      itemSeconds: asSeconds(row.duration_seconds),
      versionSeconds: version ? version.durationSeconds : null,
      songSeconds: song ? asSeconds(song.duration_seconds) : null,
    };
    const resolved = resolveItemDuration(inputs);

    return {
      id: String(row.id || ''),
      setlistId: String(row.setlist_id || ''),
      itemType: String(row.item_type || 'song'),
      songId: row.song_id ? String(row.song_id) : null,
      songVersionId: row.song_version_id ? String(row.song_version_id) : null,
      position: typeof row.position === 'number' ? row.position : 0,
      durationSeconds: asSeconds(row.duration_seconds),
      cueNote: row.cue_note ? String(row.cue_note) : null,
      label: row.label ? String(row.label) : null,
      song: song
        ? {
            id: String(song.id),
            title: String(song.title || ''),
            durationSeconds: asSeconds(song.duration_seconds),
            musicalKey: song.musical_key ? String(song.musical_key) : null,
            bpm: typeof song.bpm === 'number' ? song.bpm : null,
          }
        : null,
      // The file this row will SEND, chosen or defaulted. Null means the song
      // has no file at all yet, which the page and the pack both say out loud.
      version: version
        ? {
            id: version.id,
            label: version.label || 'original',
            fileName: version.fileName,
            durationSeconds: version.durationSeconds,
          }
        : null,
      /** True when the row picked this file; false when it is the default. */
      versionChosen: chosen,
      /** Every file on the song, newest first, for the row's picker. */
      files: [...files]
        .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))
        .map(({ createdAt: _createdAt, ...file }) => file),
      // Surfaced so the row can say WHERE its number came from — a length
      // typed by hand should be distinguishable from one read off a file.
      resolvedDurationSeconds: resolved.seconds,
      durationSource: resolved.source,
      inputs,
    };
  });

  const setLengthMinutes =
    typeof access.event.set_length_minutes === 'number' ? access.event.set_length_minutes : 30;

  return NextResponse.json({
    items: items.map(({ inputs: _inputs, ...item }) => item),
    setLengthMinutes,
    summary: summarizeSetlist(
      items.map((item) => item.inputs),
      setLengthMinutes
    ),
  });
}

/** Add to the end of the set. Position is assigned server-side so two people
 *  adding at once cannot land on the same slot. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { setlistId } = await context.params;
  if (!setlistId) {
    return NextResponse.json({ error: 'A set id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send what to add.' }, { status: 400 });
  }

  const parsed = parseSetlistItemCreate(body);
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: parsed.errors[0].message, fieldErrors: parsed.errors },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, true);
  if ('error' in access) return access.error;

  // A song item must name a song on this team's catalog. Checked here rather
  // than left to the foreign key so a bad id reads as a sentence, and so a
  // song belonging to another team is refused rather than silently linked.
  if (parsed.columns.song_id) {
    const song = await adminClient!
      .from(SONGS_TABLE)
      .select('id,artist_id')
      .eq('id', parsed.columns.song_id)
      .maybeSingle();
    const songRow = song.data ? asRow(song.data) : null;
    if (!songRow || String(songRow.artist_id || '') !== access.artistId) {
      return NextResponse.json(
        { error: 'That song is not in this artist’s catalog.' },
        { status: 404 }
      );
    }
  }

  // A chosen file has to be one of THAT song's files. Without this, any
  // version id at all could be attached — including another team's — and the
  // public pack would then hand it out, because the download route trusts the
  // set it resolved the token to.
  if (parsed.columns.song_version_id) {
    const owned = await versionBelongsToSong(
      adminClient!,
      parsed.columns.song_version_id,
      parsed.columns.song_id ?? null
    );
    if (!owned) {
      return NextResponse.json({ error: 'That file is not on this song.' }, { status: 404 });
    }
  }

  const last = await adminClient!
    .from(SETLIST_ITEMS_TABLE)
    .select('position')
    .eq('setlist_id', setlistId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastRow = last.data ? asRow(last.data) : null;
  const nextPosition = typeof lastRow?.position === 'number' ? lastRow.position + 1 : 0;

  const { data, error } = await adminClient!
    .from(SETLIST_ITEMS_TABLE)
    .insert({
      ...parsed.columns,
      setlist_id: setlistId,
      position: parsed.columns.position ?? nextPosition,
      owner_user_id: access.ownerUserId,
    })
    .select(SETLIST_ITEM_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not add that to the set.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ item: asRow(data) }, { status: 201 });
}
