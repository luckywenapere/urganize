import { describe, expect, it } from 'vitest';
import {
  describeCaptureCard,
  matchContact,
  parseCaptureArgs,
  planCapture,
  resolveWhen,
  songTitleFromWords,
  type CaptureArgs,
  type TeamContact,
} from './next-records-capture';
import type { RecordSong } from './next-records';

// Tuesday 27 Oct 2026 in Lagos.
const TODAY = '2026-10-27';

const song = (over: Partial<RecordSong> & { id: string; title: string }): RecordSong => ({
  stage: 'recording',
  position: 0,
  ...over,
});

const record = {
  songs: [
    song({ id: 's1', title: 'Wahala Free', stage: 'recording' }),
    song({ id: 's2', title: 'Pressure', stage: 'recording' }),
    song({ id: 's3', title: 'Ojuju', stage: 'idea' }),
  ],
};

const contacts: TeamContact[] = [
  { personId: 'p-tolu', label: 'Tolu Bello', role: 'Producer' },
  { personId: 'p-ada', label: 'Ada', role: 'Engineer' },
];

const parsed = (args: Record<string, unknown>): CaptureArgs => {
  const result = parseCaptureArgs(args);
  if ('error' in result) throw new Error(result.error);
  return result.value;
};

describe('resolveWhen never invents a date', () => {
  it('keeps "next week" as words', () => {
    expect(resolveWhen('next week', TODAY)).toEqual({ date: null, dateHint: 'next week' });
  });

  it('keeps "next friday" as words (could mean two different days)', () => {
    expect(resolveWhen('next friday', TODAY)).toEqual({ date: null, dateHint: 'next friday' });
  });

  it('resolves a plain weekday to the coming one', () => {
    expect(resolveWhen('friday', TODAY)).toEqual({ date: '2026-10-30', dateHint: '' });
    expect(resolveWhen('on Fri', TODAY).date).toBe('2026-10-30');
    expect(resolveWhen('this thurs', TODAY).date).toBe('2026-10-29');
  });

  it('keeps the weekday of today as words', () => {
    // 27 Oct 2026 is a Tuesday.
    expect(resolveWhen('tuesday', TODAY)).toEqual({ date: null, dateHint: 'tuesday' });
    expect(resolveWhen('monday', TODAY).date).toBe('2026-11-02');
  });

  it('reads today, tomorrow and yesterday', () => {
    expect(resolveWhen('today', TODAY).date).toBe(TODAY);
    expect(resolveWhen('Tomorrow', TODAY).date).toBe('2026-10-28');
    expect(resolveWhen('yesterday', TODAY).date).toBe('2026-10-26');
  });

  it('reads a day and month, in either order', () => {
    expect(resolveWhen('31 oct', TODAY).date).toBe('2026-10-31');
    expect(resolveWhen('3rd of November', TODAY).date).toBe('2026-11-03');
    expect(resolveWhen('nov 3', TODAY).date).toBe('2026-11-03');
    expect(resolveWhen('2 jan', TODAY).date).toBe('2027-01-02');
  });

  it('refuses a day that does not exist', () => {
    expect(resolveWhen('31 nov', TODAY)).toEqual({ date: null, dateHint: '31 nov' });
  });

  it('keeps anything vague as words, cut to the column size', () => {
    expect(resolveWhen('end of the month', TODAY).date).toBeNull();
    expect(resolveWhen('x'.repeat(60), TODAY).dateHint).toHaveLength(40);
  });
});

describe('matchContact', () => {
  it('matches a first name to one team contact', () => {
    expect(matchContact({ name: 'tolu', role: '' }, contacts)).toEqual({ kind: 'one', contact: contacts[0] });
  });

  it('asks when two contacts share the name', () => {
    const two = [...contacts, { personId: 'p-tolu2', label: 'Tolu Ade', role: 'Songwriter' }];
    expect(matchContact({ name: 'Tolu', role: '' }, two).kind).toBe('many');
    expect(matchContact({ name: 'Tolu', role: 'songwriter' }, two)).toEqual({ kind: 'one', contact: two[2] });
  });

  it('finds nobody for a new name', () => {
    expect(matchContact({ name: 'Dami', role: '' }, contacts)).toEqual({ kind: 'none' });
  });
});

describe('songTitleFromWords', () => {
  it('title-cases words typed in lower case and keeps typed capitals', () => {
    expect(songTitleFromWords('wahala free')).toBe('Wahala Free');
    expect(songTitleFromWords('NNEKA reprise')).toBe('NNEKA reprise');
  });
});

