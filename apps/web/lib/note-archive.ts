/**
 * Archive: the ordinary way a note ends.
 *
 * Deleting is destructive, confirmed, and irreversible — the right treatment
 * for something you never want back, and the wrong one for the common case,
 * which is a note that has simply served its purpose. Without a middle option
 * the notebook only grew, and the one way to tidy it destroyed things.
 *
 * Archiving keeps everything: the body, the release link, the pin. Restoring
 * puts the note back exactly as it was. The only thing that changes is which
 * list it appears in.
 */

import type { Note } from '@/types/notes';

/** Which list the notebook page is showing. */
export type NotesView = 'active' | 'archived';

/** The url param that selects the archived list (`?archived=1`). */
export const ARCHIVED_VIEW_PARAM = 'archived';

export function isArchived(note: Pick<Note, 'archivedAt'>): boolean {
  // A timestamp OR nothing. Guarding on truthiness rather than `!== null`
  // matters because an empty string is what a careless row mapper produces
  // from a null column, and reading that as "archived" would make a restore
  // look like it silently failed.
  return Boolean(note.archivedAt);
}

/**
 * Read the view out of a url param.
 *
 * Only the exact string '1' selects the archive; everything else is the
 * notebook. Deliberately strict and deliberately silent: a junk param must
 * never strand somebody in an empty view they cannot name, and the default is
 * always the list with their notes in it.
 */
export function parseNotesView(raw: string | null | undefined): NotesView {
  return raw === '1' ? 'archived' : 'active';
}

/**
 * Whether a note belongs in the list currently on screen.
 *
 * Used to drop a note optimistically the moment it is archived, so it leaves
 * the list without waiting for a refetch — and, symmetrically, to drop it
 * from the archived view when restored.
 *
 * Pinning is independent: a pinned note that is archived is still archived,
 * and must not ride its pin back into the active list.
 */
export function noteBelongsInView(note: Pick<Note, 'archivedAt'>, view: NotesView): boolean {
  return isArchived(note) === (view === 'archived');
}

/**
 * Read the `archived` field off a PATCH body.
 *
 * `undefined` means the field was absent — NOT part of this patch — which is
 * a different thing from `false`, meaning "restore this note". Conflating the
 * two would un-archive a note every time somebody edited its body.
 *
 * Only a real boolean is accepted. A truthy string is the classic way a
 * boolean arrives wrong over JSON, and refusing it keeps archiving an
 * explicit act rather than something a malformed client can trip.
 */
export function parseArchivedPatch(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
