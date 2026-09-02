import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildPackFileName, resolveItemDuration, type SongVersionLabel } from '@/lib/setlist';
import { isPackExpired } from '@/lib/dj-pack';
import { formatShowDateTime, shortTimezoneLabel } from '@/lib/events';

/**
 * Resolving a DJ pack from its public token.
 *
 * Shaped after lib/epk-server.ts and bound by the same contract: it NEVER
 * throws, and every failure collapses to one answer. A public page must not
 * distinguish "revoked" from "never existed" from "the database blinked" —
 * anything else lets a stranger probe for live links — and it must not 500 in
 * front of a DJ standing in a venue.
 *
 * `expired` is the one state that IS distinguished, because it is the one the
 * recipient can act on: they were given a real link and it has lapsed, so the
 * page tells them to ask for a new one rather than implying they were never
 * meant to have it.
 */

export type PackTrack = {
  position: number;
  title: string;
  versionLabel: SongVersionLabel | null;
  bpm: number | null;
  musicalKey: string | null;
  cueNote: string | null;
  durationSeconds: number | null;
  /** The name the file lands under, set order already baked in. */
  downloadName: string;
  /** Null for a slot with no file attached yet — rendered as "no file" rather
   *  than as a broken player. */
  versionId: string | null;
  /** Unreleased tracks carry a visible mark on the page. */
  isUnreleased: boolean;
};

export type PublicPack =
  | { state: 'unavailable' }
  | { state: 'expired'; showTitle: string }
  | {
      state: 'ok';
      recipientId: string;
      recipientName: string;
      packId: string;
      requiresPasscode: boolean;
      showTitle: string;
      artistName: string;
      venue: string;
      setTime: string;
      timezoneLabel: string;
      stage: string | null;
      setLengthMinutes: number;
      tracks: PackTrack[];
    };

const UNAVAILABLE: PublicPack = { state: 'unavailable' };

function adminClient(): SupabaseClient | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const row = (value: unknown): Record<string, unknown> =>
  (value || {}) as Record<string, unknown>;

const asSeconds = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

