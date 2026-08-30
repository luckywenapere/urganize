/**
 * Setlist maths: how long a set actually runs, and how that compares to the
 * slot the promoter gave you.
 *
 * This is the feature, not a helper. The spec's whole reason for the events
 * surface is that an artist builds a 38 minute set for a 25 minute slot and
 * nobody notices until the stage manager cuts them off. So the rules below are
 * deliberately conservative in one direction: this module will tell you a set
 * is over, and it will refuse to tell you a set is fine when it does not
 * actually know.
 *
 * Pure — no React, no I/O, no env. Both the setlist builder and the API read
 * it, so a total shown on screen and a total checked on the server cannot
 * disagree (the asset-constants.ts pattern).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Version labels
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors the `song_version_label` enum in
 *  supabase/migrations/20260830120000_events.sql. Structured rather than free
 *  text so "clean" means the same thing on every release a DJ receives. */
export const SONG_VERSION_LABELS = [
  'original',
  'clean',
  'dirty',
  'radio_edit',
  'extended',
  'instrumental',
  'acapella',
  'live',
] as const;

export type SongVersionLabel = (typeof SONG_VERSION_LABELS)[number];

/** What a human sees. Kept apart from the enum values so the copy can change
 *  without a migration. */
export const SONG_VERSION_LABEL_COPY: Record<SongVersionLabel, string> = {
  original: 'Original',
  clean: 'Clean',
  dirty: 'Dirty',
  radio_edit: 'Radio edit',
  extended: 'Extended',
  instrumental: 'Instrumental',
  acapella: 'Acapella',
  live: 'Live',
};

export const isSongVersionLabel = (value: unknown): value is SongVersionLabel =>
  typeof value === 'string' && (SONG_VERSION_LABELS as readonly string[]).includes(value);

// ─────────────────────────────────────────────────────────────────────────────
// Duration resolution
// ─────────────────────────────────────────────────────────────────────────────

export type SetlistItemType = 'song' | 'talk' | 'interlude' | 'break';

/** The three places a duration can come from, in precedence order. Surfaced so
 *  the UI can say WHERE a number came from — a manager who typed 3:20 by hand
 *  should be able to tell that apart from a duration read off the file. */
export type DurationSource = 'item' | 'version' | 'song';

export type DurationInputs = {
  /** Typed on the item itself. Wins, because it is the most deliberate. */
  itemSeconds?: number | null;
  /** The chosen version's own length. A radio edit is genuinely shorter than
   *  the extended mix, so this beats the song's nominal duration. */
  versionSeconds?: number | null;
  /** The song's nominal duration. */
  songSeconds?: number | null;
};

export type ResolvedDuration = {
  seconds: number | null;
  source: DurationSource | null;
};

const isUsableDuration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Item override, then the version being played, then the song.
 *
 * Returns null rather than 0 when none is known, and that distinction is the
 * whole point: a set with two unmeasured songs is not 4 minutes shorter than it
 * really is, it is a set we cannot measure yet. Callers must handle null by
 * asking for a number, never by adding zero.
 */