describe('planCapture, the mock screen 4 message', () => {
  // "session with tolu friday, doing wahala free and the new one. dami doing
  // the final mix on pressure next week"
  const args = parsed({
    sessions: [
      { when: 'friday', people: [{ name: 'tolu' }], songs: ['wahala free', ''] },
      { when: 'next week', people: [{ name: 'dami', role: 'mix engineer' }], songs: ['pressure'] },
    ],
    songs: [{ title: 'pressure', stage: 'mixing' }],
  });

  const result = planCapture(record, args, contacts, TODAY);
  if (!result.ok) throw new Error(result.error);
  const { plan } = result;

  it('dates friday and keeps next week as words', () => {
    expect(plan.sessions.map((s) => [s.date, s.dateHint])).toEqual([
      ['2026-10-30', ''],
      [null, 'next week'],
    ]);
  });

  it('links Tolu to the team contact and files Dami as new', () => {
    expect(plan.sessions[0].people).toEqual([{ personId: 'p-tolu', name: 'Tolu Bello', role: 'Producer', isNew: false }]);
    expect(plan.sessions[1].people).toEqual([{ personId: null, name: 'Dami', role: 'mix engineer', isNew: true }]);
  });

  it('turns "the new one" into a new song at Idea, numbered after the record', () => {
    expect(plan.newSongs).toEqual([{ key: 'new:untitled:1', title: 'Untitled 4', songId: null }]);
    expect(plan.sessions[0].songs.map((s) => s.title)).toEqual(['Wahala Free', 'Untitled 4']);
  });

  it('moves Pressure to Mixing', () => {
    expect(plan.stageChanges).toEqual([
      { song: { key: 's2', title: 'Pressure', songId: 's2' }, from: 'recording', to: 'mixing' },
    ]);
  });

  it('writes the card one add per line, and the button says Add', () => {
    const card = describeCaptureCard(plan, { recordTitle: 'Untitled EP', artistName: 'Kemi Ade', isNewRecord: false });
    expect(card.confirmLabel).toBe('Add');
    expect(card.title).toBe("Here's what I'll add to Untitled EP (Kemi Ade):");
    expect(card.detail.split('\n')).toEqual([
      'Session: Fri 30 Oct · Tolu Bello',
      'Songs in it: Wahala Free, Untitled 4',
      'Session: Next week · Dami (new contact)',
      'Songs in it: Pressure',
      'Pressure: Recording to Mixing',
      'New song at Idea: Untitled 4',
    ]);
    expect(card.detail).not.toMatch(/—/);
  });
});

describe('planCapture rules', () => {
  it('makes an unknown song a new song at Idea, even when a stage was said, and the card says so', () => {
    const result = planCapture(record, parsed({ songs: [{ title: 'gbese', stage: 'mixing' }] }), contacts, TODAY);
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.newSongs.map((s) => s.title)).toEqual(['Gbese']);
    expect(result.plan.stageChanges).toEqual([]);
    const card = describeCaptureCard(result.plan, { recordTitle: 'R', artistName: 'A', isNewRecord: false });
    expect(card.detail).toBe('New song at Idea: Gbese');
  });

  it('creates a song named twice only once', () => {
    const result = planCapture(
      record,
      parsed({ sessions: [{ when: 'today', songs: ['gbese'] }, { when: 'tomorrow', songs: ['Gbese'] }] }),
      contacts,
      TODAY
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.newSongs).toHaveLength(1);
  });

  it('skips a stage that is already right', () => {
    const result = planCapture(record, parsed({ songs: [{ title: 'Ojuju', stage: 'idea' }] }), contacts, TODAY);
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.stageChanges).toEqual([]);
    expect(result.plan.newSongs).toEqual([]);
  });

  it('sends an unclear person back as a question', () => {
    const two = [...contacts, { personId: 'p-tolu2', label: 'Tolu Ade', role: 'Songwriter' }];
    const result = planCapture(record, parsed({ sessions: [{ when: 'friday', people: [{ name: 'tolu' }] }] }), two, TODAY);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Ask the user which one') });
  });

  it('keeps names as plain names when contacts are not available', () => {
    const result = planCapture(record, parsed({ sessions: [{ when: 'friday', people: [{ name: 'tolu' }] }] }), null, TODAY);
    if (!result.ok) throw new Error(result.error);
    expect(result.plan.sessions[0].people).toEqual([{ personId: null, name: 'tolu', role: '', isNew: false }]);
  });

  it('names a new record on the card', () => {
    const result = planCapture({ songs: [] }, parsed({ songs: [{ title: 'first one' }] }), contacts, TODAY);
    if (!result.ok) throw new Error(result.error);
    const card = describeCaptureCard(result.plan, { recordTitle: 'Untitled', artistName: 'Kemi', isNewRecord: true });
    expect(card.detail.split('\n')[0]).toBe('New record: Untitled');
  });
});

describe('parseCaptureArgs', () => {
  it('needs a when for every session', () => {
    expect(parseCaptureArgs({ sessions: [{ people: [{ name: 'tolu' }] }] })).toEqual({
      error: expect.stringContaining('needs a when'),
    });
  });

  it('needs something to add', () => {
    expect(parseCaptureArgs({})).toEqual({ error: expect.stringContaining('Nothing to add') });
  });

  it('refuses a stage that does not exist', () => {
    expect(parseCaptureArgs({ songs: [{ title: 'x', stage: 'mastered' }] })).toEqual({
      error: expect.stringContaining('idea, recording, mixing, done'),
    });
  });
});
