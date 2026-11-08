// The songs on a rollout (#1115): add, edit, remove, reorder. Server only.
//
// A rollout with no rows is a single whose song is the rollout itself. The
// first "Add a song" writes two rows: song 1 copied from the rollout (title,
// ISRC, explicit, featured artists, lyrics) and the new, empty song 2. From
// then on every song is a row, and releases.release_type follows the count
// (1 single, 2 to 6 an EP, 7 or more an album).
//
// Nothing changes while the release is with TRM: the songs sent are the songs
// TRM has.

import type { SupabaseClient } from '@supabase/supabase-js';
import { IN_FLIGHT, kindForCount } from './release';
import { loadSubmission, TRACKS, type TrmActor, type TrmResult } from './server';

type Json = Record<string, unknown>;
const asRecord = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const asText = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const fail = (status: number, code: string, error: string): TrmResult<never> => ({ ok: false, status, code, error });

/** Most songs a rollout holds. TRM names no cap; this keeps a slip from making hundreds. */
export const MAX_SONGS = 40;

const CREDIT_ROLES = ['songwriter', 'composer', 'lyricist', 'producer', 'vocalist', 'musician', 'engineer', 'mixing_engineer', 'mastering_engineer', 'other'];

/** ISRC as stored: 12 characters, no dashes or spaces, upper case. Null = empty. */
export function normaliseIsrc(value: unknown): { ok: true; isrc: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, isrc: null };
  if (typeof value !== 'string') return { ok: false };
  const compact = value.replace(/[\s-]/g, '').toUpperCase();
  if (!compact) return { ok: true, isrc: null };
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(compact) ? { ok: true, isrc: compact } : { ok: false };
}

/** A song's own credits, cleaned: names kept, known roles only, splits 0 to 100. */
export function cleanCredits(value: unknown): Array<{ name: string; roles: string[]; masterSplit: number | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .map(asRecord)
    .map((c) => {
      const split = Number(c.masterSplit);
      return {
        name: asText(c.name, 120) ?? '',
        roles: (Array.isArray(c.roles) ? c.roles : []).filter((r): r is string => typeof r === 'string' && CREDIT_ROLES.includes(r)),
        masterSplit: c.masterSplit === null || c.masterSplit === '' || c.masterSplit === undefined || !Number.isFinite(split) ? null : Math.min(100, Math.max(0, split)),
      };
    })
    .filter((c) => c.name)
    .slice(0, 30);
}

async function lockedRefusal(admin: SupabaseClient, releaseId: string): Promise<TrmResult<never> | null> {
  const current = await loadSubmission(admin, releaseId);
  if (current === 'error') return fail(500, 'read_failed', 'Could not check this rollout. Try again.');
  if (current && (IN_FLIGHT.includes(current.status) || current.status === 'published')) {
    return fail(409, 'in_flight', 'It is already with TRM, so the songs can’t change.');
  }
  return null;
}

async function trackIds(admin: SupabaseClient, releaseId: string): Promise<string[] | null> {
  const { data, error } = await admin.from(TRACKS).select('id').eq('release_id', releaseId).order('position', { ascending: true });
  if (error) return null;
  return ((data as Json[] | null) ?? []).map((r) => String(r.id));
}

/** Number the songs 1..n in the given order and set the rollout's type. */
async function renumber(admin: SupabaseClient, releaseId: string, ids: string[]): Promise<boolean> {
  for (let i = 0; i < ids.length; i += 1) {
    const { error } = await admin.from(TRACKS).update({ position: i + 1 }).eq('id', ids[i]).eq('release_id', releaseId);
    if (error) return false;
  }
  if (ids.length > 0) {
    await admin.from('releases').update({ release_type: kindForCount(ids.length) }).eq('id', releaseId);
  }
  return true;
}

