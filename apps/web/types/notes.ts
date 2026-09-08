// Notes (global quick capture). The owner-facing shape returned by the
// /api/notes routes. Notes are private to their owner — there is no public
// or teammate-facing variant of this type.

export interface Note {
  id: string;
  /**
   * Linked release, or null for a global note. Optional by design: a note is
   * captured first and organized later. The database clears this to null
   * (on delete set null) when the release itself is deleted, so a note
   * outlives the release it was about.
   */
  releaseId: string | null;
  /**
   * The whole note. There is no separate title column — the first non-empty
   * line doubles as the display title (see deriveNoteTitle in lib/notes.ts).
   */
  body: string;
  /** Pinned notes sort above the rest. */
  pinned: boolean;
  /**
   * When the note was archived, or null while it is active. A timestamp
   * rather than a boolean so the archived view can be ordered and a note
   * can say how long it has been put away — a boolean throws that away and
   * nothing can reconstruct it.
   *
   * Archiving is NOT deleting: the note keeps its body, its release link
   * and its pin, and restoring puts it back exactly as it was.
   */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