export async function loadPublicPack(token: string): Promise<PublicPack> {
  if (process.env.NEXT_PUBLIC_FEATURE_EVENTS !== 'true') return UNAVAILABLE;
  if (!token || token.length > 200) return UNAVAILABLE;

  try {
    const client = adminClient();
    if (!client) return UNAVAILABLE;

    const recipientResult = await client
      .from('dj_pack_recipients')
      .select('id,pack_id,recipient_name,revoked_at')
      .eq('token', token)
      .maybeSingle();

    const recipient = recipientResult.data ? row(recipientResult.data) : null;
    if (!recipient || recipient.revoked_at) return UNAVAILABLE;

    const packResult = await client
      .from('dj_packs')
      .select('id,event_id,setlist_id,passcode,expires_at')
      .eq('id', String(recipient.pack_id))
      .maybeSingle();

    const pack = packResult.data ? row(packResult.data) : null;
    if (!pack) return UNAVAILABLE;

    const eventResult = await client
      .from('events')
      .select('id,artist_id,title,venue_name,city,country,timezone,set_start_at,set_length_minutes,stage')
      .eq('id', String(pack.event_id))
      .maybeSingle();

    const event = eventResult.data ? row(eventResult.data) : null;
    if (!event) return UNAVAILABLE;

    const showTitle = String(event.title || 'the show');

    if (isPackExpired(pack.expires_at ? String(pack.expires_at) : null)) {
      return { state: 'expired', showTitle };
    }

    const itemsResult = await client
      .from('setlist_items')
      .select('id,item_type,song_id,song_version_id,position,duration_seconds,cue_note,label')
      .eq('setlist_id', String(pack.setlist_id))
      .order('position', { ascending: true });

    const items = (itemsResult.data || []).map(row);

    const songIds = [...new Set(items.map((item) => String(item.song_id || '')).filter(Boolean))];
    const versionIds = [
      ...new Set(items.map((item) => String(item.song_version_id || '')).filter(Boolean)),
    ];

    const songs = new Map<string, Record<string, unknown>>();
    if (songIds.length > 0) {
      const result = await client
        .from('songs')
        .select('id,title,duration_seconds,musical_key,bpm,release_id')
        .in('id', songIds);
      for (const entry of result.data || []) {
        const song = row(entry);
        songs.set(String(song.id), song);
      }
    }

    const versions = new Map<string, Record<string, unknown>>();
    if (versionIds.length > 0) {
      const result = await client
        .from('song_versions')
        .select('id,label,file_name,duration_seconds')
        .in('id', versionIds);
      for (const entry of result.data || []) {
        const version = row(entry);
        versions.set(String(version.id), version);
      }
    }

    // A release the show's artist has out means the song is public; a song with
    // no release is unreleased and gets the visible mark. Deliberately
    // conservative — an unknown song is treated as unreleased, because the cost
    // of a missing warning is higher than the cost of an unnecessary one.
    const artistName = await resolveArtistName(client, String(event.artist_id || ''));

    let position = 0;
    const tracks: PackTrack[] = [];
    for (const item of items) {
      // Only songs are downloadable. Talk and breaks matter to the running
      // order, not to a DJ's USB stick.
      if (String(item.item_type || '') !== 'song') continue;
      position += 1;

      const song = songs.get(String(item.song_id || '')) || null;
      const version = versions.get(String(item.song_version_id || '')) || null;
      const label = version ? (String(version.label || 'original') as SongVersionLabel) : null;
      const title = song ? String(song.title || 'Untitled') : 'Untitled';
      const extension = version ? String(version.file_name || '').split('.').pop() || '' : '';

      tracks.push({
        position,
        title,
        versionLabel: label,
        bpm: song && typeof song.bpm === 'number' ? song.bpm : null,
        musicalKey: song && song.musical_key ? String(song.musical_key) : null,
        cueNote: item.cue_note ? String(item.cue_note) : null,
        durationSeconds: resolveItemDuration({
          itemSeconds: asSeconds(item.duration_seconds),
          versionSeconds: version ? asSeconds(version.duration_seconds) : null,
          songSeconds: song ? asSeconds(song.duration_seconds) : null,
        }).seconds,
        downloadName: buildPackFileName({
          position,
          artistName,
          songTitle: title,
          versionLabel: label,
          bpm: song && typeof song.bpm === 'number' ? song.bpm : null,
          musicalKey: song && song.musical_key ? String(song.musical_key) : null,
          extension,
        }),
        versionId: version ? String(version.id) : null,
        isUnreleased: !song || !song.release_id,
      });
    }

    const venue = [event.venue_name, event.city, event.country]
      .filter(Boolean)
      .map(String)
      .join(', ');

    return {
      state: 'ok',
      recipientId: String(recipient.id),
      recipientName: String(recipient.recipient_name || ''),
      packId: String(pack.id),
      requiresPasscode: Boolean(pack.passcode),
      showTitle,
      artistName,
      venue,
      setTime: formatShowDateTime(
        event.set_start_at ? String(event.set_start_at) : null,
        String(event.timezone || 'UTC')
      ),
      timezoneLabel: shortTimezoneLabel(String(event.timezone || '')),
      stage: event.stage ? String(event.stage) : null,
      setLengthMinutes:
        typeof event.set_length_minutes === 'number' ? event.set_length_minutes : 30,
      tracks,
    };
  } catch {
    // Never surface an infrastructure failure to a stranger, and never 500 in
    // front of someone standing in a venue.
    return UNAVAILABLE;
  }
}

async function resolveArtistName(client: SupabaseClient, artistId: string): Promise<string> {
  if (!artistId) return '';
  try {
    const result = await client.from('artists').select('name').eq('id', artistId).maybeSingle();
    return result.data ? String(row(result.data).name || '') : '';
  } catch {
    return '';
  }
}

/**
 * Records that a recipient opened or downloaded something.
 *
 * Best-effort and never throws: a failed log must not stop a DJ getting their
 * tracks. The names are denormalized onto the row so the record survives the
 * recipient being removed — it is the only deterrent on an unreleased track.
 */
export async function logPackAccess(input: {
  packId: string;
  recipientId: string;
  recipientName: string;
  action: 'viewed' | 'downloaded_all' | 'downloaded_track';
  songTitle?: string | null;
  versionLabel?: string | null;
  songVersionId?: string | null;
  ownerUserId?: string | null;
}): Promise<void> {
  try {
    const client = adminClient();
    if (!client) return;

    // The log row is owned by whoever owns the pack, so it appears in the
    // owner's own reads. Resolved here rather than trusted from the caller.
    let ownerUserId = input.ownerUserId || '';
    if (!ownerUserId) {
      const pack = await client
        .from('dj_packs')
        .select('owner_user_id')
        .eq('id', input.packId)
        .maybeSingle();
      ownerUserId = pack.data ? String(row(pack.data).owner_user_id || '') : '';
    }
    if (!ownerUserId) return;

    await client.from('dj_pack_access_log').insert({
      pack_id: input.packId,
      recipient_id: input.recipientId,
      recipient_name: input.recipientName,
      owner_user_id: ownerUserId,
      action: input.action,
      song_title: input.songTitle ?? null,
      version_label: input.versionLabel ?? null,
      song_version_id: input.songVersionId ?? null,
    });
  } catch {
    // Swallowed on purpose — see the docblock.
  }
}