export async function addTrack(admin: SupabaseClient, releaseId: string, actor: TrmActor): Promise<TrmResult<{ trackId: string }>> {
  const locked = await lockedRefusal(admin, releaseId);
  if (locked) return locked;
  const ids = await trackIds(admin, releaseId);
  if (!ids) return fail(500, 'read_failed', 'Could not add the song. Try again.');
  if (ids.length >= MAX_SONGS) return fail(409, 'too_many', `A rollout holds up to ${MAX_SONGS} songs.`);

  const rows: Json[] = [];
  if (ids.length === 0) {
    // Song 1 is the rollout itself until now: copy it over.
    const [release, metadata] = await Promise.all([
      admin.from('releases').select('title').eq('id', releaseId).maybeSingle(),
      admin.from('release_metadata').select('isrc,explicit,featured_artists,lyrics').eq('release_id', releaseId).maybeSingle(),
    ]);
    if (release.error || metadata.error) return fail(500, 'read_failed', 'Could not add the song. Try again.');
    const r = asRecord(release.data);
    const m = asRecord(metadata.data);
    const isrc = normaliseIsrc(m.isrc);
    rows.push({
      release_id: releaseId,
      position: 1,
      title: asText(r.title) ?? '',
      isrc: isrc.ok ? isrc.isrc : null,
      explicit: typeof m.explicit === 'boolean' ? m.explicit : null,
      featured_artists: asText(m.featured_artists),
      lyrics: asText(m.lyrics, 20_000),
      created_by: actor.id,
    });
  }
  rows.push({ release_id: releaseId, position: Math.max(ids.length, rows.length) + 1, title: '', created_by: actor.id });
  const { data, error } = await admin.from(TRACKS).insert(rows).select('id,position');
  if (error || !data) return fail(500, 'write_failed', 'Could not add the song. Try again.');
  const inserted = (data as Json[]).sort((a, b) => Number(a.position) - Number(b.position));
  const newId = String(inserted[inserted.length - 1].id);
  await renumber(admin, releaseId, [...ids, ...inserted.map((r) => String(r.id))]);
  return { ok: true, data: { trackId: newId } };
}

export async function saveTrack(
  admin: SupabaseClient,
  releaseId: string,
  input: Json
): Promise<TrmResult> {
  const trackId = asText(input.trackId);
  if (!trackId) return fail(400, 'bad_track', 'That song is not on this rollout.');
  const locked = await lockedRefusal(admin, releaseId);
  if (locked) return locked;
  const patch: Json = {};
  if (input.title !== undefined) patch.title = asText(input.title) ?? '';
  if (input.version !== undefined) patch.version = asText(input.version, 120);
  if (input.featuredArtists !== undefined) patch.featured_artists = asText(input.featuredArtists, 300);
  if (input.explicit !== undefined) patch.explicit = typeof input.explicit === 'boolean' ? input.explicit : null;
  if (input.lyrics !== undefined) patch.lyrics = asText(input.lyrics, 20_000);
  if (input.isrc !== undefined) {
    const isrc = normaliseIsrc(input.isrc);
    if (!isrc.ok) return fail(400, 'bad_isrc', 'An ISRC is 12 letters and numbers, like NGA1B2600012.');
    patch.isrc = isrc.isrc;
  }
  if (input.creditsMode !== undefined) patch.credits_mode = input.creditsMode === 'own' ? 'own' : 'rollout';
  if (input.credits !== undefined) patch.credits = cleanCredits(input.credits);
  if (Object.keys(patch).length === 0) return { ok: true, data: {} };
  const { data, error } = await admin.from(TRACKS).update(patch).eq('id', trackId).eq('release_id', releaseId).select('id');
  if (error) return fail(500, 'write_failed', 'Could not save the song. Try again.');
  if (!data || (data as unknown[]).length === 0) return fail(404, 'bad_track', 'That song is not on this rollout.');
  return { ok: true, data: {} };
}

export async function removeTrack(admin: SupabaseClient, releaseId: string, input: Json): Promise<TrmResult> {
  const trackId = asText(input.trackId);
  if (!trackId) return fail(400, 'bad_track', 'That song is not on this rollout.');
  const locked = await lockedRefusal(admin, releaseId);
  if (locked) return locked;
  const { error } = await admin.from(TRACKS).delete().eq('id', trackId).eq('release_id', releaseId);
  if (error) return fail(500, 'write_failed', 'Could not remove the song. Try again.');
  const ids = await trackIds(admin, releaseId);
  if (!ids || !(await renumber(admin, releaseId, ids))) return fail(500, 'write_failed', 'Could not renumber the songs. Try again.');
  return { ok: true, data: {} };
}

export async function orderTracks(admin: SupabaseClient, releaseId: string, input: Json): Promise<TrmResult> {
  const wanted = Array.isArray(input.trackIds) ? input.trackIds.filter((x): x is string => typeof x === 'string') : [];
  const locked = await lockedRefusal(admin, releaseId);
  if (locked) return locked;
  const ids = await trackIds(admin, releaseId);
  if (!ids) return fail(500, 'read_failed', 'Could not reorder. Try again.');
  if (wanted.length !== ids.length || new Set(wanted).size !== ids.length || wanted.some((id) => !ids.includes(id))) {
    return fail(409, 'stale', 'The songs changed. Reload and try again.');
  }
  if (!(await renumber(admin, releaseId, wanted))) return fail(500, 'write_failed', 'Could not reorder. Try again.');
  return { ok: true, data: {} };
}
