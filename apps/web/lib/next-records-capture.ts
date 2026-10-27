// One line in, filed (step 2 of the next record, 2026-10-27, mock screen 4).
// A manager tells UrgAns "session with tolu friday, doing wahala free and the
// new one". The model turns that into add_to_record's arguments; this module
// (pure, no IO) turns those into a plan and the card that shows it. Nothing is
// saved until the card is approved; the writes are in
// lib/chappi/tool-families/records.ts, through lib/next-records-server.ts.
//
// Two rules live here and nowhere else:
// - A date is never invented. Only words that name one day plainly become a
//   day ("friday", "tomorrow", "31 oct"); everything else ("next week", "next
//   friday", "end of the month") stays words in date_hint.
// - People match the team's own contacts first. One clear match links to it;
//   two or more is a question back to the manager; none is a new contact,
//   which Relationships' own find-or-add then files.

import {
  MAX_DATE_HINT,
  MAX_PERSON_NAME,
  MAX_PERSON_ROLE,
  MAX_SESSION_NOTE,
  MAX_SESSION_PEOPLE,
  MAX_SONG_TITLE,
  SONG_STAGES,
  SONG_STAGE_LABELS,
  formatSessionDay,
  isCalendarDate,
  type RecordSong,
  type SongStage,
} from '@/lib/next-records';

export const MAX_CAPTURE_SESSIONS = 6;
export const MAX_CAPTURE_SONGS = 20;

export type CaptureSessionArg = {
  when: string;
  people: { name: string; role: string }[];
  /** Song titles; '' is a song with no name yet ("the new one"). */
  songs: string[];
  note: string;
  happened: boolean;
};

export type CaptureArgs = {
  sessions: CaptureSessionArg[];
  /** Songs to add or move, outside any session ("pressure is mixed"). */
  songs: { title: string; stage: SongStage | null }[];
};

type Parsed<T> = { error: string } | { value: T };

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const line = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const isStage = (value: unknown): value is SongStage =>
  typeof value === 'string' && (SONG_STAGES as readonly string[]).includes(value);

/** The model's arguments, checked. Errors are written for the model to fix or ask about. */
export function parseCaptureArgs(args: Record<string, unknown>): Parsed<CaptureArgs> {
  const rawSessions = Array.isArray(args.sessions) ? args.sessions : [];
  const rawSongs = Array.isArray(args.songs) ? args.songs : [];
  if (rawSessions.length > MAX_CAPTURE_SESSIONS) return { error: `Up to ${MAX_CAPTURE_SESSIONS} sessions at a time.` };

  const sessions: CaptureSessionArg[] = [];
  for (const raw of rawSessions) {
    const input = asObject(raw);
    const when = line(input.when);
    if (!when) return { error: 'A session needs a when, even roughly. Ask the user when it is.' };
    const people: CaptureSessionArg['people'] = [];
    for (const person of Array.isArray(input.people) ? input.people : []) {
      const name = line(asObject(person).name).slice(0, MAX_PERSON_NAME);
      if (!name) continue;
      people.push({ name, role: line(asObject(person).role).slice(0, MAX_PERSON_ROLE) });
    }
    if (people.length > MAX_SESSION_PEOPLE) return { error: `A session can have up to ${MAX_SESSION_PEOPLE} people.` };
    const songs = (Array.isArray(input.songs) ? input.songs : []).map(line);
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, MAX_SESSION_NOTE) : '';
    sessions.push({ when, people, songs, note, happened: input.happened === true });
  }

  const songs: CaptureArgs['songs'] = [];
  for (const raw of rawSongs) {
    const input = asObject(raw);
    const title = line(input.title);
    if (!title) continue;
    if (input.stage !== undefined && input.stage !== null && !isStage(input.stage)) {
      return { error: `Song stages are ${SONG_STAGES.join(', ')}.` };
    }
    songs.push({ title, stage: isStage(input.stage) ? input.stage : null });
  }

  const songCount = sessions.reduce((sum, s) => sum + s.songs.length, 0) + songs.length;
  if (songCount > MAX_CAPTURE_SONGS) return { error: `Up to ${MAX_CAPTURE_SONGS} songs at a time.` };
  if (sessions.length === 0 && songs.length === 0) return { error: 'Nothing to add. Pass a session or a song.' };
  return { value: { sessions, songs } };
}

// ── when ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const WEEKDAY_EXTRA: Record<string, number> = { tues: 2, weds: 3, thur: 4, thurs: 4 };
const weekdayIndex = (word: string): number =>
  WEEKDAY_EXTRA[word] ?? WEEKDAYS.findIndex((day) => word === day || word === day.slice(0, 3));

const monthIndex = (word: string): number =>
  word === 'sept' ? 8 : MONTHS.findIndex((month) => word === month || word === month.slice(0, 3));