export function resolveItemDuration(inputs: DurationInputs): ResolvedDuration {
  if (isUsableDuration(inputs.itemSeconds)) {
    return { seconds: inputs.itemSeconds, source: 'item' };
  }
  if (isUsableDuration(inputs.versionSeconds)) {
    return { seconds: inputs.versionSeconds, source: 'version' };
  }
  if (isUsableDuration(inputs.songSeconds)) {
    return { seconds: inputs.songSeconds, source: 'song' };
  }
  return { seconds: null, source: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// The running total
// ─────────────────────────────────────────────────────────────────────────────

export type SetlistSummaryItem = DurationInputs & {
  /** Non-song items count toward the total. That is why they exist in the
   *  model at all: a minute of talking is a minute of the slot. */
  itemType?: SetlistItemType;
};

/**
 * Anything inside this of the slot reads as on time. A DJ does not care about
 * eleven seconds, and rounding without a tolerance produces "0 minutes over",
 * which is a sentence that helps nobody.
 */
export const ON_TIME_TOLERANCE_SECONDS = 60;

export type SetlistFit = 'over' | 'under' | 'on_time';

export type SetlistSummary = {
  /** Sum of every item we could measure. */
  totalSeconds: number;
  /** How many items had no duration anywhere. */
  unmeasuredCount: number;
  /** True when at least one item is unmeasured, so totalSeconds is a FLOOR and
   *  not the real length. Every piece of copy below respects this. */
  isPartial: boolean;
  slotSeconds: number;
  /** Positive means over the slot. */
  deltaSeconds: number;
  fit: SetlistFit;
};

/**
 * Total a setlist against its slot.
 *
 * A partial set (something unmeasured) can still be reported as OVER — if the
 * measured part already exceeds the slot, adding the unknown songs cannot bring
 * it back. It can never be reported as UNDER or ON TIME, because the unknowns
 * could be anything. Being wrong in that direction is the exact failure this
 * feature exists to prevent, so the maths refuses to make it.
 */
export function summarizeSetlist(
  items: readonly SetlistSummaryItem[],
  setLengthMinutes: number
): SetlistSummary {
  let totalSeconds = 0;
  let unmeasuredCount = 0;

  for (const item of items) {
    const { seconds } = resolveItemDuration(item);
    if (seconds === null) {
      unmeasuredCount += 1;
      continue;
    }
    totalSeconds += seconds;
  }

  const safeMinutes =
    Number.isFinite(setLengthMinutes) && setLengthMinutes > 0 ? setLengthMinutes : 0;
  const slotSeconds = Math.round(safeMinutes * 60);
  const deltaSeconds = totalSeconds - slotSeconds;
  const isPartial = unmeasuredCount > 0;

  let fit: SetlistFit;
  if (deltaSeconds > ON_TIME_TOLERANCE_SECONDS) {
    // Measured content alone already busts the slot. Unknowns can only add.
    fit = 'over';
  } else if (isPartial) {
    // We are under on what we can see, but we cannot see all of it. Refuse to
    // call this fine.
    fit = 'under';
  } else if (deltaSeconds < -ON_TIME_TOLERANCE_SECONDS) {
    fit = 'under';
  } else {
    fit = 'on_time';
  }

  return { totalSeconds, unmeasuredCount, isPartial, slotSeconds, deltaSeconds, fit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy
// ─────────────────────────────────────────────────────────────────────────────

/** "3:34", "1:04:20". Clock format, because that is how a set is read. */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (!isUsableDuration(totalSeconds)) return '—';
  const whole = Math.round(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, '0')}`
    : `${mm}:${String(seconds).padStart(2, '0')}`;
}

const pluralMinutes = (count: number) => `${count} ${count === 1 ? 'minute' : 'minutes'}`;

/**
 * The line under the running total. Plain, no hedging, no exclamation — a
 * manager reads this while doing something else.
 *
 * Never claims a partial set fits. When something is unmeasured it says so,
 * because "you have 4 minutes spare" is a lie if two songs have no duration.
 */
export function describeSetlistFit(summary: SetlistSummary): string {
  const slotMinutes = Math.round(summary.slotSeconds / 60);
  const overBy = pluralMinutes(Math.max(1, Math.round(summary.deltaSeconds / 60)));
  const underBy = pluralMinutes(Math.max(1, Math.round(Math.abs(summary.deltaSeconds) / 60)));

  if (summary.fit === 'over') {
    return summary.isPartial
      ? `Already ${overBy} over ${slotMinutes}, and ${summary.unmeasuredCount} still need a length.`
      : `You are ${overBy} over ${slotMinutes}.`;
  }

  if (summary.isPartial) {
    const needed = summary.unmeasuredCount === 1 ? 'one item needs' : `${summary.unmeasuredCount} items need`;
    return `${needed} a length before this total means anything.`;
  }

  if (summary.fit === 'on_time') {
    return `Right on ${slotMinutes} minutes.`;
  }

  return `You are ${underBy} under ${slotMinutes}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pack file naming
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip what a filesystem, a zip tool or Rekordbox would choke on, without
 * mangling ordinary titles. Deliberately conservative: the DJ has to recognise
 * the track at a glance in a dark booth.
 */
function sanitizeFilePart(value: string): string {
  return (
    value
      .replace(/[/\\?%*:|"<>]/g, ' ')
      // Control characters survive the class above and break zip tools. Written
      // as \u escapes on purpose: an earlier draft embedded the raw bytes,
      // which works, reads as garbage, and any editor could silently mangle.
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export type PackFileNameInput = {
  /** 1-based place in the set. */
  position: number;
  artistName: string;
  songTitle: string;
  versionLabel?: SongVersionLabel | null;
  bpm?: number | null;
  musicalKey?: string | null;
  /** Taken from the stored file name, e.g. "mp3". */
  extension?: string | null;
};

/**
 * `01 Dorian - Lagos Nights (Clean) [102BPM][Am].mp3`
 *
 * THE LEADING NUMBER IS THE POINT. It means the folder is already in set order
 * when the DJ drags it into Rekordbox, which is the difference between a pack
 * that gets used and one that gets re-sorted by hand at the venue. Zero-padded
 * so 10 does not sort before 2.
 *
 * Everything after the title is optional and simply omitted when unknown — an
 * empty `[]` reads as missing data rather than as "no key".
 */
export function buildPackFileName(input: PackFileNameInput): string {
  const position = Math.max(1, Math.round(input.position));
  const order = String(position).padStart(2, '0');

  const artist = sanitizeFilePart(input.artistName) || 'Unknown artist';
  const title = sanitizeFilePart(input.songTitle) || 'Untitled';

  let name = `${order} ${artist} - ${title}`;

  if (input.versionLabel && isSongVersionLabel(input.versionLabel)) {
    name += ` (${SONG_VERSION_LABEL_COPY[input.versionLabel]})`;
  }

  if (typeof input.bpm === 'number' && Number.isFinite(input.bpm) && input.bpm > 0) {
    name += `[${Math.round(input.bpm)}BPM]`;
  }

  const key = input.musicalKey ? sanitizeFilePart(input.musicalKey) : '';
  if (key) name += `[${key}]`;

  const extension = (input.extension ?? '').replace(/^\.+/, '').toLowerCase();
  return extension ? `${name}.${sanitizeFilePart(extension)}` : name;
}

// ─────────────────────────────────────────────────────────────────────────────
// Write validation
// ─────────────────────────────────────────────────────────────────────────────
//
// Lives beside the maths on purpose: what a caller is allowed to store and what
// the running total does with it are the same question, and splitting them is
// how a duration that passes validation ends up counted as zero.

export const SETLIST_ITEM_TYPES: readonly SetlistItemType[] = [
  'song',
  'talk',
  'interlude',
  'break',
];

export const isSetlistItemType = (value: unknown): value is SetlistItemType =>
  typeof value === 'string' && (SETLIST_ITEM_TYPES as readonly string[]).includes(value);

export const MAX_SETLIST_NAME_LENGTH = 80;
export const MAX_CUE_NOTE_LENGTH = 400;
export const MAX_ITEM_LABEL_LENGTH = 120;

/** Twenty minutes. A single item longer than that is a typo (2000 seconds
 *  entered as 20000), not a song — and one bad number silently doubles a set. */
export const MAX_ITEM_DURATION_SECONDS = 20 * 60;

export type SetlistFieldError = { field: string; message: string };

export type SetlistItemInput = {
  itemType?: unknown;
  songId?: unknown;
  songVersionId?: unknown;
  durationSeconds?: unknown;
  cueNote?: unknown;
  label?: unknown;
  position?: unknown;
};

export type SetlistItemColumns = {
  item_type?: SetlistItemType;
  song_id?: string | null;
  song_version_id?: string | null;
  duration_seconds?: number | null;
  cue_note?: string | null;
  label?: string | null;
  position?: number;
};

const optionalText = (
  value: unknown,
  max: number
): { ok: true; value: string | null } | { ok: false } => {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed || null };
};

function parseSetlistItemFields(
  input: SetlistItemInput,
  requireType: boolean
): { errors: SetlistFieldError[]; columns: SetlistItemColumns } {
  const errors: SetlistFieldError[] = [];
  const columns: SetlistItemColumns = {};
  const has = (key: keyof SetlistItemInput) =>
    Object.prototype.hasOwnProperty.call(input, key);

  if (has('itemType') || requireType) {
    if (!isSetlistItemType(input.itemType)) {
      errors.push({ field: 'itemType', message: 'That is not something a set can contain.' });
    } else {
      columns.item_type = input.itemType;
    }
  }

  if (has('songId')) {
    if (input.songId === null) {
      columns.song_id = null;
    } else if (typeof input.songId !== 'string' || !input.songId.trim()) {
      errors.push({ field: 'songId', message: 'Pick a song.' });
    } else {
      columns.song_id = input.songId.trim();
    }
  }

  if (has('songVersionId')) {
    if (input.songVersionId === null) {
      columns.song_version_id = null;
    } else if (typeof input.songVersionId !== 'string' || !input.songVersionId.trim()) {
      errors.push({ field: 'songVersionId', message: 'Pick a version.' });
    } else {
      columns.song_version_id = input.songVersionId.trim();
    }
  }

  if (has('durationSeconds')) {
    const raw = input.durationSeconds;
    if (raw === null) {
      // Deliberately allowed: clearing an override falls back to the version,
      // then the song, then "still needs a length".
      columns.duration_seconds = null;
    } else if (
      typeof raw !== 'number' ||
      !Number.isInteger(raw) ||
      raw <= 0 ||
      raw > MAX_ITEM_DURATION_SECONDS
    ) {
      errors.push({
        field: 'durationSeconds',
        message: 'How long is it? Give a length in seconds, under twenty minutes.',
      });
    } else {
      columns.duration_seconds = raw;
    }
  }

  if (has('cueNote')) {
    const parsed = optionalText(input.cueNote, MAX_CUE_NOTE_LENGTH);
    if (!parsed.ok) {
      errors.push({ field: 'cueNote', message: 'That cue note is too long.' });
    } else {
      columns.cue_note = parsed.value;
    }
  }

  if (has('label')) {
    const parsed = optionalText(input.label, MAX_ITEM_LABEL_LENGTH);
    if (!parsed.ok) {
      errors.push({ field: 'label', message: 'That label is too long.' });
    } else {
      columns.label = parsed.value;
    }
  }

  if (has('position')) {
    const raw = input.position;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
      errors.push({ field: 'position', message: 'That is not a place in the set.' });
    } else {
      columns.position = raw;
    }
  }

  return { errors, columns };
}

/**
 * Enforces the same shape the database CHECK enforces
 * (`setlist_items_song_shape`): a song item names a song, and nothing else may.
 *
 * Duplicated here on purpose rather than left to Postgres — the constraint is
 * the backstop that guarantees it, this is what turns a violation into a
 * sentence a manager can act on instead of a 500.
 */
function checkSongShape(
  itemType: SetlistItemType | undefined,
  columns: SetlistItemColumns
): SetlistFieldError | null {
  if (!itemType) return null;

  if (itemType === 'song') {
    if (!columns.song_id) {
      return { field: 'songId', message: 'Pick a song for this slot.' };
    }
    return null;
  }

  if (columns.song_id || columns.song_version_id) {
    return {
      field: 'songId',
      message: 'Only a song slot can carry a song.',
    };
  }
  return null;
}

export function parseSetlistItemCreate(input: SetlistItemInput): {
  errors: SetlistFieldError[];
  columns: SetlistItemColumns;
} {
  const withDefault: SetlistItemInput = { itemType: 'song', ...input };
  const result = parseSetlistItemFields(withDefault, true);

  const shapeError = checkSongShape(result.columns.item_type, result.columns);
  if (shapeError) result.errors.push(shapeError);

  // A non-song item has no song to borrow a length from, so it must arrive
  // with one or it would silently count as zero.
  if (
    result.errors.length === 0 &&
    result.columns.item_type !== 'song' &&
    result.columns.duration_seconds == null
  ) {
    result.errors.push({
      field: 'durationSeconds',
      message: 'How long is this? Nothing else can tell us.',
    });
  }

  return result;
}

/**
 * Patch is sparse, like the event patch — only what was sent is written.
 *
 * `currentType` is required because the shape rule spans fields: changing a
 * song slot to a break has to clear the song, and validating the patch alone
 * cannot see that. Callers pass the stored row's type when the patch omits it.
 */
export function parseSetlistItemPatch(
  input: SetlistItemInput,
  currentType: SetlistItemType
): { errors: SetlistFieldError[]; columns: SetlistItemColumns } {
  const result = parseSetlistItemFields(input, false);
  if (result.errors.length > 0) return result;

  if (Object.keys(result.columns).length === 0) {
    return { errors: [{ field: 'body', message: 'Nothing to save.' }], columns: {} };
  }

  const nextType = result.columns.item_type ?? currentType;

  if (nextType !== 'song') {
    // Switching a song slot to a break clears the song rather than refusing:
    // the intent is plain, and leaving it set would violate the database
    // CHECK (setlist_items_song_shape).
    result.columns.song_id = null;
    result.columns.song_version_id = null;
  } else if (currentType !== 'song' && !result.columns.song_id) {
    // Becoming a song slot needs a song named in the same patch — the stored
    // row has none to fall back on.
    result.errors.push({ field: 'songId', message: 'Pick a song for this slot.' });
  } else if (result.columns.song_id === null) {
    // Explicitly clearing the song on a slot that stays a song.
    result.errors.push({ field: 'songId', message: 'A song slot needs a song.' });
  }

  return result;
}

export function parseSetlistName(value: unknown): { error: string } | { name: string } {
  if (typeof value !== 'string') return { error: 'Give the set a name.' };
  const trimmed = value.trim();
  if (!trimmed) return { error: 'Give the set a name.' };
  if (trimmed.length > MAX_SETLIST_NAME_LENGTH) {
    return { error: `Keep the name under ${MAX_SETLIST_NAME_LENGTH} characters.` };
  }
  return { name: trimmed };
}
