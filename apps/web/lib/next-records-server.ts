import type { SupabaseClient } from '@supabase/supabase-js';
import { seedRelationship } from '@/lib/relationships-server';
import {
  lagosToday,
  orderSessions,
  summarizeRecord,
  type NextRecord,
  type RecordKind,
  type RecordPatch,
  type RecordSession,
  type RecordSong,
  type RecordStatus,
  type RecordSummary,
  type SessionInput,
  type SessionStatus,
  type SongStage,
} from '@/lib/next-records';
import {
  pickRecordAsk,
  pickSessionToCheck,
  pickWhatsNext,
  type AskRelease,
  type RecordAsk,
  type SessionCheckAsk,
} from '@/lib/home/record-ask';

// Reads and writes for the next record (2026-10-27). Every function takes the
// team's workspace id from the route's gate (app/api/records/_shared.ts), never
// from the request, and filters on it, so a record on another team reads as
// one that does not exist. See docs/notes/2026-10-27-next-record.md.

export const RECORDS_TABLE = 'next_records';
export const RECORD_SONGS_TABLE = 'record_songs';
export const RECORD_SESSIONS_TABLE = 'record_sessions';
export const RECORD_SESSION_PEOPLE_TABLE = 'record_session_people';
export const RECORD_SESSION_SONGS_TABLE = 'record_session_songs';
const TEAM_RELATIONSHIPS_TABLE = 'team_relationships';
const WORKSPACE_MEMBERS_TABLE = 'workspace_members';

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export type RecordsResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

