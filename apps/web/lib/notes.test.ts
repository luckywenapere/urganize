import { describe, expect, it } from 'vitest';
import {
  NOTE_PREVIEW_MAX,
  NOTE_TITLE_MAX,
  deriveNotePreview,
  deriveNoteTitle,
  sortNotes,
} from './notes';
import type { Note } from '@/types/notes';

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
  releaseId: null,
  body: '',
  pinned: false,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  ...overrides,
});

describe('deriveNoteTitle', () => {
  it('returns the first line', () => {
    expect(deriveNoteTitle('Call the promoter\nabout the listening party')).toBe(
      'Call the promoter'
    );
  });

  it('returns empty string for a blank body', () => {
    expect(deriveNoteTitle('')).toBe('');
  });

  it('returns empty string for a whitespace-only body', () => {
    expect(deriveNoteTitle('   \n\t\n  ')).toBe('');
  });

  it('skips leading blank lines', () => {
    expect(deriveNoteTitle('\n\n   \nMaster due Friday')).toBe('Master due Friday');
  });

  it('trims surrounding whitespace on the title line', () => {
    expect(deriveNoteTitle('   Artwork feedback   \nrest')).toBe('Artwork feedback');
  });

  it('caps a long first line', () => {
    const long = 'x'.repeat(200);
    expect(deriveNoteTitle(long)).toHaveLength(NOTE_TITLE_MAX);
  });

  it('handles a single-line body', () => {
    expect(deriveNoteTitle('Just one thought')).toBe('Just one thought');
  });
});

describe('deriveNotePreview', () => {
  it('returns the text after the title line', () => {
    expect(deriveNotePreview('Title here\nSecond line')).toBe('Second line');
  });

  it('returns empty string for a single-line body', () => {
    expect(deriveNotePreview('Only a title')).toBe('');
  });

  it('returns empty string for a blank body', () => {
    expect(deriveNotePreview('')).toBe('');
  });

  it('returns empty string for a whitespace-only body', () => {
    expect(deriveNotePreview('  \n  \n ')).toBe('');
  });

  it('collapses newlines and runs of whitespace onto one line', () => {
    expect(deriveNotePreview('Title\nfirst\n\n   second\t\tthird')).toBe('first second third');
  });

  it('measures from the title line, not the top of the body', () => {
    expect(deriveNotePreview('\n\nTitle\nbody text')).toBe('body text');
  });

  it('caps a long preview', () => {
    expect(deriveNotePreview(`Title\n${'y'.repeat(500)}`)).toHaveLength(NOTE_PREVIEW_MAX);
  });
});

describe('sortNotes', () => {
  it('floats pinned notes above unpinned ones', () => {
    const notes = [
      makeNote({ id: 'a', updatedAt: '2026-08-05T10:00:00.000Z' }),
      makeNote({ id: 'b', pinned: true, updatedAt: '2026-08-01T10:00:00.000Z' }),
    ];
    expect(sortNotes(notes).map((note) => note.id)).toEqual(['b', 'a']);
  });

  it('orders by most recently updated within each group', () => {
    const notes = [
      makeNote({ id: 'old', updatedAt: '2026-08-01T10:00:00.000Z' }),
      makeNote({ id: 'new', updatedAt: '2026-08-07T10:00:00.000Z' }),
      makeNote({ id: 'mid', updatedAt: '2026-08-04T10:00:00.000Z' }),
    ];
    expect(sortNotes(notes).map((note) => note.id)).toEqual(['new', 'mid', 'old']);
  });

  it('orders pinned notes among themselves by recency', () => {
    const notes = [
      makeNote({ id: 'pin-old', pinned: true, updatedAt: '2026-08-02T10:00:00.000Z' }),
      makeNote({ id: 'plain', updatedAt: '2026-08-09T10:00:00.000Z' }),
      makeNote({ id: 'pin-new', pinned: true, updatedAt: '2026-08-06T10:00:00.000Z' }),
    ];
    expect(sortNotes(notes).map((note) => note.id)).toEqual(['pin-new', 'pin-old', 'plain']);
  });

  it('does not mutate the input array', () => {
    const notes = [
      makeNote({ id: 'a', updatedAt: '2026-08-01T10:00:00.000Z' }),
      makeNote({ id: 'b', updatedAt: '2026-08-05T10:00:00.000Z' }),
    ];
    sortNotes(notes);
    expect(notes.map((note) => note.id)).toEqual(['a', 'b']);
  });

  it('handles an empty list', () => {
    expect(sortNotes([])).toEqual([]);
  });
});
