/**
 * The song catalog: what a song row may hold.
 *
 * A song is the join between a release and a show (see the header of
 * supabase/migrations/20260830120000_events.sql). This module is the one
 * definition of what a caller may write to one, shared by POST /api/songs
 * (add) and PATCH /api/songs/[songId] (edit), so a title the add form accepts
 * can never be one the edit form refuses.
 *
 * Not lib/song.ts, which is the RELEASE song upload (an `assets` row). The two
 * are different objects that happen to share a word.
 *
 * Pure: no React, no I/O, no env.
 */

export const MAX_SONG_TITLE_LENGTH = 200;

/** Twenty minutes, matching the setlist item ceiling — a longer "song" is a
 *  typo, and one bad number quietly doubles a set. */
export const MAX_SONG_DURATION_SECONDS = 20 * 60;

/** "F#m", "11B", "Ab major". Generous for any notation a DJ uses, and a guard
 *  against a paste of a whole paragraph into the key field. */
export const MAX_MUSICAL_KEY_LENGTH = 16;

export type SongInput = {
  title?: unknown;
  durationSeconds?: unknown;
  bpm?: unknown;
  musicalKey?: unknown;
};

export type SongColumns = {
  title?: string;
  duration_seconds?: number | null;
  bpm?: number | null;
  musical_key?: string | null;
};

export type SongFieldError = { field: string; message: string };

const has = (input: SongInput, key: keyof SongInput) =>
  Object.prototype.hasOwnProperty.call(input, key);

/**
 * Shared field parsing. Anything absent from `input` is not written, which is
 * what makes PATCH sparse; `null` explicitly clears an optional field.
 */
function parseSongFields(
  input: SongInput,
  options: { requireTitle: boolean }
): { errors: SongFieldError[]; columns: SongColumns } {
  const errors: SongFieldError[] = [];
  const columns: SongColumns = {};

  if (has(input, 'title') || options.requireTitle) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) {
      errors.push({ field: 'title', message: 'What is the song called?' });
    } else if (title.length > MAX_SONG_TITLE_LENGTH) {
      errors.push({ field: 'title', message: 'That title is too long.' });
    } else {
      columns.title = title;
    }
  }

  if (has(input, 'durationSeconds')) {
    const duration = input.durationSeconds;
    if (duration === null) {
      columns.duration_seconds = null;
    } else if (
      typeof duration !== 'number' ||
      !Number.isInteger(duration) ||
      duration <= 0 ||
      duration > MAX_SONG_DURATION_SECONDS
    ) {
      errors.push({
        field: 'durationSeconds',
        message: 'How long is it? Give a length under twenty minutes.',
      });
    } else {
      columns.duration_seconds = duration;
    }
  }

  if (has(input, 'bpm')) {
    const bpm = input.bpm;
    if (bpm === null) {
      columns.bpm = null;
    } else if (typeof bpm !== 'number' || !Number.isInteger(bpm) || bpm <= 0 || bpm >= 400) {
      errors.push({ field: 'bpm', message: 'That BPM is not a real tempo.' });
    } else {
      columns.bpm = bpm;
    }
  }

  if (has(input, 'musicalKey')) {
    const key = input.musicalKey;
    if (key === null) {
      columns.musical_key = null;
    } else if (typeof key !== 'string') {
      errors.push({ field: 'musicalKey', message: 'That key is not text.' });
    } else if (key.trim().length > MAX_MUSICAL_KEY_LENGTH) {
      errors.push({ field: 'musicalKey', message: 'Keep the key short, like F#m or 11B.' });
    } else {
      columns.musical_key = key.trim() || null;
    }
  }

  return { errors, columns };
}

/** Add: only the title is required, because the set builder needs to accept
 *  "add the new one" mid-build. Everything else can be filled in later. */
export function parseSongCreate(input: SongInput): {
  errors: SongFieldError[];
  columns: SongColumns;
} {
  return parseSongFields(input, { requireTitle: true });
}

/** Edit: nothing is required, and an empty patch is refused rather than
 *  silently succeeding — a no-op write usually means a client bug. */
export function parseSongPatch(input: SongInput): {
  errors: SongFieldError[];
  columns: SongColumns;
} {
  const result = parseSongFields(input, { requireTitle: false });
  if (result.errors.length === 0 && Object.keys(result.columns).length === 0) {
    return { errors: [{ field: 'body', message: 'Nothing to save.' }], columns: {} };
  }
  return result;
}

/**
 * Why a song cannot be deleted while it is in a set.
 *
 * setlist_items.song_id is ON DELETE RESTRICT, deliberately: deleting a song
 * must never silently shorten a set or change its running total. So the
 * refusal names where it is used, and says what to do, rather than surfacing a
 * raw foreign-key error.
 */
export function describeSongInUse(showTitles: readonly string[]): string {
  const titles = Array.from(new Set(showTitles.map((title) => title.trim()).filter(Boolean)));
  if (titles.length === 0) {
    return 'This song is in a set. Take it out of the set first.';
  }
  const shown = titles.slice(0, 2);
  const more = titles.length - shown.length;
  const where =
    more > 0
      ? `${shown.join(', ')} and ${more} more`
      : shown.length === 2
        ? `${shown[0]} and ${shown[1]}`
        : shown[0];
  return `This song is in the ${titles.length === 1 ? 'set' : 'sets'} for ${where}. Take it out there first.`;
}