/** "31 oct", "31st of october", "oct 31", optional year. Null when it is not that shape. */
function monthDay(words: string, today: string): string | null {
  const dayFirst = words.match(/^(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]+)(?: (\d{4}))?$/);
  const monthFirst = words.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/);
  const parts = dayFirst
    ? { day: dayFirst[1], month: dayFirst[2], year: dayFirst[3] }
    : monthFirst
      ? { day: monthFirst[2], month: monthFirst[1], year: monthFirst[3] }
      : null;
  if (!parts) return null;
  const month = monthIndex(parts.month);
  if (month < 0) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const build = (year: number) => `${year}-${pad(month + 1)}-${pad(Number(parts.day))}`;
  const thisYear = Number(today.slice(0, 4));
  if (parts.year) {
    const date = build(Number(parts.year));
    return isCalendarDate(date) ? date : null;
  }
  // No year: this year, unless that is long gone (then next year's).
  let date = build(thisYear);
  if (isCalendarDate(date) && date < addDays(today, -180)) date = build(thisYear + 1);
  return isCalendarDate(date) ? date : null;
}

/**
 * When a session is, from the user's own words, with today in Lagos. A day
 * only when the words name one plainly; otherwise the words are kept. "friday"
 * said on a Friday stays words: it could be today or next week.
 */
export function resolveWhen(words: string, today: string): { date: string | null; dateHint: string } {
  const keep = { date: null, dateHint: words.replace(/\s+/g, ' ').trim().slice(0, MAX_DATE_HINT) };
  const clean = words
    .toLowerCase()
    .replace(/[.,!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(on|this) /, '');
  if (isCalendarDate(clean)) return { date: clean, dateHint: '' };
  if (clean === 'today' || clean === 'tonight' || clean === 'this evening') return { date: today, dateHint: '' };
  if (clean === 'tomorrow' || clean === 'tmrw' || clean === 'tmr') return { date: addDays(today, 1), dateHint: '' };
  if (clean === 'yesterday') return { date: addDays(today, -1), dateHint: '' };

  const weekday = weekdayIndex(clean);
  if (weekday >= 0) {
    const todayIndex = new Date(`${today}T00:00:00Z`).getUTCDay();
    const ahead = (weekday - todayIndex + 7) % 7;
    return ahead === 0 ? keep : { date: addDays(today, ahead), dateHint: '' };
  }

  const dated = monthDay(clean, today);
  if (dated) return { date: dated, dateHint: '' };
  return keep;
}

// ── people ────────────────────────────────────────────────────────────────

export type TeamContact = { personId: string; label: string; role: string };

const fold = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The team's contact this name means. Whole name first ("Tolu Bello"); a
 * single word also matches a contact's first name ("tolu"). A role, when
 * given, narrows a tie.
 */
export function matchContact(
  person: { name: string; role: string },
  contacts: readonly TeamContact[]
): { kind: 'one'; contact: TeamContact } | { kind: 'none' } | { kind: 'many'; contacts: TeamContact[] } {
  const name = fold(person.name);
  if (!name) return { kind: 'none' };
  let found = contacts.filter((c) => fold(c.label) === name);
  if (found.length === 0 && !name.includes(' ')) found = contacts.filter((c) => fold(c.label).split(' ')[0] === name);
  if (found.length > 1 && person.role) {
    const byRole = found.filter((c) => fold(c.role) === fold(person.role));
    if (byRole.length > 0) found = byRole;
  }
  if (found.length === 0) return { kind: 'none' };
  if (found.length === 1) return { kind: 'one', contact: found[0] };
  return { kind: 'many', contacts: found };
}

// ── songs ─────────────────────────────────────────────────────────────────

/** "wahala free" reads as "Wahala Free"; anything typed with capitals is kept. */
export function songTitleFromWords(words: string): string {
  const title = words.replace(/\s+/g, ' ').trim().slice(0, MAX_SONG_TITLE);
  if (title !== title.toLowerCase()) return title;
  return title.replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toUpperCase());
}

export function matchSong(title: string, songs: readonly RecordSong[]): RecordSong | null {
  const wanted = fold(title);
  if (!wanted) return null;
  return songs.find((song) => fold(song.title) === wanted) ?? null;
}

// ── the plan ──────────────────────────────────────────────────────────────

/** A song in the plan: one already on the record, or one the Add creates. */
export type PlannedSong = { key: string; title: string; songId: string | null };

export type PlannedPerson = { personId: string | null; name: string; role: string; isNew: boolean };

export type CapturePlan = {
  /** Songs the Add creates, all at Idea. */
  newSongs: PlannedSong[];
  stageChanges: { song: PlannedSong; from: SongStage | null; to: SongStage }[];
  sessions: {
    date: string | null;
    dateHint: string;
    happened: boolean;
    note: string;
    people: PlannedPerson[];
    songs: PlannedSong[];
  }[];
};

