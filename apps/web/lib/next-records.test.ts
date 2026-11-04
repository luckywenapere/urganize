import { describe, expect, it } from 'vitest';
import {
  formatSessionDay,
  isCalendarDate,
  isOpenRecord,
  isRecordDone,
  lagosToday,
  OPEN_RECORD_STATUSES,
  songStartsMaking,
  orderSessions,
  parseRecordCreate,
  parseRecordPatch,
  parseSessionInput,
  parseSongCreate,
  parseSongPatch,
  pickNextSession,
  summarizeRecord,
  type RecordSession,
  type RecordSong,
} from './next-records';

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

function song(over: Partial<RecordSong> = {}): RecordSong {
  return { id: ID, title: 'Pressure', stage: 'idea', position: 0, ...over };
}

function session(over: Partial<RecordSession> = {}): RecordSession {
  return { id: ID, date: null, dateHint: '', status: 'planned', note: '', people: [], songIds: [], ...over };
}

describe('parseRecordCreate', () => {
  it('starts an untitled record from an empty body', () => {
    expect(parseRecordCreate({})).toEqual({ value: { title: 'Untitled', kind: null, idea: '', status: 'making' } });
  });
  it('keeps a kind and an idea', () => {
    expect(parseRecordCreate({ title: ' New  EP ', kind: 'ep', idea: '4 songs' })).toEqual({
      value: { title: 'New EP', kind: 'ep', idea: '4 songs', status: 'making' },
    });
  });
  it('refuses an unknown kind', () => {
    expect(parseRecordCreate({ kind: 'mixtape' })).toHaveProperty('error');
  });
  it('can start a project at the Idea stage', () => {
    expect(parseRecordCreate({ status: 'idea' })).toMatchObject({ value: { status: 'idea' } });
  });
  it('a project can only start at Idea or Making, never planned or dropped', () => {
    expect(parseRecordCreate({ status: 'planned' })).toHaveProperty('error');
    expect(parseRecordCreate({ status: 'dropped' })).toHaveProperty('error');
  });
});

describe('project stages', () => {
  it('Idea and Making are the open stages', () => {
    expect([...OPEN_RECORD_STATUSES]).toEqual(['idea', 'making']);
    expect(isOpenRecord('idea')).toBe(true);
    expect(isOpenRecord('making')).toBe(true);
    expect(isOpenRecord('planned')).toBe(false);
    expect(isOpenRecord('dropped')).toBe(false);
  });
  it('a song past its Idea stage starts the making, a song still an idea does not', () => {
    expect(songStartsMaking('idea')).toBe(false);
    expect(songStartsMaking('recording')).toBe(true);
    expect(songStartsMaking('mixing')).toBe(true);
    expect(songStartsMaking('done')).toBe(true);
  });
});

describe('parseRecordPatch', () => {
  it('refuses an empty name', () => {
    expect(parseRecordPatch({ title: '  ' })).toHaveProperty('error');
  });
  it('never lets a PATCH mark a record planned', () => {
    expect(parseRecordPatch({ status: 'planned' })).toHaveProperty('error');
  });
  it('never moves a project back to Idea', () => {
    expect(parseRecordPatch({ status: 'idea' })).toHaveProperty('error');
  });
  it('Start making is a PATCH to making', () => {
    expect(parseRecordPatch({ status: 'making' })).toEqual({ value: { status: 'making' } });
  });
  it('can drop a record and clear its kind', () => {
    expect(parseRecordPatch({ status: 'dropped', kind: null })).toEqual({ value: { status: 'dropped', kind: null } });
  });
  it('refuses a body with nothing to change', () => {
    expect(parseRecordPatch({ other: 1 })).toHaveProperty('error');
  });
});

describe('songs', () => {
  it('a new song starts as an idea', () => {
    expect(parseSongCreate({ title: 'Wahala Free' })).toEqual({ value: { title: 'Wahala Free', stage: 'idea' } });
  });
  it('refuses a stage outside the four', () => {
    expect(parseSongPatch({ stage: 'mastering' })).toHaveProperty('error');
    expect(parseSongPatch({ stage: 'mixing' })).toEqual({ value: { stage: 'mixing' } });
  });
});

