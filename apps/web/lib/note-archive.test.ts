import { describe, expect, it } from 'vitest';
import {
  isArchived,
  noteBelongsInView,
  parseArchivedPatch,
  parseNotesView,
} from './note-archive';
import type { Note } from '@/types/notes';

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    releaseId: null,
    body: 'a note',
    pinned: false,
    archivedAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

describe('isArchived', () => {
  it('is false while archivedAt is null', () => {
    expect(isArchived(note())).toBe(false);
  });

  it('is true once a timestamp is set', () => {
    expect(isArchived(note({ archivedAt: '2026-09-08T10:00:00.000Z' }))).toBe(true);
  });

  /** Empty string is what a careless mapper produces from a null column. It
   *  must not read as "archived", or a restore would look like it failed. */
  it('treats an empty string as active, not archived', () => {
    expect(isArchived(note({ archivedAt: '' }))).toBe(false);
  });
});

describe('parseNotesView', () => {
  it('reads the archived view from the url', () => {
    expect(parseNotesView('1')).toBe('archived');
  });

  /** Anything else is the notebook. A junk param must never strand somebody
   *  in an empty view they cannot name — the default is always the one with
   *  their notes in it. */
  it.each([['absent', null], ['empty', ''], ['zero', '0'], ['junk', 'yes'], ['true', 'true']])(
    'falls back to active for %s',
    (_label, raw) => {
      expect(parseNotesView(raw)).toBe('active');
    }
  );
});

describe('noteBelongsInView', () => {
  it('keeps an active note in the active view', () => {
    expect(noteBelongsInView(note(), 'active')).toBe(true);
  });

  it('drops an archived note from the active view', () => {
    expect(noteBelongsInView(note({ archivedAt: '2026-09-08T10:00:00.000Z' }), 'active')).toBe(
      false
    );
  });

  it('keeps an archived note in the archived view', () => {
    expect(noteBelongsInView(note({ archivedAt: '2026-09-08T10:00:00.000Z' }), 'archived')).toBe(
      true
    );
  });

  it('drops an active note from the archived view', () => {
    expect(noteBelongsInView(note(), 'archived')).toBe(false);
  });

  /** Pinning and archiving are independent: a pinned note that is archived is
   *  still archived, and must not leak back into the active list on the
   *  strength of its pin. */
  it('does not let a pin keep an archived note in the active view', () => {
    expect(
      noteBelongsInView(note({ pinned: true, archivedAt: '2026-09-08T10:00:00.000Z' }), 'active')
    ).toBe(false);
  });
});

describe('parseArchivedPatch', () => {
  it('reads a real boolean', () => {
    expect(parseArchivedPatch(true)).toBe(true);
    expect(parseArchivedPatch(false)).toBe(false);
  });

  /** Absent means "not part of this patch" — distinct from false, which means
   *  "restore this note". Conflating them would un-archive a note every time
   *  somebody edited its body. */
  it('returns undefined when the field is absent', () => {
    expect(parseArchivedPatch(undefined)).toBeUndefined();
  });

  /** Truthy strings are the classic way a boolean arrives wrong over JSON.
   *  Refusing them keeps "archive" an explicit act. */
  it.each([['string true', 'true'], ['string false', 'false'], ['one', 1], ['null', null], ['object', {}]])(
    'refuses %s',
    (_label, raw) => {
      expect(parseArchivedPatch(raw)).toBeUndefined();
    }
  );
});