/**
 * Turns checked arguments into what the Add will do. `contacts` is null when
 * typed names cannot become contacts (Relationships off, or a teammate scoped
 * to one artist): names then stay plain names.
 */
export function planCapture(
  record: { songs: readonly RecordSong[] },
  args: CaptureArgs,
  contacts: readonly TeamContact[] | null,
  today: string
): { ok: true; plan: CapturePlan } | { ok: false; error: string } {
  const newSongs: PlannedSong[] = [];
  let untitled = 0;

  const songFor = (words: string): PlannedSong => {
    if (!words) {
      untitled += 1;
      const song = { key: `new:untitled:${untitled}`, title: `Untitled ${record.songs.length + newSongs.length + 1}`, songId: null };
      newSongs.push(song);
      return song;
    }
    const existing = matchSong(words, record.songs);
    if (existing) return { key: existing.id, title: existing.title, songId: existing.id };
    const already = newSongs.find((song) => song.key === `new:${fold(words)}`);
    if (already) return already;
    const song = { key: `new:${fold(words)}`, title: songTitleFromWords(words), songId: null };
    newSongs.push(song);
    return song;
  };

  const sessions: CapturePlan['sessions'] = [];
  for (const session of args.sessions) {
    const people: PlannedPerson[] = [];
    for (const person of session.people) {
      if (!contacts) {
        people.push({ personId: null, name: person.name, role: person.role, isNew: false });
        continue;
      }
      const match = matchContact(person, contacts);
      if (match.kind === 'many') {
        const names = match.contacts.map((c) => (c.role ? `${c.label} (${c.role})` : c.label)).join(', ');
        return { ok: false, error: `"${person.name}" could be ${names}. Ask the user which one.` };
      }
      if (match.kind === 'one') {
        people.push({
          personId: match.contact.personId,
          name: match.contact.label,
          role: person.role || match.contact.role,
          isNew: false,
        });
      } else {
        people.push({ personId: null, name: songTitleFromWords(person.name), role: person.role, isNew: true });
      }
    }
    const songs: PlannedSong[] = [];
    for (const words of session.songs) {
      const song = songFor(words);
      if (!songs.some((s) => s.key === song.key)) songs.push(song);
    }
    sessions.push({ ...resolveWhen(session.when, today), happened: session.happened, note: session.note, people, songs });
  }

  const stageChanges: CapturePlan['stageChanges'] = [];
  for (const entry of args.songs) {
    const song = songFor(entry.title);
    if (!entry.stage || song.songId === null) continue; // a new song starts at Idea, whatever was said
    const current = record.songs.find((s) => s.id === song.songId)?.stage ?? null;
    if (current === entry.stage) continue;
    stageChanges.push({ song, from: current, to: entry.stage });
  }

  return { ok: true, plan: { newSongs, stageChanges, sessions } };
}

export function isEmptyPlan(plan: CapturePlan): boolean {
  return plan.newSongs.length === 0 && plan.stageChanges.length === 0 && plan.sessions.length === 0;
}

const capitalise = (words: string) => (words ? words[0].toUpperCase() + words.slice(1) : words);

export function describeWhen(session: { date: string | null; dateHint: string }): string {
  return session.date ? formatSessionDay(session.date) : capitalise(session.dateHint);
}

const personLabel = (person: PlannedPerson) => (person.isNew ? `${person.name} (new contact)` : person.name);

/** The card, one line per add, like mock screen 4. */
export function describeCaptureCard(
  plan: CapturePlan,
  target: { recordTitle: string; artistName: string; isNewRecord: boolean }
): { title: string; detail: string; confirmLabel: string; cancelLabel: string } {
  const lines: string[] = [];
  if (target.isNewRecord) lines.push(`New record: ${target.recordTitle}`);
  for (const session of plan.sessions) {
    const who = session.people.map(personLabel).join(', ');
    const status = session.happened ? ' (happened)' : '';
    lines.push(`Session: ${describeWhen(session)}${who ? ` · ${who}` : ''}${status}`);
    if (session.songs.length) lines.push(`Songs in it: ${session.songs.map((s) => s.title).join(', ')}`);
  }
  for (const change of plan.stageChanges) {
    lines.push(`${change.song.title}: ${change.from ? `${SONG_STAGE_LABELS[change.from]} to ` : ''}${SONG_STAGE_LABELS[change.to]}`);
  }
  if (plan.newSongs.length) {
    const titles = plan.newSongs.map((s) => s.title).join(', ');
    lines.push(`New ${plan.newSongs.length === 1 ? 'song' : 'songs'} at Idea: ${titles}`);
  }
  return {
    title: `Here's what I'll add to ${target.recordTitle} (${target.artistName}):`,
    detail: lines.join('\n'),
    confirmLabel: 'Add',
    cancelLabel: 'Fix something',
  };
}