describe('parseSessionInput', () => {
  it('needs a day or words for one', () => {
    expect(parseSessionInput({})).toHaveProperty('error');
    expect(parseSessionInput({ dateHint: 'next week' })).toMatchObject({ value: { date: null, dateHint: 'next week' } });
  });
  it('a real day clears the words, so they never disagree', () => {
    expect(parseSessionInput({ date: '2026-10-31', dateHint: 'next week' })).toMatchObject({
      value: { date: '2026-10-31', dateHint: '' },
    });
  });
  it('refuses a day that does not exist', () => {
    expect(parseSessionInput({ date: '2026-02-30' })).toHaveProperty('error');
  });
  it('keeps one copy of the same person and drops a bad person id to a name', () => {
    const parsed = parseSessionInput({
      date: '2026-10-31',
      people: [
        { name: 'Tolu', role: 'Producer' },
        { name: ' tolu ', role: 'producer' },
        { personId: 'not-a-uuid', name: 'Dami', role: 'Engineer' },
      ],
    });
    expect(parsed).toMatchObject({
      value: {
        people: [
          { personId: null, name: 'Tolu', role: 'Producer' },
          { personId: null, name: 'Dami', role: 'Engineer' },
        ],
      },
    });
  });
  it('refuses a person with no name and song ids that are not ids', () => {
    expect(parseSessionInput({ date: '2026-10-31', people: [{ role: 'Producer' }] })).toHaveProperty('error');
    expect(parseSessionInput({ date: '2026-10-31', songIds: ['x'] })).toHaveProperty('error');
  });
  it('dedupes song ids', () => {
    expect(parseSessionInput({ date: '2026-10-31', songIds: [ID, ID, ID2] })).toMatchObject({
      value: { songIds: [ID, ID2] },
    });
  });
});

describe('pickNextSession', () => {
  const today = '2026-10-27';
  it('takes the earliest planned session from today on', () => {
    expect(
      pickNextSession(
        [session({ date: '2026-11-05' }), session({ date: '2026-10-31' }), session({ date: '2026-10-20' })],
        today
      )
    ).toMatchObject({ date: '2026-10-31' });
  });
  it('falls back to a vague one, and ignores sessions already answered', () => {
    expect(
      pickNextSession([session({ date: '2026-10-31', status: 'happened' }), session({ dateHint: 'next week' })], today)
    ).toMatchObject({ date: null, dateHint: 'next week' });
  });
  it('names exactly one session as next', () => {
    const sessions = [session({ id: 'vague', dateHint: 'next week' }), session({ id: 'sat', date: '2026-10-31' })];
    expect(pickNextSession(sessions, today)?.id).toBe('sat');
  });
  it('is null when nothing is planned', () => {
    expect(pickNextSession([session({ date: '2026-10-20' })], today)).toBeNull();
  });
});

describe('summaries', () => {
  it('counts done songs', () => {
    const summary = summarizeRecord(
      {
        id: ID,
        artistId: ID2,
        title: 'Untitled EP',
        kind: 'ep',
        coverColor: '#24453a',
        coverUrl: null,
        status: 'making',
        songs: [song({ stage: 'done' }), song(), song()],
        sessions: [],
      },
      '2026-10-27'
    );
    expect(summary).toMatchObject({ songCount: 3, doneCount: 1, nextSession: null, coverColor: '#24453a' });
  });
  it('carries the stage, so the artist page can mark an idea', () => {
    const summary = summarizeRecord(
      { id: ID, artistId: ID2, title: 'Untitled', kind: null, coverColor: null, coverUrl: null, status: 'idea', songs: [], sessions: [] },
      '2026-11-04'
    );
    expect(summary.status).toBe('idea');
  });
  it('a record is done only with songs, all done', () => {
    expect(isRecordDone({ songs: [] })).toBe(false);
    expect(isRecordDone({ songs: [song({ stage: 'done' }), song({ stage: 'mixing' })] })).toBe(false);
    expect(isRecordDone({ songs: [song({ stage: 'done' })] })).toBe(true);
  });
  it('orders sessions upcoming, then undated, then past newest first', () => {
    const ordered = orderSessions(
      [
        session({ id: 'past-old', date: '2026-10-01' }),
        session({ id: 'vague', date: null }),
        session({ id: 'soon', date: '2026-10-28' }),
        session({ id: 'past-new', date: '2026-10-20' }),
      ],
      '2026-10-27'
    );
    expect(ordered.map((s) => s.id)).toEqual(['soon', 'vague', 'past-new', 'past-old']);
  });
});

describe('dates', () => {
  it('reads a plain day without shifting it', () => {
    expect(formatSessionDay('2026-10-31')).toBe('Sat 31 Oct');
  });
  it('Lagos today rolls over at 23:00 UTC', () => {
    expect(lagosToday(new Date('2026-10-27T22:59:00Z'))).toBe('2026-10-27');
    expect(lagosToday(new Date('2026-10-27T23:00:00Z'))).toBe('2026-10-28');
  });
  it('isCalendarDate', () => {
    expect(isCalendarDate('2026-10-31')).toBe(true);
    expect(isCalendarDate('31/10/2026')).toBe(false);
  });
});
