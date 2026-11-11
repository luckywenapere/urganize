// The next record (2026-10-27, founder approved the mocks): a record still
// being made, under the artist in Catalogue. Pure rules here; reads and writes
// in lib/next-records-server.ts. See docs/notes/2026-10-27-next-record.md.

export const SONG_STAGES = ['idea', 'recording', 'mixing', 'done'] as const;
export type SongStage = (typeof SONG_STAGES)[number];

export const SONG_STAGE_LABELS: Record<SongStage, string> = {
  idea: 'Idea',
  recording: 'Recording',
  mixing: 'Mixing',
  done: 'Done',
};

export const SESSION_STATUSES = ['planned', 'happened', 'moved', 'cancelled'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  planned: 'Planned',
  happened: 'Happened',
  moved: 'Moved',
  cancelled: "Didn't happen",
};

export const RECORD_KINDS = ['single', 'ep', 'album'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

// A project's stages (2026-11-04, #1074, docs/notes/2026-11-04-project-lifecycle.md).
// Idea: nobody has started making it. Making: songs and sessions under way.
// Planned: it became a rollout. Dropped: let go. Idea moves to Making by a
// button or by itself the first time work starts, and never back.
export const RECORD_STATUSES = ['idea', 'making', 'planned', 'dropped'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

/** The stages a project is still open in: on the artist page, askable, plannable. */
export const OPEN_RECORD_STATUSES = ['idea', 'making'] as const;
export type OpenRecordStatus = (typeof OPEN_RECORD_STATUSES)[number];

export const isOpenRecord = (status: RecordStatus): status is OpenRecordStatus =>
  (OPEN_RECORD_STATUSES as readonly string[]).includes(status);

/** A song past its Idea stage means the making has started. */
export const songStartsMaking = (stage: SongStage): boolean => stage !== 'idea';

export const MAX_RECORD_TITLE = 120;
export const MAX_IDEA = 2000;
export const MAX_SONG_TITLE = 120;
export const MAX_DATE_HINT = 40;
export const MAX_SESSION_NOTE = 500;
export const MAX_PERSON_NAME = 80;
export const MAX_PERSON_ROLE = 40;
export const MAX_SESSION_PEOPLE = 12;
export const DEFAULT_RECORD_TITLE = 'Untitled';

export type RecordSong = { id: string; title: string; stage: SongStage; position: number };

export type SessionPerson = { personId: string | null; name: string; role: string };

export type RecordSession = {
  id: string;
  date: string | null;
  dateHint: string;
  status: SessionStatus;
  note: string;
  people: SessionPerson[];
  songIds: string[];
};

export type NextRecord = {
  id: string;
  artistId: string;
  title: string;
  kind: RecordKind | null;
  idea: string;
  status: RecordStatus;
  releaseId: string | null;
  /** The colour the team picked, or null for the artist's own (recordCoverColor). */
  coverColor: string | null;
  /** A signed URL for the cover picture, or null. */
  coverUrl: string | null;
  createdAt: string;
  songs: RecordSong[];
  sessions: RecordSession[];
};

/** What the artist page's "In the making" row shows. */
export type RecordSummary = {
  id: string;
  title: string;
  kind: RecordKind | null;
  /** Resolved: the picked colour, else the artist's. */
  coverColor: string;
  coverUrl: string | null;
  /** Idea or Making: the artist page marks an idea. */
  status: RecordStatus;
  /** The rollout it points at once one is being planned from it, so the artist
   *  page shows the record once (lib/artist-page-data.ts). Absent on old copies. */
  releaseId?: string | null;
  songCount: number;
  doneCount: number;
  nextSession: { date: string | null; dateHint: string } | null;
};

type Parsed<T> = { error: string } | { value: T };

const asRecord = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

const has = (body: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(body, key);

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_SHAPE.test(value);

const isSongStage = (value: unknown): value is SongStage =>
  typeof value === 'string' && (SONG_STAGES as readonly string[]).includes(value);
const isSessionStatus = (value: unknown): value is SessionStatus =>
  typeof value === 'string' && (SESSION_STATUSES as readonly string[]).includes(value);
const isRecordKind = (value: unknown): value is RecordKind =>
  typeof value === 'string' && (RECORD_KINDS as readonly string[]).includes(value);

/** A real calendar day, so 2026-02-30 is refused rather than rolled over. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_SHAPE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const cleanLine = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

export type RecordPatch = Partial<{ title: string; kind: RecordKind | null; idea: string; status: 'making' | 'dropped' }>;

export type RecordCreate = { title: string; kind: RecordKind | null; idea: string; status: OpenRecordStatus };

/**
 * POST body: everything optional, so one tap can start an untitled record.
 * A project starts at Idea or Making; Making is the default so every caller
 * from before the Idea stage (2026-11-04) keeps its meaning.
 */
export function parseRecordCreate(body: unknown): Parsed<RecordCreate> {
  const input = asRecord(body);
  const title = cleanLine(input.title) || DEFAULT_RECORD_TITLE;
  if (title.length > MAX_RECORD_TITLE) return { error: `Keep the name under ${MAX_RECORD_TITLE} characters.` };
  if (input.kind !== undefined && input.kind !== null && !isRecordKind(input.kind)) return { error: 'Pick single, EP or album.' };
  const idea = typeof input.idea === 'string' ? input.idea.trim() : '';
  if (idea.length > MAX_IDEA) return { error: `Keep the idea under ${MAX_IDEA} characters.` };
  if (input.status !== undefined && input.status !== 'idea' && input.status !== 'making') {
    return { error: 'A project starts as an idea or in the making.' };
  }
  const status: OpenRecordStatus = input.status === 'idea' ? 'idea' : 'making';
  return { value: { title, kind: isRecordKind(input.kind) ? input.kind : null, idea, status } };
}

export function parseRecordPatch(body: unknown): Parsed<RecordPatch> {
  const input = asRecord(body);
  const patch: RecordPatch = {};
  if (has(input, 'title')) {
    const title = cleanLine(input.title);
    if (!title) return { error: 'Give the record a name.' };
    if (title.length > MAX_RECORD_TITLE) return { error: `Keep the name under ${MAX_RECORD_TITLE} characters.` };
    patch.title = title;
  }
  if (has(input, 'kind')) {
    if (input.kind !== null && !isRecordKind(input.kind)) return { error: 'Pick single, EP or album.' };
    patch.kind = input.kind as RecordKind | null;
  }
  if (has(input, 'idea')) {
    const idea = typeof input.idea === 'string' ? input.idea.trim() : '';
    if (idea.length > MAX_IDEA) return { error: `Keep the idea under ${MAX_IDEA} characters.` };
    patch.idea = idea;
  }
  if (has(input, 'status')) {
    // 'planned' is set only by planning the rollout (step 4), never by a PATCH.
    // 'idea' is only ever a starting stage: nothing moves a project back to it.
    if (input.status !== 'making' && input.status !== 'dropped') return { error: 'That status is not allowed here.' };
    patch.status = input.status;
  }
  if (Object.keys(patch).length === 0) return { error: 'Nothing to change.' };
  return { value: patch };
}

export function parseSongCreate(body: unknown): Parsed<{ title: string; stage: SongStage }> {
  const input = asRecord(body);
  const title = cleanLine(input.title);
  if (!title) return { error: 'Give the song a name.' };
  if (title.length > MAX_SONG_TITLE) return { error: `Keep the name under ${MAX_SONG_TITLE} characters.` };
  if (input.stage !== undefined && !isSongStage(input.stage)) return { error: 'Pick a stage.' };
  return { value: { title, stage: isSongStage(input.stage) ? input.stage : 'idea' } };
}

export function parseSongPatch(body: unknown): Parsed<Partial<{ title: string; stage: SongStage }>> {
  const input = asRecord(body);
  const patch: Partial<{ title: string; stage: SongStage }> = {};
  if (has(input, 'title')) {
    const title = cleanLine(input.title);
    if (!title) return { error: 'Give the song a name.' };
    if (title.length > MAX_SONG_TITLE) return { error: `Keep the name under ${MAX_SONG_TITLE} characters.` };
    patch.title = title;
  }
  if (has(input, 'stage')) {
    if (!isSongStage(input.stage)) return { error: 'Pick a stage.' };
    patch.stage = input.stage;
  }
  if (Object.keys(patch).length === 0) return { error: 'Nothing to change.' };
  return { value: patch };
}

export type SessionPersonInput = { personId: string | null; name: string; role: string };

export type SessionInput = {
  date: string | null;
  dateHint: string;
  status: SessionStatus;
  note: string;
  people: SessionPersonInput[];
  songIds: string[];
};

/**
 * A whole session, create or replace. A session needs a day OR words for it
 * ("next week"); a real date clears the words, so they never disagree.
 */
export function parseSessionInput(body: unknown): Parsed<SessionInput> {
  const input = asRecord(body);
  let date: string | null = null;
  if (input.date !== undefined && input.date !== null && input.date !== '') {
    if (!isCalendarDate(input.date)) return { error: 'Pick a real day.' };
    date = input.date;
  }
  const dateHint = date ? '' : cleanLine(input.dateHint);
  if (dateHint.length > MAX_DATE_HINT) return { error: `Keep "when" under ${MAX_DATE_HINT} characters.` };
  if (!date && !dateHint) return { error: 'Say when, even roughly: a day, or words like "next week".' };

  if (input.status !== undefined && !isSessionStatus(input.status)) return { error: 'Pick what happened.' };
  const status = isSessionStatus(input.status) ? input.status : 'planned';

  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > MAX_SESSION_NOTE) return { error: `Keep the note under ${MAX_SESSION_NOTE} characters.` };

  const rawPeople = Array.isArray(input.people) ? input.people : [];
  if (rawPeople.length > MAX_SESSION_PEOPLE) return { error: `A session can have up to ${MAX_SESSION_PEOPLE} people.` };
  const people: SessionPersonInput[] = [];
  const seen = new Set<string>();
  for (const raw of rawPeople) {
    const person = asRecord(raw);
    const name = cleanLine(person.name);
    if (!name) return { error: 'Every person needs a name.' };
    if (name.length > MAX_PERSON_NAME) return { error: `Keep names under ${MAX_PERSON_NAME} characters.` };
    const role = cleanLine(person.role);
    if (role.length > MAX_PERSON_ROLE) return { error: `Keep roles under ${MAX_PERSON_ROLE} characters.` };
    const personId = isUuid(person.personId) ? person.personId : null;
    const key = personId ?? `${name.toLowerCase()}|${role.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    people.push({ personId, name, role });
  }

  const rawSongs = Array.isArray(input.songIds) ? input.songIds : [];
  if (!rawSongs.every(isUuid)) return { error: 'One of those songs is not on this record.' };
  const songIds = [...new Set(rawSongs as string[])];

  return { value: { date, dateHint, status, note, people, songIds } };
}

/** "1 of 4 done" and the next planned session, for the artist page row. */
export function summarizeRecord(
  record: Pick<NextRecord, 'id' | 'artistId' | 'title' | 'kind' | 'coverColor' | 'coverUrl' | 'status' | 'songs' | 'sessions'> & { releaseId?: string | null },
  today: string
): RecordSummary {
  const doneCount = record.songs.filter((song) => song.stage === 'done').length;
  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    coverColor: recordCoverColor(record),
    coverUrl: record.coverUrl,
    status: record.status,
    releaseId: record.releaseId ?? null,
    songCount: record.songs.length,
    doneCount,
    nextSession: (() => {
      const next = pickNextSession(record.sessions, today);
      return next ? { date: next.date, dateHint: next.date ? '' : next.dateHint } : null;
    })(),
  };
}

/**
 * The session to show as "Next": the earliest planned one dated today or
 * later, else a planned one with only words ("next week"). A dated session
 * that has passed without an answer is not "next"; it waits for a check-in.
 */
export function pickNextSession<T extends Pick<RecordSession, 'date' | 'dateHint' | 'status'>>(
  sessions: readonly T[],
  today: string
): T | null {
  const planned = sessions.filter((session) => session.status === 'planned');
  const dated = planned
    .filter((session) => session.date !== null && session.date >= today)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
  return dated[0] ?? planned.find((session) => session.date === null) ?? null;
}

/** Sessions newest-relevant first: upcoming by date, then undated, then past (latest first). */
export function orderSessions<T extends Pick<RecordSession, 'date' | 'status'>>(sessions: readonly T[], today: string): T[] {
  const upcoming = sessions
    .filter((s) => s.date !== null && s.date >= today)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
  const undated = sessions.filter((s) => s.date === null);
  const past = sessions
    .filter((s) => s.date !== null && s.date < today)
    .sort((a, b) => (b.date as string).localeCompare(a.date as string));
  return [...upcoming, ...undated, ...past];
}

export function isRecordDone(record: Pick<NextRecord, 'songs'>): boolean {
  return record.songs.length > 0 && record.songs.every((song) => song.stage === 'done');
}

export const recordKindLabel = (kind: RecordKind | null): string =>
  kind === 'ep' ? 'EP' : kind === 'album' ? 'Album' : kind === 'single' ? 'Single' : 'Record';

/** "Fri 31 Oct" for a calendar day, read as a plain day (no time zone shift). */
export function formatSessionDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function sessionWhen(session: Pick<RecordSession, 'date' | 'dateHint'>): string {
  return session.date ? formatSessionDay(session.date) : session.dateHint;
}

/** Today as YYYY-MM-DD in Lagos (UTC+1, no daylight saving). */
export function lagosToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

// The cover (v2, 2026-10-27). Until there is art the cover is a flat colour
// (no gradients: the no-gradient-placeholders rule). Each artist gets one from
// this palette, so a new record needs nothing typed; the team can pick another
// from the same set.

export const RECORD_COVER_COLORS = [
  '#3b2a52',
  '#24453a',
  '#4a2f2a',
  '#253a52',
  '#4d3f1f',
  '#3f2440',
  '#1f4248',
  '#43302a',
] as const;

/** The artist's own colour: the same every time for the same artist. */
export function artistCoverColor(artistId: string): string {
  let hash = 0;
  for (let i = 0; i < artistId.length; i += 1) hash = (hash * 31 + artistId.charCodeAt(i)) >>> 0;
  return RECORD_COVER_COLORS[hash % RECORD_COVER_COLORS.length];
}

export function recordCoverColor(record: Pick<NextRecord, 'artistId' | 'coverColor'>): string {
  return record.coverColor ?? artistCoverColor(record.artistId);
}

/** A colour from the palette, or null to go back to the artist's. */
export function parseCoverColor(value: unknown): Parsed<string | null> {
  if (value === null) return { value: null };
  const colour = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!(RECORD_COVER_COLORS as readonly string[]).includes(colour)) return { error: 'Pick one of the colours.' };
  return { value: colour };
}

export const recordCoverPathPrefix = (recordId: string): string => `record/${recordId}/cover/`;