/** The artist must be on this team; a scoped teammate only reaches their own artist. */
export async function findTeamArtist(
  admin: SupabaseClient,
  workspaceId: string,
  artistId: string
): Promise<{ id: string; name: string } | null> {
  const { data } = await admin
    .from('artists')
    .select('id,name')
    .eq('id', artistId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return data ? { id: text((data as Row).id), name: text((data as Row).name) } : null;
}

/** Records still being made for one artist, as the artist page's rows. */
export async function listArtistRecords(
  admin: SupabaseClient,
  workspaceId: string,
  artistId: string
): Promise<RecordsResult<RecordSummary[]>> {
  const { data, error } = await admin
    .from(RECORDS_TABLE)
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('artist_id', artistId)
    .eq('status', 'making')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return fail(500, 'Could not load the records.');
  const ids = ((data ?? []) as Row[]).map((row) => text(row.id));
  const records = await loadRecords(admin, workspaceId, ids);
  if (!records) return fail(500, 'Could not load the records.');
  const today = lagosToday();
  return { ok: true, value: records.map((record) => summarizeRecord(record, today)) };
}

export async function createRecord(
  admin: SupabaseClient,
  input: { workspaceId: string; artistId: string; userId: string; title: string; kind: RecordKind | null; idea: string }
): Promise<RecordsResult<NextRecord>> {
  const { data, error } = await admin
    .from(RECORDS_TABLE)
    .insert({
      workspace_id: input.workspaceId,
      artist_id: input.artistId,
      title: input.title,
      kind: input.kind,
      idea: input.idea,
      created_by: input.userId,
    })
    .select('id')
    .single();
  if (error || !data) return fail(500, 'Could not start the record.');
  return readRecord(admin, input.workspaceId, text((data as Row).id));
}

/** One record with its songs and sessions, or 404 when it is not this team's. */
export async function readRecord(
  admin: SupabaseClient,
  workspaceId: string,
  recordId: string
): Promise<RecordsResult<NextRecord>> {
  const records = await loadRecords(admin, workspaceId, [recordId]);
  if (!records) return fail(500, 'Could not load the record.');
  if (!records[0]) return fail(404, 'Record not found.');
  return { ok: true, value: records[0] };
}

async function loadRecords(admin: SupabaseClient, workspaceId: string, ids: string[]): Promise<NextRecord[] | null> {
  if (ids.length === 0) return [];
  const [records, songs, sessions] = await Promise.all([
    admin
      .from(RECORDS_TABLE)
      .select('id,artist_id,title,kind,idea,status,release_id,created_at')
      .eq('workspace_id', workspaceId)
      .in('id', ids),
    admin
      .from(RECORD_SONGS_TABLE)
      .select('id,record_id,title,stage,position,created_at')
      .eq('workspace_id', workspaceId)
      .in('record_id', ids)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from(RECORD_SESSIONS_TABLE)
      .select('id,record_id,session_date,date_hint,status,note')
      .eq('workspace_id', workspaceId)
      .in('record_id', ids),
  ]);
  if (records.error || songs.error || sessions.error) return null;

  const sessionRows = (sessions.data ?? []) as Row[];
  const sessionIds = sessionRows.map((row) => text(row.id));
  const [people, links] = sessionIds.length
    ? await Promise.all([
        admin
          .from(RECORD_SESSION_PEOPLE_TABLE)
          .select('session_id,person_id,name,role,created_at')
          .in('session_id', sessionIds)
          .order('created_at', { ascending: true }),
        admin.from(RECORD_SESSION_SONGS_TABLE).select('session_id,song_id').in('session_id', sessionIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (people.error || links.error) return null;

  const peopleBySession = new Map<string, RecordSession['people']>();
  for (const row of (people.data ?? []) as Row[]) {
    const list = peopleBySession.get(text(row.session_id)) ?? [];
    list.push({ personId: row.person_id ? text(row.person_id) : null, name: text(row.name), role: text(row.role) });
    peopleBySession.set(text(row.session_id), list);
  }
  const songsBySession = new Map<string, string[]>();
  for (const row of (links.data ?? []) as Row[]) {
    const list = songsBySession.get(text(row.session_id)) ?? [];
    list.push(text(row.song_id));
    songsBySession.set(text(row.session_id), list);
  }

  const today = lagosToday();
  const byId = new Map(
    ((records.data ?? []) as Row[]).map((row) => {
      const id = text(row.id);
      const recordSongs: RecordSong[] = ((songs.data ?? []) as Row[])
        .filter((song) => text(song.record_id) === id)
        .map((song) => ({
          id: text(song.id),
          title: text(song.title),
          stage: text(song.stage) as SongStage,
          position: Number(song.position) || 0,
        }));
      const recordSessions: RecordSession[] = sessionRows
        .filter((s) => text(s.record_id) === id)
        .map((s) => ({
          id: text(s.id),
          date: s.session_date ? text(s.session_date) : null,
          dateHint: text(s.date_hint),
          status: text(s.status) as SessionStatus,
          note: text(s.note),
          people: peopleBySession.get(text(s.id)) ?? [],
          songIds: songsBySession.get(text(s.id)) ?? [],
        }));
      const record: NextRecord = {
        id,
        artistId: text(row.artist_id),
        title: text(row.title),
        kind: (row.kind ? text(row.kind) : null) as RecordKind | null,
        idea: text(row.idea),
        status: text(row.status) as RecordStatus,
        releaseId: row.release_id ? text(row.release_id) : null,
        createdAt: text(row.created_at),
        songs: recordSongs,
        sessions: orderSessions(recordSessions, today),
      };
      return [id, record] as const;
    })
  );
  return ids.map((id) => byId.get(id)).filter((record): record is NextRecord => Boolean(record));
}

/** The record's artist, for the scope check, without loading the rest. */
export async function findRecordArtist(
  admin: SupabaseClient,
  workspaceId: string,
  recordId: string
): Promise<string | null> {
  const { data } = await admin
    .from(RECORDS_TABLE)
    .select('artist_id')
    .eq('id', recordId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return data ? text((data as Row).artist_id) : null;
}

export async function updateRecord(
  admin: SupabaseClient,
  workspaceId: string,
  recordId: string,
  patch: RecordPatch
): Promise<RecordsResult<NextRecord>> {
  const { error } = await admin.from(RECORDS_TABLE).update(patch).eq('id', recordId).eq('workspace_id', workspaceId);
  if (error) return fail(500, 'Could not save the record.');
  return readRecord(admin, workspaceId, recordId);
}

export async function addSong(
  admin: SupabaseClient,
  workspaceId: string,
  recordId: string,
  song: { title: string; stage: SongStage }
): Promise<RecordsResult<NextRecord>> {
  const last = await admin
    .from(RECORD_SONGS_TABLE)
    .select('position')
    .eq('record_id', recordId)
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: false })
    .limit(1);
  const position = last.data?.[0] ? Number((last.data[0] as Row).position) + 1 : 0;
  const { error } = await admin
    .from(RECORD_SONGS_TABLE)
    .insert({ workspace_id: workspaceId, record_id: recordId, title: song.title, stage: song.stage, position });
  if (error) return fail(500, 'Could not add the song.');
  return readRecord(admin, workspaceId, recordId);
}

export async function updateSong(
  admin: SupabaseClient,
  workspaceId: string,
  recordId: string,
  songId: string,
  patch: Partial<{ title: string; stage: SongStage }>
): Promise<RecordsResult<NextRecord>> {
  const { data, error } = await admin
    .from(RECORD_SONGS_TABLE)
    .update(patch)
    .eq('id', songId)
    .eq('record_id', recordId)
    .eq('workspace_id', workspaceId)
    .select('id');
  if (error) return fail(500, 'Could not save the song.');
  if (!data || data.length === 0) return fail(404, 'Song not found.');
  return readRecord(admin, workspaceId, recordId);
}

export async function deleteSong(
  admin: SupabaseClient,
  workspaceId: string,
  recordId: string,
  songId: string
): Promise<RecordsResult<NextRecord>> {
  const { error } = await admin
    .from(RECORD_SONGS_TABLE)
    .delete()
    .eq('id', songId)
    .eq('record_id', recordId)
    .eq('workspace_id', workspaceId);
  if (error) return fail(500, 'Could not remove the song.');
  return readRecord(admin, workspaceId, recordId);
}

/**
 * Links each typed person to a team contact. An id must already be one of this
 * team's contacts or it is dropped to a plain name. A name with no id goes
 * through Relationships' own find-or-add, so "Tolu, Producer" typed twice lands
 * on the same contact, and the dedupe rules live in one place. When contacts
 * are not available (flag off, or a teammate scoped to one artist) names stay
 * names.
 */
async function linkPeople(
  admin: SupabaseClient,
  ctx: { workspaceId: string; userId: string; canUseContacts: boolean },
  people: SessionInput['people']
): Promise<SessionInput['people']> {
  if (!ctx.canUseContacts || people.length === 0) return people.map((p) => ({ ...p, personId: null }));
  const claimedIds = people.map((p) => p.personId).filter((id): id is string => Boolean(id));
  const known = new Set<string>();
  if (claimedIds.length) {
    const { data } = await admin
      .from(TEAM_RELATIONSHIPS_TABLE)
      .select('person_id')
      .eq('workspace_id', ctx.workspaceId)
      .in('person_id', claimedIds);
    for (const row of (data ?? []) as Row[]) known.add(text(row.person_id));
  }
  const linked: SessionInput['people'] = [];
  for (const person of people) {
    if (person.personId && known.has(person.personId)) {
      linked.push(person);
      continue;
    }
    const seeded = await seedRelationship(admin, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      data: {
        label: person.name,
        role: person.role,
        email: null,
        phone: null,
        tags: [],
        notes: '',
        rateNote: null,
        lastContactAt: null,
      },
      source: 'manual',
    });
    linked.push({ ...person, personId: seeded.ok ? seeded.personId : null });
  }
  return linked;
}

/** Create (sessionId null) or replace a whole session: its day, people and songs. */
export async function saveSession(
  admin: SupabaseClient,
  ctx: { workspaceId: string; userId: string; canUseContacts: boolean },
  recordId: string,
  sessionId: string | null,
  input: SessionInput
): Promise<RecordsResult<NextRecord>> {
  const { workspaceId } = ctx;

  if (input.songIds.length) {
    const { data } = await admin
      .from(RECORD_SONGS_TABLE)
      .select('id')
      .eq('record_id', recordId)
      .eq('workspace_id', workspaceId)
      .in('id', input.songIds);
    if ((data ?? []).length !== input.songIds.length) return fail(400, 'One of those songs is not on this record.');
  }

  const fields = {
    session_date: input.date,
    date_hint: input.dateHint,
    status: input.status,
    note: input.note,
  };
  let id = sessionId;
  if (id) {
    const { data, error } = await admin
      .from(RECORD_SESSIONS_TABLE)
      .update(fields)
      .eq('id', id)
      .eq('record_id', recordId)
      .eq('workspace_id', workspaceId)
      .select('id');
    if (error) return fail(500, 'Could not save the session.');
    if (!data || data.length === 0) return fail(404, 'Session not found.');
  } else {
    const { data, error } = await admin
      .from(RECORD_SESSIONS_TABLE)
      .insert({ ...fields, workspace_id: workspaceId, record_id: recordId })
      .select('id')
      .single();
    if (error || !data) return fail(500, 'Could not add the session.');
    id = text((data as Row).id);
  }

  const people = await linkPeople(admin, ctx, input.people);
  const cleared = await Promise.all([
    admin.from(RECORD_SESSION_PEOPLE_TABLE).delete().eq('session_id', id).eq('workspace_id', workspaceId),
    admin.from(RECORD_SESSION_SONGS_TABLE).delete().eq('session_id', id).eq('workspace_id', workspaceId),
  ]);
  if (cleared.some((result) => result.error)) return fail(500, 'Could not save the session.');

  const writes = [];
  if (people.length) {
    writes.push(
      admin.from(RECORD_SESSION_PEOPLE_TABLE).insert(
        people.map((person) => ({
          workspace_id: workspaceId,
          session_id: id,
          person_id: person.personId,
          name: person.name,
          role: person.role,
        }))
      )
    );
  }
  if (input.songIds.length) {
    writes.push(
      admin
        .from(RECORD_SESSION_SONGS_TABLE)
        .insert(input.songIds.map((songId) => ({ workspace_id: workspaceId, session_id: id, song_id: songId })))
    );
  }
  const written = await Promise.all(writes);
  if (written.some((result) => result.error)) return fail(500, 'Could not save everyone in the session.');

  return readRecord(admin, workspaceId, recordId);
}

export async function deleteSession(
  admin: SupabaseClient,
  workspaceId: string,
  recordId: string,
  sessionId: string
): Promise<RecordsResult<NextRecord>> {
  const { error } = await admin
    .from(RECORD_SESSIONS_TABLE)
    .delete()
    .eq('id', sessionId)
    .eq('record_id', recordId)
    .eq('workspace_id', workspaceId);
  if (error) return fail(500, 'Could not remove the session.');
  return readRecord(admin, workspaceId, recordId);
}

// ── For UrgAns's add_to_record (step 2, lib/chappi/tool-families/records.ts) ──

export type RecordInScope = { id: string; title: string; artistId: string; artistName: string; workspaceId: string };

/**
 * Every record still being made across the caller's teams, newest first. A
 * teammate scoped to one artist sees only that artist's records, as on the
 * routes. Null when the read fails.
 */
export async function listRecordsInMaking(
  admin: SupabaseClient,
  scope: { workspaceIds: string[]; artistScopeByWorkspaceId: Record<string, string> }
): Promise<RecordInScope[] | null> {
  if (scope.workspaceIds.length === 0) return [];
  const { data, error } = await admin
    .from(RECORDS_TABLE)
    .select('id,title,artist_id,workspace_id')
    .in('workspace_id', scope.workspaceIds)
    .eq('status', 'making')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return null;
  const rows = ((data ?? []) as Row[]).filter((row) => {
    const scoped = scope.artistScopeByWorkspaceId[text(row.workspace_id)];
    return !scoped || scoped === text(row.artist_id);
  });
  const artistIds = [...new Set(rows.map((row) => text(row.artist_id)))];
  const names = new Map<string, string>();
  if (artistIds.length) {
    const artists = await admin
      .from('artists')
      .select('id,name')
      .in('workspace_id', scope.workspaceIds)
      .in('id', artistIds);
    for (const row of (artists.data ?? []) as Row[]) names.set(text(row.id), text(row.name));
  }
  return rows.map((row) => ({
    id: text(row.id),
    title: text(row.title),
    artistId: text(row.artist_id),
    artistName: names.get(text(row.artist_id)) ?? '',
    workspaceId: text(row.workspace_id),
  }));
}

/** Guests are read-only, and so is anyone with no live membership, as on the routes. */
export async function isReadOnlyOnTeam(admin: SupabaseClient, workspaceId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .neq('status', 'removed')
    .limit(1);
  const role = (data as Row[] | null)?.[0]?.role;
  return !role || role === 'guest';
}

// ---------------------------------------------------------------- Home asks
// Step 3 (2026-10-27): what Home's One Thing asks about the next record. The
// rules are pure in lib/home/record-ask.ts; this only reads. Never fails Home:
// any read error means no ask.

const ARTISTS_TABLE = 'artists';

export async function loadHomeRecordAsk(
  admin: SupabaseClient,
  input: { workspaceId: string; scopeArtistId: string | null; releases: readonly AskRelease[]; now: Date }
): Promise<RecordAsk | null> {
  try {
    const { workspaceId, scopeArtistId, now } = input;
    const today = lagosToday(now);

    let making = admin
      .from(RECORDS_TABLE)
      .select('id,title,artist_id')
      .eq('workspace_id', workspaceId)
      .eq('status', 'making');
    if (scopeArtistId) making = making.eq('artist_id', scopeArtistId);
    const { data: recordRows, error: recordError } = await making;
    if (recordError) return null;
    const records = (recordRows ?? []) as Row[];

    let sessionCheck: SessionCheckAsk | null = null;
    if (records.length) {
      const { data: sessionRows, error: sessionError } = await admin
        .from(RECORD_SESSIONS_TABLE)
        .select('id,record_id,session_date,status')
        .eq('workspace_id', workspaceId)
        .eq('status', 'planned')
        .lt('session_date', today)
        .in('record_id', records.map((row) => text(row.id)));
      if (sessionError) return null;
      const due = pickSessionToCheck(
        ((sessionRows ?? []) as Row[]).map((row) => ({
          id: text(row.id),
          recordId: text(row.record_id),
          date: text(row.session_date).slice(0, 10) || null,
          status: text(row.status) as SessionStatus,
        })),
        today
      );
      if (due) {
        const record = await readRecord(admin, workspaceId, due.recordId);
        const session = record.ok ? record.value.sessions.find((s) => s.id === due.id) : undefined;
        const { data: artist } = record.ok
          ? await admin
              .from(ARTISTS_TABLE)
              .select('name')
              .eq('id', record.value.artistId)
              .eq('workspace_id', workspaceId)
              .maybeSingle()
          : { data: null };
        if (record.ok && session) {
          sessionCheck = {
            kind: 'session_check',
            recordId: record.value.id,
            recordTitle: record.value.title,
            artistId: record.value.artistId,
            artistName: text((artist as Row | null)?.name),
            session,
          };
        }
      }
    }
    if (sessionCheck) return sessionCheck;

    const { data: snoozeRows, error: snoozeError } = await admin
      .from(ARTISTS_TABLE)
      .select('id,next_record_snooze_until')
      .eq('workspace_id', workspaceId)
      .gt('next_record_snooze_until', now.toISOString());
    if (snoozeError) return null;
    const snoozedUntil = new Map(
      ((snoozeRows ?? []) as Row[]).map((row) => [text(row.id), text(row.next_record_snooze_until)] as const)
    );
    const whatsNext = pickWhatsNext(
      {
        releases: input.releases,
        artistsMaking: new Set(records.map((row) => text(row.artist_id))),
        snoozedUntil,
        scopeArtistId,
      },
      now
    );
    return pickRecordAsk({ whatsNext, sessionCheck });
  } catch {
    return null;
  }
}

/** "Nothing yet, ask me in 2 weeks": the artist must already be the team's (the gate checked). */
export async function snoozeRecordAsk(
  admin: SupabaseClient,
  workspaceId: string,
  artistId: string,
  until: string
): Promise<RecordsResult<{ snoozedUntil: string }>> {
  const { error } = await admin
    .from(ARTISTS_TABLE)
    .update({ next_record_snooze_until: until })
    .eq('id', artistId)
    .eq('workspace_id', workspaceId);
  if (error) return fail(500, 'Could not save that.');
  return { ok: true, value: { snoozedUntil: until } };
}
