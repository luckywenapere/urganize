import type { Note } from '@/types/notes';
import { deriveNoteTitle, deriveNotePreview, NOTE_PREVIEW_MAX } from './notes';
import { parseSearchTerms } from './task-search';

// Search over a manager's notes, for the notes page (URG-243). Notes are the
// one surface with no way in once there are more than a screenful: the list
// holds a page of NOTES_PAGE_SIZE (200) and offers pinning and a release filter,
// neither of which helps someone who remembers a phrase and not a release.
//
// Pure and in lib/ for the same reason lib/task-search.ts and
// lib/release-search.ts are: vitest.config.ts collects lib/**/*.test.ts and
// this repo has no component tests, so ranking rules are only testable when
// they live here.
//
// It shares `parseSearchTerms` with both of them rather than re-splitting the
// query, so word order does not matter in one search and start mattering in
// another.

/**
 * The window of body text a snippet shows around a deep match, and how much of
 * it sits BEFORE the match. A note runs to 20,000 characters, so a match at
 * character 15,000 is invisible if the row keeps showing the first line.
 */
const SNIPPET_LEAD = 40;

/**
 * Tier for one note, or null when it does not match. Lower ranks first:
 *
 *   0  the derived title starts with what was typed
 *   1  every term is somewhere in the derived title
 *   2  every term is somewhere in the body
 *
 * A note has no title column — `deriveNoteTitle` IS the title (the Apple Notes
 * model), so tiers 0 and 1 are computed from the same derivation the list row
 * displays. Tier 2 exists because a note is mostly body: the phrase someone
 * remembers ("the promoter wants a longer set") is usually three lines down,
 * and a title-only search would miss almost every note. It ranks last so a
 * passing mention never outranks a note that is ABOUT the thing.
 */
function rankNote(note: Note, terms: string[], joined: string): 0 | 1 | 2 | null {
  const title = deriveNoteTitle(note.body).toLowerCase();
  if (title && title.startsWith(joined)) return 0;
  if (title && terms.every((term) => title.includes(term))) return 1;
  const body = note.body.toLowerCase();
  if (body && terms.every((term) => body.includes(term))) return 2;
  return null;
}

/**
 * Notes matching `query`, ranked.
 *
 * An empty query returns the list UNCHANGED — the `searchReleases` convention,
 * and for the same reason: this bar FILTERS a list already on screen, so an
 * empty box means "no filter". (`searchTasks` returns nothing for an empty
 * query because it is a palette that appears on demand, where an empty box
 * means "nothing asked for yet". Copying the wrong sibling here would blank
 * the notebook on arrival.)
 *
 * Order within a tier is the incoming order, so the store's pinned-then-
 * recent sort survives untouched: Array.prototype.sort is stable per spec
 * (ES2019), so a 0 from the comparator means "leave these as they came".
 *
 * Matching is `includes` on lowercased text, which makes every character
 * literal — `.`, `*`, `(` and, importantly, `_` and `%`, which are wildcards
 * in SQL LIKE. This module never builds a pattern, so the class of bug the
 * credits route shipped once cannot occur here.
 *
 * Known limit, deliberate: no accent folding, so "Beyonce" does not find
 * "Beyoncé". Neither sibling search folds either, and three surfaces behaving
 * alike is worth more than one behaving better; changing it should change all
 * three together.
 */
export function searchNotes(notes: Note[], query: string): Note[] {
  const terms = parseSearchTerms(query);
  if (terms.length === 0) return notes;

  const joined = terms.join(' ');
  const scored: { note: Note; tier: number }[] = [];

  notes.forEach((note) => {
    const tier = rankNote(note, terms, joined);
    if (tier === null) return;
    scored.push({ note, tier });
  });

  scored.sort((a, b) => a.tier - b.tier);
  return scored.map((entry) => entry.note);
}

/**
 * The preview line for a note in a SEARCH result: a window around the first
 * matching term rather than the line under the title.
 *
 * Without this a deep match explains itself with text that has nothing to do
 * with why the row is there — the row says "Friday plan" while the reason it
 * matched sits 15,000 characters below. Falls back to the ordinary preview
 * when nothing matches the body (a title-only match already explains itself,
 * because the title is right there).
 *
 * Newlines are collapsed so a snippet stays one line, matching
 * `deriveNotePreview`.
 */
export function deriveNoteSearchPreview(body: string, terms: string[]): string {
  if (!body) return '';
  if (terms.length === 0) return deriveNotePreview(body);

  const haystack = body.toLowerCase();
  let earliest = -1;
  for (const term of terms) {
    const at = haystack.indexOf(term);
    if (at !== -1 && (earliest === -1 || at < earliest)) earliest = at;
  }
  if (earliest === -1) return deriveNotePreview(body);

  const start = Math.max(0, earliest - SNIPPET_LEAD);
  const snippet = body
    .slice(start, start + NOTE_PREVIEW_MAX)
    .replace(/\s+/g, ' ')
    .trim();

  return start > 0 ? `…${snippet}` : snippet;
}
