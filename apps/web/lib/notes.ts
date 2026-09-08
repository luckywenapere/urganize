// Notes (global quick capture) — pure helpers shared by the client and the
// API routes, so the two can never disagree about what a note's title is or
// how long a body may be (the asset-constants.ts pattern).

import type { Note } from '@/types/notes';

/** Display cap for a note's derived title line. */
export const NOTE_TITLE_MAX = 80;

/** Display cap for the preview line under the title. */
export const NOTE_PREVIEW_MAX = 140;

/**
 * Hard cap on a stored note body, enforced on both sides. `body` is an
 * unbounded `text` column, and a runaway paste would otherwise create
 * multi-megabyte rows that then get pushed into localStorage.
 */
export const MAX_NOTE_BODY_LENGTH = 20_000;

/**
 * The note's title: its first line with any content, trimmed and capped.
 *
 * There is no title column — this derivation IS the title (the Apple Notes
 * model), so it can never drift from the body it describes. Returns '' for a
 * blank note; callers own the placeholder copy, since the right wording
 * differs between a list row and an editor.
 */
export function deriveNoteTitle(body: string): string {
  if (!body) return '';
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) return trimmed.slice(0, NOTE_TITLE_MAX);
  }
  return '';
}

/**
 * The preview line: everything after the title line, whitespace-collapsed
 * onto one line and capped. Blank when the note is a single line.
 */
export function deriveNotePreview(body: string): string {
  if (!body) return '';
  const lines = body.split('\n');
  let titleIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim()) {
      titleIndex = i;
      break;
    }
  }
  if (titleIndex === -1) return '';
  return lines
    .slice(titleIndex + 1)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOTE_PREVIEW_MAX);
}

/**
 * List order: pinned first, then most recently edited. Returns a new array —
 * the store re-sorts after every optimistic mutation so a pin toggle moves
 * the row immediately, before the server round trip lands.
 */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
    // Unique tiebreak, descending, matching the server's
    // (pinned desc, updated_at desc, id desc). Keyset paging names a row in
    // that ordering, so if the two sides disagree about two notes sharing an
    // updated_at, a page boundary can repeat or skip one.
    return b.id.localeCompare(a.id);
  });
}
