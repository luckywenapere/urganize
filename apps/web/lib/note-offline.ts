/**
 * Capturing a note with no connection.
 *
 * This is the arm lib/offline/sync.ts deliberately left unwired, and its
 * header said exactly why: "the editor needs a real id to autosave into, and
 * a note the server has never seen has nowhere to save to."
 *
 * ── HOW THAT IS SOLVED ─────────────────────────────────────────────────────
 * The note's local id IS the queue item's id. That single choice answers most
 * of it: the flush can find the placeholder row and swap it in place when the
 * note finally lands (the task queue's trick), and every offline edit knows
 * which queued payload to update.
 *
 * So an offline note is never PATCHed. Typing into it updates local state and
 * merges into the ONE pending create via mutateQueuedPayload — which is what
 * that function was written for. The create then carries the note's final
 * text, so a note written entirely offline reaches the server as one POST
 * with everything in it, rather than a create followed by edits that would
 * each need a server id to address.
 *
 * The consequence worth knowing: an offline note has no server row, so it
 * cannot be archived, and deleting it means dropping the queued item rather
 * than calling DELETE against an id the server would not recognise.
 */

import type { Note } from '@/types/notes';

export function isPendingNote(note: Pick<Note, 'pendingSync'>): boolean {
  return note.pendingSync === true;
}

/**
 * The local row an offline capture puts on screen immediately.
 *
 * `id` must be the queue item's id — see the header. Everything else is the
 * honest starting state: not pinned and not archived, because both are acts
 * the owner takes on a note that already exists.
 */
export function buildPendingNote(input: {
  id: string;
  body: string;
  releaseId: string | null;
  now?: string;
}): Note {
  const at = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    releaseId: input.releaseId,
    body: input.body,
    pinned: false,
    archivedAt: null,
    createdAt: at,
    updatedAt: at,
    pendingSync: true,
  };
}

/**
 * Fold notes that have not reached the server yet into a freshly fetched list.
 *
 * A fetch REPLACES the list, and a note the server has never seen is not in
 * it — so without this, capturing offline and then reconnecting would make
 * the note vanish the instant anything refreshed, before the flush had a
 * chance to send it.
 *
 * A pending note whose id the server now returns is dropped in favour of the
 * server's copy. That covers the narrow window where a flush lands between a
 * fetch being issued and its result being applied; the server's row is the
 * real one, and keeping both would show the note twice.
 */
export function mergePendingNotes(loaded: Note[], previous: Note[]): Note[] {
  const loadedIds = new Set(loaded.map((note) => note.id));
  const stillPending = previous.filter(
    (note) => isPendingNote(note) && !loadedIds.has(note.id)
  );
  return stillPending.length === 0 ? loaded : [...stillPending, ...loaded];
}
