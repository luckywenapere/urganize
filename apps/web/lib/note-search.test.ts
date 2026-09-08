import { describe, expect, it } from 'vitest';
import { deriveNoteSearchPreview, searchNotes } from './note-search';
import type { Note } from '@/types/notes';

function note(over: Partial<Note> & { id: string }): Note {
  return {
    body: '',
    releaseId: null,
    pinned: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as Note;
}

const ids = (notes: Note[]) => notes.map((n) => n.id);

describe('searchNotes', () => {
  it('returns the list UNCHANGED for an empty query — it filters a list already on screen', () => {
    const list = [note({ id: 'a', body: 'one' }), note({ id: 'b', body: 'two' })];
    expect(searchNotes(list, '')).toBe(list);
    expect(searchNotes(list, '   ')).toBe(list);
  });

  it('ranks a title that starts with the query above a title that merely contains it', () => {
    const list = [
      note({ id: 'contains', body: 'Ring the promoter back' }),
      note({ id: 'starts', body: 'Promoter wants the setlist' }),
    ];
    expect(ids(searchNotes(list, 'promoter'))).toEqual(['starts', 'contains']);
  });

  it('ranks a body-only match below every title match', () => {
    const list = [
      note({ id: 'body', body: 'Friday\nremember to call the promoter' }),
      note({ id: 'title', body: 'Promoter follow-up' }),
    ];
    expect(ids(searchNotes(list, 'promoter'))).toEqual(['title', 'body']);
  });

  it('matches terms in any order', () => {
    const list = [note({ id: 'a', body: 'Call the promoter about Friday' })];
    expect(ids(searchNotes(list, 'promoter call'))).toEqual(['a']);
  });

  it('excludes notes where only some terms match', () => {
    const list = [note({ id: 'a', body: 'Call the promoter' })];
    expect(searchNotes(list, 'promoter setlist')).toEqual([]);
  });

  it('is case insensitive', () => {
    const list = [note({ id: 'a', body: 'PROMOTER' })];
    expect(ids(searchNotes(list, 'promoter'))).toEqual(['a']);
  });

  it('treats regex metacharacters literally', () => {
    const list = [note({ id: 'dot', body: 'version 1.2 notes' }), note({ id: 'other', body: 'version 132' })];
    expect(ids(searchNotes(list, '1.2'))).toEqual(['dot']);
  });

  it('treats _ and % literally, never as wildcards', () => {
    // The credits route already shipped this bug once with ILIKE.
    const list = [note({ id: 'underscore', body: 'file_name draft' }), note({ id: 'other', body: 'fileXname draft' })];
    expect(ids(searchNotes(list, 'file_name'))).toEqual(['underscore']);

    const pct = [note({ id: 'pct', body: '50% split' }), note({ id: 'no', body: '5011 split' })];
    expect(ids(searchNotes(pct, '50%'))).toEqual(['pct']);
  });

  it('keeps the incoming order within a tier, so the store’s sort survives', () => {
    const list = [
      note({ id: 'first', body: 'Promoter one' }),
      note({ id: 'second', body: 'Promoter two' }),
    ];
    expect(ids(searchNotes(list, 'promoter'))).toEqual(['first', 'second']);
  });

  it('handles an empty body without matching everything', () => {
    const list = [note({ id: 'blank', body: '' }), note({ id: 'real', body: 'promoter' })];
    expect(ids(searchNotes(list, 'promoter'))).toEqual(['real']);
  });

  it('finds a term that appears only far into a long body', () => {
    const body = `${'padding '.repeat(2000)}artwork approved`;
    const list = [note({ id: 'deep', body })];
    expect(ids(searchNotes(list, 'artwork'))).toEqual(['deep']);
  });
});

describe('deriveNoteSearchPreview', () => {
  it('shows the region around a deep match rather than the first line', () => {
    const body = `Friday plan\n${'padding '.repeat(2000)}artwork approved by Tunde`;
    const preview = deriveNoteSearchPreview(body, ['artwork']);
    expect(preview).toContain('artwork approved by Tunde');
    expect(preview.startsWith('…')).toBe(true);
  });

  it('does not prefix an ellipsis when the match is already near the start', () => {
    const preview = deriveNoteSearchPreview('Artwork approved by Tunde', ['artwork']);
    expect(preview.startsWith('…')).toBe(false);
  });

  it('falls back to the ordinary preview when no term matches the body', () => {
    const body = 'Title line\nthe second line';
    expect(deriveNoteSearchPreview(body, ['nothing'])).toBe('the second line');
  });

  it('falls back to the ordinary preview when there are no terms', () => {
    const body = 'Title line\nthe second line';
    expect(deriveNoteSearchPreview(body, [])).toBe('the second line');
  });

  it('collapses newlines so a snippet stays one line', () => {
    const body = `intro\n${'x'.repeat(400)}\nartwork\napproved`;
    const preview = deriveNoteSearchPreview(body, ['artwork']);
    expect(preview).not.toContain('\n');
  });

  it('returns an empty string for an empty body', () => {
    expect(deriveNoteSearchPreview('', ['artwork'])).toBe('');
  });
});
