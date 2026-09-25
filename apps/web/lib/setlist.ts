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

/**
 * "3:34", "1:04:20". Clock format, because that is how a set is read.
 *
 * An unusable value renders as an EMPTY string — never "0:00", which would
 * claim an unmeasured song takes no time, and no longer "—", which was a dash
 * standing in for a sentence. Each caller says what it means instead ("Needs a
 * length" on a row, nothing at all on the DJ's page). A set's TOTAL is
 * different: nothing in it really is 0:00, so it uses formatSetTotal.
 */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (!isUsableDuration(totalSeconds)) return '';
  const whole = Math.round(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, '0')}`
    : `${mm}:${String(seconds).padStart(2, '0')}`;
}

/** The running total. Zero is a true total for an empty set, so it reads
 *  "0:00" rather than vanishing the way an unmeasured item does. */
export function formatSetTotal(totalSeconds: number): string {
  return formatDuration(totalSeconds) || '0:00';
}

// ─────────────────────────────────────────────────────────────────────────────
// Typing a length
// ─────────────────────────────────────────────────────────────────────────────

export type DurationParse = { ok: true; seconds: number | null } | { ok: false; error: string };

/**
 * Reads a length the way a person types one.
 *
 *   "3:30"     3 minutes 30 seconds      "1:02:03"  1 hour 2 minutes 3 seconds
 *   "4"        4 MINUTES                 "3.5"      3 and a half minutes
 *   "90s"      90 seconds                "4m"       4 minutes
 *   "3m 30s"   3 minutes 30 seconds      ""         clears the length
 *   "3'30"     3 minutes 30 seconds, the way a lot of people in music write it
 *
 * A bare number is MINUTES, deliberately. The field says m:ss and songs are
 * thought of in minutes; the old field took seconds and a manager typing "4"
 * for a four minute song got a set four minutes shorter than it was. The
 * normalised clock value is shown back as soon as the field is left, so the
 * reading is never a surprise, and "45s" is there for a short talk.
 *
 * Refuses anything it cannot read exactly rather than guessing: "3:75", "abc",
 * zero, and anything past the twenty minute item ceiling.
 */
export function parseDurationInput(raw: string): DurationParse {
  const text = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    // "3,5" is three and a half minutes wherever a comma is the decimal mark.
    .replace(/^(\d+),(\d+)$/, '$1.$2')
    // "3 : 30" is 3:30 with a stray space from a phone keyboard.
    .replace(/\s*:\s*/g, ':')
    // 3'30, 3'30", 3’30 and 3′30″ are minutes and seconds.
    .replace(/^(\d+)\s*['’′]\s*(\d{1,2})\s*(?:["”″]|'')?$/, '$1:$2')
    // 4' on its own is four minutes.
    .replace(/^(\d+(?:\.\d+)?)\s*['’′]$/, '$1m');
  if (!text) return { ok: true, seconds: null };

  let seconds: number | null = null;

  const clock = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(text);
  const units = /^(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+)\s*s(?:ec(?:ond)?s?)?)?$/.exec(text);
  const plain = /^\d+(?:\.\d+)?$/.exec(text);

  if (clock) {
    const [first, second, third] = [clock[1], clock[2], clock[3]].map((part) =>
      part === undefined ? undefined : Number(part)
    );
    if (third === undefined) {
      if ((second as number) >= 60) return { ok: false, error: 'Seconds go up to 59. Try 3:30.' };
      seconds = (first as number) * 60 + (second as number);
    } else {
      if ((second as number) >= 60 || third >= 60) {
        return { ok: false, error: 'Minutes and seconds go up to 59. Try 1:02:03.' };
      }
      seconds = (first as number) * 3600 + (second as number) * 60 + third;
    }
  } else if (plain) {
    seconds = Math.round(Number(text) * 60);
  } else if (units && (units[1] !== undefined || units[2] !== undefined)) {
    const minutes = units[1] !== undefined ? Number(units[1]) : 0;
    const extra = units[2] !== undefined ? Number(units[2]) : 0;
    seconds = Math.round(minutes * 60 + extra);
  } else {
    return { ok: false, error: 'Type a length like 3:30.' };
  }

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { ok: false, error: 'A length has to be more than nothing.' };
  }
  if (seconds > MAX_ITEM_DURATION_SECONDS) {
    return { ok: false, error: 'That is longer than twenty minutes. Check the length.' };
  }
  return { ok: true, seconds };
}

// ─────────────────────────────────────────────────────────────────────────────
// Which file a row sends
// ─────────────────────────────────────────────────────────────────────────────

export type VersionCandidate = {
  id: string;
  label: string | null;
  /** ISO. Used to find the newest; an unreadable one sorts as oldest. */
  createdAt: string | null;
};

/**
 * The file a set row plays when it has not chosen one: the song's Original,
 * else its newest file.
 *
 * Before 2026-09-25 a row only had a file if it named one explicitly, and
 * nothing ever named one, so every track on every pack read "No file". Now a
 * file added to a song reaches every set that plays it. A row still CAN choose
 * (the clean edit for a daytime show); this is only the answer when it has not.
 *
 * Original first because it is the file an artist means by "the song". Among
 * several originals, the newest wins — a re-master replaces the file a DJ
 * should get.
 */
export function pickDefaultVersion<T extends VersionCandidate>(versions: readonly T[]): T | null {
  if (versions.length === 0) return null;
  const time = (value: T) => {
    const at = value.createdAt ? Date.parse(value.createdAt) : Number.NaN;
    return Number.isNaN(at) ? -Infinity : at;
  };
  const newestFirst = [...versions].sort((a, b) => time(b) - time(a));
  return newestFirst.find((version) => version.label === 'original') ?? newestFirst[0] ?? null;
}

/**
 * A row's effective file: the one it chose, if that still belongs to its song;
 * otherwise the song's default. `explicit` is the row's song_version_id.
 */
export function resolveRowVersion<T extends VersionCandidate>(
  explicit: string | null | undefined,
  songVersions: readonly T[]
): { version: T | null; chosen: boolean } {
  if (explicit) {
    const match = songVersions.find((version) => version.id === explicit);
    if (match) return { version: match, chosen: true };
  }
  return { version: pickDefaultVersion(songVersions), chosen: false };
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

  // Nothing added yet. Without this branch an empty set fell through to the
  // under-copy and read "You are 120 minutes under 120." — true, and useless.
  // Zero measured with zero unmeasured can only be an empty set, since every
  // stored duration is checked > 0.
  if (summary.totalSeconds === 0 && summary.unmeasuredCount === 0) {
    return `Nothing in the set yet. You have ${pluralMinutes(slotMinutes)} to fill.`;
  }

  const unmeasured = summary.unmeasuredCount;

  if (summary.fit === 'over') {
    return summary.isPartial
      ? `Already ${overBy} over ${slotMinutes}, and ${unmeasured} ${
          unmeasured === 1 ? 'song still needs' : 'songs still need'
        } a length.`
      : `You are ${overBy} over ${slotMinutes}.`;
  }

  // Under on what can be seen, but not everything can be seen. Says what to do
  // rather than what is wrong: the fix is one field away on the row.
  if (summary.isPartial) {
    return unmeasured === 1
      ? 'Add a length to 1 song to see if the set fits.'
      : `Add lengths to ${unmeasured} songs to see if the set fits.`;
  }

  if (summary.fit === 'on_time') {
    return `Right on ${pluralMinutes(slotMinutes)}.`;
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

/** Filesystems cap a file name at 255 BYTES (not characters), and a phone
 *  saving a download refuses a longer one outright. Kept well under, since a
 *  title in Yoruba, Arabic or Japanese is two or three bytes a letter. */
const MAX_PACK_FILE_NAME_BYTES = 200;

const utf8Length = (value: string): number => new TextEncoder().encode(value).length;

/** Cut to at most `maxBytes` of UTF-8, at a whole character, never through
 *  the middle of one (an emoji or an accented letter split in two is a name
 *  a zip tool rejects). */
function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8Length(value) <= maxBytes) return value;
  let out = '';
  let used = 0;
  for (const char of value) {
    const size = utf8Length(char);
    if (used + size > maxBytes) break;
    out += char;
    used += size;
  }
  return out.trimEnd();
}

export type PackFileNameInput = {
  /** 1-based place in the set. */
  position: number;
  /** How many songs the pack holds, so the number can be padded to sort. Two
   *  digits covers 99 songs; past that it widens, or "100" would sort before
   *  "99" in a folder. Optional: two digits when absent. */
  totalTracks?: number;
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
  const total = Math.max(position, Math.round(input.totalTracks ?? 0));
  const width = Math.max(2, String(total).length);
  const order = String(position).padStart(width, '0');

  let artist = sanitizeFilePart(input.artistName) || 'Unknown artist';
  let title = sanitizeFilePart(input.songTitle) || 'Untitled';

  let suffix = '';
  if (input.versionLabel && isSongVersionLabel(input.versionLabel)) {
    suffix += ` (${SONG_VERSION_LABEL_COPY[input.versionLabel]})`;
  }

  if (typeof input.bpm === 'number' && Number.isFinite(input.bpm) && input.bpm > 0) {
    suffix += `[${Math.round(input.bpm)}BPM]`;
  }

  const key = input.musicalKey ? sanitizeFilePart(input.musicalKey) : '';
  if (key) suffix += `[${key}]`;

  const extension = sanitizeFilePart((input.extension ?? '').replace(/^\.+/, '').toLowerCase());
  if (extension) suffix += `.${extension}`;

  // Too long for a filesystem: shorten the artist first (it is on every file
  // in the folder), then the title, which is the part that identifies the
  // track, so it keeps as much as it can.
  const fixed = utf8Length(`${order}  - ${suffix}`);
  if (fixed + utf8Length(artist) + utf8Length(title) > MAX_PACK_FILE_NAME_BYTES) {
    artist = truncateUtf8(artist, 48) || 'Unknown artist';
    title = truncateUtf8(title, Math.max(16, MAX_PACK_FILE_NAME_BYTES - fixed - utf8Length(artist))) || 'Untitled';
  }

  return `${order} ${artist} - ${title}${suffix}`;
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

/** What a person sees for the rows that are not songs, and the length each
 *  starts at when added. One definition, read by the set builder's chips, the
 *  DJ's pack page and the UrgAns tools, so a break is called the same thing on
 *  every screen it appears on. */
export const NON_SONG_ITEM_COPY: Record<Exclude<SetlistItemType, 'song'>, string> = {
  talk: 'Talk',
  interlude: 'Interlude',
  break: 'Break',
};

export const NON_SONG_ITEM_DEFAULT_SECONDS: Record<Exclude<SetlistItemType, 'song'>, number> = {
  talk: 60,
  interlude: 90,
  break: 60,
};

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
        message: 'Give a length under twenty minutes, like 3:30.',
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
  currentType: SetlistItemType,
  /** The stored row's own length. When given, a row that becomes (or stays) a
   *  talk, interlude or break must end up with a length — it has no song to
   *  borrow one from, so without one it would silently count as nothing. */
  currentDurationSeconds?: number | null
): { errors: SetlistFieldError[]; columns: SetlistItemColumns } {
  const result = parseSetlistItemFields(input, false);
  if (result.errors.length > 0) return result;

  if (Object.keys(result.columns).length === 0) {
    return { errors: [{ field: 'body', message: 'Nothing to save.' }], columns: {} };
  }

  const nextType = result.columns.item_type ?? currentType;

  if (nextType !== 'song') {
    const nextDuration =
      result.columns.duration_seconds === undefined
        ? currentDurationSeconds
        : result.columns.duration_seconds;
    const known = currentDurationSeconds !== undefined || result.columns.duration_seconds !== undefined;
    if (known && !isUsableDuration(nextDuration)) {
      result.errors.push({
        field: 'durationSeconds',
        message: `This ${NON_SONG_ITEM_COPY[nextType].toLowerCase()} needs a length.`,
      });
      return result;
    }
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
