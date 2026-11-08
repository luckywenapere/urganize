import { describe, expect, it } from 'vitest';

import {
  EDITORIAL_EMPTY_COPY,
  editorialRow,
  editorialStateCopy,
  sortEditorialRows,
  type EditorialRowInput,
} from '@/lib/editorial-overview';
import { EMPTY_PITCH_FIELDS } from '@/lib/editorial-pitch';

const NOW = new Date('2026-10-10T10:00:00Z');
const FULL = { genre: 'Afrobeats', moods: 'warm', instruments: 'guitar', description: 'A song.' };

function input(over: Partial<EditorialRowInput> = {}): EditorialRowInput {
  return {
    releaseId: 'r1',
    releaseTitle: 'Midnight',
    releaseDate: '2026-12-10',
    taskId: 't1',
    taskStatus: 'todo',
    skippedAt: null,
    fields: { ...EMPTY_PITCH_FIELDS },
    ...over,
  };
}

describe('editorialRow', () => {
  it('needs writing while the window is open and fields are empty', () => {
    const row = editorialRow(input(), NOW);
    expect(row.state).toBe('to_write');
    expect(row.daysLeft).toBe(54);
  });
  it('is ready once every field is filled', () => {
    expect(editorialRow(input({ fields: FULL }), NOW).state).toBe('ready');
  });
  it('skipped and done win over the window', () => {
    expect(editorialRow(input({ skippedAt: 'x', releaseDate: '2026-10-12' }), NOW).state).toBe('skipped');
    expect(editorialRow(input({ taskStatus: 'done', releaseDate: '2026-10-12' }), NOW).state).toBe('sent');
  });
  it('closes inside 7 days, is past after release day, and needs a date', () => {
    expect(editorialRow(input({ releaseDate: '2026-10-15' }), NOW).state).toBe('closed');
    expect(editorialRow(input({ releaseDate: '2026-10-01' }), NOW).state).toBe('past');
    expect(editorialRow(input({ releaseDate: null }), NOW).state).toBe('no_date');
  });
  it('has no days left once the window is not open', () => {
    expect(editorialRow(input({ releaseDate: '2026-10-15' }), NOW).daysLeft).toBeNull();
  });
});

describe('sortEditorialRows', () => {
  it('puts work first, soonest window first, settled last', () => {
    const rows = [
      editorialRow(input({ releaseId: 'a', taskId: 'a', taskStatus: 'done' }), NOW),
      editorialRow(input({ releaseId: 'b', taskId: 'b', releaseDate: '2026-12-30' }), NOW),
      editorialRow(input({ releaseId: 'c', taskId: 'c', releaseDate: '2026-11-20' }), NOW),
    ];
    expect(sortEditorialRows(rows).map((row) => row.taskId)).toEqual(['c', 'b', 'a']);
  });
});

describe('copy', () => {
  it('counts down to the day the window closes', () => {
    expect(editorialStateCopy(editorialRow(input({ releaseDate: '2026-10-18' }), NOW))).toBe('Needs writing. 1 day left.');
    expect(editorialStateCopy(editorialRow(input({ releaseDate: '2026-10-19' }), NOW))).toBe('Needs writing. 2 days left.');
  });
  it('keeps the empty line short and plain', () => {
    expect(EDITORIAL_EMPTY_COPY).not.toMatch(/—|ship/i);
  });
});
