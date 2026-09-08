import { describe, expect, it } from 'vitest';
import { buildPendingNote, isPendingNote, mergePendingNotes } from './note-offline';
import type { Note } from '@/types/notes';

function note(over: Partial<Note> & { id: string }): Note {
  return {
    releaseId: null,
    body: '',
    pinned: false,
    archivedAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

describe('isPendingNote', () => {
  it('is false for an ordinary note', () => {
    expect(isPendingNote(note({ id: 'a' }))).toBe(false);
  });

  it('is true once the flag is set', () => {
    expect(isPendingNote(note({ id: 'a', pendingSync: true }))).toBe(true);
  });

  /** The flag is optional on the type, so an absent one must read as synced —
   *  every note that came from the server lacks it entirely. */
  it('treats an absent flag as synced', () => {
    const n = note({ id: 'a' });
    delete (n as Partial<Note>).pendingSync;
    expect(isPendingNote(n)).toBe(false);
  });
});

describe('buildPendingNote', () => {
  /** The local id IS the queue item's id. That is what lets the flush find
   *  the placeholder row and swap it in place when the note finally lands —
   *  the same trick the task queue uses. */
  it('uses the queue id as the note id', () => {
    const built = buildPendingNote({ id: 'queue-1', body: 'hi', releaseId: null });
    expect(built.id).toBe('queue-1');
  });

  it('is marked pending', () => {
    expect(buildPendingNote({ id: 'q', body: '', releaseId: null }).pendingSync).toBe(true);
  });

  it('carries the body and the release it was captured against', () => {
    const built = buildPendingNote({ id: 'q', body: 'call the promoter', releaseId: 'rel-1' });
    expect(built.body).toBe('call the promoter');
    expect(built.releaseId).toBe('rel-1');
  });

  /** Never archived and never pinned on creation: both are acts the owner
   *  takes on a note that exists, and neither can have happened yet. */
  it('starts active and unpinned', () => {
    const built = buildPendingNote({ id: 'q', body: '', releaseId: null });
    expect(built.archivedAt).toBeNull();
    expect(built.pinned).toBe(false);
  });
});

describe('mergePendingNotes', () => {
  /** A fetch replaces the list, and a note that has never reached the server
   *  is not in it. Without this, capturing offline and then reconnecting
   *  would make the note vanish the moment the list refreshed — before the
   *  flush had a chance to send it. */
  it('keeps a pending note the server does not know about', () => {
    const loaded = [note({ id: 'server-1' })];
    const previous = [note({ id: 'queue-1', pendingSync: true, body: 'offline' })];
    expect(mergePendingNotes(loaded, previous).map((n) => n.id)).toEqual(['queue-1', 'server-1']);
  });

  it('drops previous notes that are not pending', () => {
    const loaded = [note({ id: 'server-1' })];
    const previous = [note({ id: 'stale' }), note({ id: 'server-1' })];
    expect(mergePendingNotes(loaded, previous).map((n) => n.id)).toEqual(['server-1']);
  });

  /** Belt and braces against the narrow window where a flush lands between
   *  a fetch being issued and its result being applied: if the server
   *  already knows this id, the pending copy is stale and must not double. */
  it('does not duplicate a pending note the server now returns', () => {
    const loaded = [note({ id: 'queue-1' })];
    const previous = [note({ id: 'queue-1', pendingSync: true })];
    expect(mergePendingNotes(loaded, previous).map((n) => n.id)).toEqual(['queue-1']);
    expect(mergePendingNotes(loaded, previous)[0].pendingSync).toBeUndefined();
  });

  it('keeps several pending notes in their existing order', () => {
    const loaded: Note[] = [];
    const previous = [
      note({ id: 'q1', pendingSync: true }),
      note({ id: 'q2', pendingSync: true }),
    ];
    expect(mergePendingNotes(loaded, previous).map((n) => n.id)).toEqual(['q1', 'q2']);
  });

  it('returns the loaded list untouched when nothing is pending', () => {
    const loaded = [note({ id: 'a' }), note({ id: 'b' })];
    expect(mergePendingNotes(loaded, [])).toEqual(loaded);
  });
});
