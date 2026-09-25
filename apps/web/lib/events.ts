/**
 * Events: the pure half. Validation, enums and the seeded run of show.
 *
 * Kept out of the route group so vitest can reach it (config collects
 * `lib/**` and `app/**`, and this repo's convention is that decision logic
 * lives in lib/ with the route as a thin caller — see lib/billing-plans.ts's
 * resolveCheckoutPurchase for the same split).
 *
 * No React, no I/O, no env.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums (mirror supabase/migrations/20260830120000_events.sql)
// ─────────────────────────────────────────────────────────────────────────────

export const EVENT_STATUSES = ['draft', 'confirmed', 'done', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const isEventStatus = (value: unknown): value is EventStatus =>
  typeof value === 'string' && (EVENT_STATUSES as readonly string[]).includes(value);

/**
 * What a person reads. The values stay as the database enum; the words are a
 * manager's words (founder brief, 2026-09-25): a show not yet confirmed is
 * "pencilled in", which is what a booker says, and "Draft" was a word for a
 * document. A show that happened "played".
 */
export const EVENT_STATUS_COPY: Record<EventStatus, string> = {
  draft: 'Pencilled in',
  confirmed: 'Confirmed',
  done: 'Played',
  cancelled: 'Cancelled',
};

/**
 * The statuses a manager chooses between. "Played" is not one of them: whether
 * a show is in the past is a fact the date already knows, so asking someone to
 * mark it would only create shows that are "upcoming" last month. Rows that
 * already carry 'done' still read correctly through EVENT_STATUS_COPY.
 */
export const SELECTABLE_EVENT_STATUSES: readonly EventStatus[] = ['draft', 'confirmed', 'cancelled'];

/**
 * The one word a list row shows beside a show, or null for none.
 *
 * Only the two states that need attention earn a badge: pencilled in (still to
 * confirm) and cancelled. A confirmed show is the normal case, and labelling
 * every normal row is how a list turns into noise.
 */
export function showStatusBadge(status: EventStatus): string | null {
  if (status === 'draft' || status === 'cancelled') return EVENT_STATUS_COPY[status];
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Limits
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_EVENT_TITLE_LENGTH = 120;
export const MAX_EVENT_TEXT_LENGTH = 200;
export const MAX_EVENT_NOTES_LENGTH = 2000;

/** Matches the CHECK on events.set_length_minutes. Ten hours is absurd for a
 *  set and that is the point: it is a guard against a typo, not a real
 *  ceiling anyone will meet. */
export const MIN_SET_LENGTH_MINUTES = 1;
export const MAX_SET_LENGTH_MINUTES = 600;

/** What a promoter most often gives you, and a sane default for a new show. */
export const DEFAULT_SET_LENGTH_MINUTES = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Timezone
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A set time is meaningless without the venue's zone, and this is the first
 * place in the schema that takes timezones seriously (task due dates elsewhere
 * store naive local wall-clock strings — known sloppiness that must not be
 * copied here). So the zone is validated rather than trusted.
 *
 * Asks the platform instead of shipping a list: Intl throws RangeError on an
 * unknown zone, which is both the check and the definition. A list would be
 * wrong the next time the IANA database moves a city.
 */
export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    formatterFor('numeric', value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Intl formatters are slow to build and cheap to reuse, and a shows list reads
 * every date through several of them. One per zone and shape, built on first
 * use. A zone that throws is never stored, so it keeps failing the same way.
 * Bounded by the number of real zones, since only a zone that works is kept.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(kind: 'numeric' | 'words', zone: string): Intl.DateTimeFormat {
  const key = `${kind}:${zone}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const formatter =
    kind === 'numeric'
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: zone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : new Intl.DateTimeFormat('en-GB', {
          timeZone: zone,
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });
  formatterCache.set(key, formatter);
  return formatter;
}

/** The founder's own market. A manager in Lagos should not have to pick this
 *  on every show; anyone elsewhere changes it once per event. */
export const DEFAULT_TIMEZONE = 'Africa/Lagos';

const TIMEZONE_REGION_NAMES: Record<string, string> = {
  Africa: 'Africa',
  America: 'Americas',
  Antarctica: 'Antarctica',
  Arctic: 'Arctic',
  Asia: 'Asia',
  Atlantic: 'Atlantic',
  Australia: 'Australia',
  Europe: 'Europe',
  Indian: 'Indian Ocean',
  Pacific: 'Pacific',
};

export type TimezoneGroup = { region: string; zones: { value: string; label: string }[] };

/**
 * IANA zones grouped by region for a picker, each labelled the way a person
 * says it: "Lagos", "Argentina / Buenos Aires". Replaced a free-text field
 * where a manager had to type "Africa/Lagos" exactly or be refused.
 *
 * Anything outside the named regions ("UTC", "Etc/…") lands in "Other", last.
 * `current` is always included, so an unusual saved zone is never silently
 * swapped for the first option.
 */
export function groupTimezones(zones: readonly string[], current?: string): TimezoneGroup[] {
  const all = new Set(zones.filter((zone) => typeof zone === 'string' && zone.trim()));
  if (current && current.trim()) all.add(current);

  const groups = new Map<string, { value: string; label: string }[]>();
  for (const zone of all) {
    const [head, ...rest] = zone.split('/');
    const region = rest.length > 0 && TIMEZONE_REGION_NAMES[head] ? TIMEZONE_REGION_NAMES[head] : 'Other';
    const label = (rest.length > 0 && TIMEZONE_REGION_NAMES[head] ? rest.join(' / ') : zone).replace(/_/g, ' ');
    groups.set(region, [...(groups.get(region) || []), { value: zone, label }]);
  }

  const order = [...Object.values(TIMEZONE_REGION_NAMES), 'Other'];
  return order
    .filter((region) => groups.has(region))
    .map((region) => ({
      region,
      zones: (groups.get(region) || []).sort((a, b) => a.label.localeCompare(b.label)),
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Run of show
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seeded on every new event, in running order. All editable, all deletable —
 * a show with no soundcheck is a real show. They exist so a manager fills in
 * times rather than inventing the list, which is the same reason the release
 * playbooks ship as templates.
 *
 * "Set start" is deliberately in the list even though events.set_start_at
 * already holds it: the run of show is what a tour manager reads top to
 * bottom, and a gap where the set should be would be the one thing it must
 * never omit.
 */
export const DEFAULT_RUN_OF_SHOW_LABELS = [
  'Call time',
  'Soundcheck',
  'Doors',
  'Set start',
  'Set end',
  'Load out',
] as const;

export const buildDefaultRunOfShow = (): { label: string; position: number }[] =>
  DEFAULT_RUN_OF_SHOW_LABELS.map((label, index) => ({ label, position: index }));

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export type FieldError = { field: string; message: string };

/** Every field an event write may carry. All optional: create supplies what it
 *  has, and PATCH is sparse (see parseEventPatch). */
export type EventInput = {
  title?: unknown;
  venueName?: unknown;
  city?: unknown;
  country?: unknown;
  timezone?: unknown;
  setStartAt?: unknown;
  setLengthMinutes?: unknown;
  stage?: unknown;
  promoterName?: unknown;
  promoterPhone?: unknown;
  status?: unknown;
  notes?: unknown;
};

/** Column values ready for Supabase. snake_case, matching the table. */
export type EventColumns = {
  title?: string;
  venue_name?: string | null;
  city?: string | null;
  country?: string | null;
  timezone?: string;
  set_start_at?: string | null;
  set_length_minutes?: number;
  stage?: string | null;
  promoter_name?: string | null;
  promoter_phone?: string | null;
  status?: EventStatus;
  notes?: string | null;
};

const trimmedOrNull = (value: unknown, max: number): { ok: true; value: string | null } | { ok: false } => {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed || null };
};

/**
 * Shared field parsing for create and patch.
 *
 * `require` names the fields that must be present and valid. Anything absent
 * from `input` is simply not written — which is what makes PATCH sparse, and
 * deliberately unlike the release PATCH handler, whose full-row-replace
 * behaviour means a partial body nulls whatever it omits (documented in
 * lib/chappi/tool-families/releases.ts as a trap needing a read-then-merge).
 * A new object should not inherit an old mistake.
 */
export function parseEventFields(
  input: EventInput,
  options: { require: readonly ('title' | 'timezone' | 'setLengthMinutes')[] }
): { errors: FieldError[]; columns: EventColumns } {
  const errors: FieldError[] = [];
  const columns: EventColumns = {};
  const has = (key: keyof EventInput) => Object.prototype.hasOwnProperty.call(input, key);

  if (has('title') || options.require.includes('title')) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) {
      errors.push({ field: 'title', message: 'Give the show a name.' });
    } else if (title.length > MAX_EVENT_TITLE_LENGTH) {
      errors.push({
        field: 'title',
        message: `Keep the name under ${MAX_EVENT_TITLE_LENGTH} characters.`,
      });
    } else {
      columns.title = title;
    }
  }

  const textFields: [keyof EventInput, keyof EventColumns, string][] = [
    ['venueName', 'venue_name', 'venue'],
    ['city', 'city', 'city'],
    ['country', 'country', 'country'],
    ['stage', 'stage', 'stage'],
    ['promoterName', 'promoter_name', 'promoter name'],
    ['promoterPhone', 'promoter_phone', 'promoter phone'],
  ];

  for (const [inputKey, columnKey, label] of textFields) {
    if (!has(inputKey)) continue;
    const parsed = trimmedOrNull(input[inputKey], MAX_EVENT_TEXT_LENGTH);
    if (!parsed.ok) {
      errors.push({
        field: String(inputKey),
        message: `That ${label} is too long.`,
      });
      continue;
    }
    (columns as Record<string, unknown>)[columnKey] = parsed.value;
  }

  if (has('notes')) {
    const parsed = trimmedOrNull(input.notes, MAX_EVENT_NOTES_LENGTH);
    if (!parsed.ok) {
      errors.push({ field: 'notes', message: 'Those notes are too long.' });
    } else {
      columns.notes = parsed.value;
    }
  }

  if (has('timezone') || options.require.includes('timezone')) {
    if (!isValidTimezone(input.timezone)) {
      errors.push({
        field: 'timezone',
        message: 'That is not a timezone we recognise. Try Africa/Lagos.',
      });
    } else {
      columns.timezone = input.timezone;
    }
  }

  if (has('setLengthMinutes') || options.require.includes('setLengthMinutes')) {
    const minutes = input.setLengthMinutes;
    if (
      typeof minutes !== 'number' ||
      !Number.isInteger(minutes) ||
      minutes < MIN_SET_LENGTH_MINUTES ||
      minutes > MAX_SET_LENGTH_MINUTES
    ) {
      errors.push({
        field: 'setLengthMinutes',
        message: `Give the set a length between ${MIN_SET_LENGTH_MINUTES} and ${MAX_SET_LENGTH_MINUTES} minutes.`,
      });
    } else {
      columns.set_length_minutes = minutes;
    }
  }

  if (has('setStartAt')) {
    const raw = input.setStartAt;
    if (raw === null || raw === '') {
      columns.set_start_at = null;
    } else if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
      errors.push({ field: 'setStartAt', message: 'That start time is not a real date.' });
    } else {
      columns.set_start_at = new Date(raw).toISOString();
    }
  }

  if (has('status')) {
    if (!isEventStatus(input.status)) {
      errors.push({ field: 'status', message: 'That is not a status a show can be in.' });
    } else {
      columns.status = input.status;
    }
  }

  return { errors, columns };
}

/** Create: title is required; timezone and set length fall back to defaults
 *  rather than being demanded, because "we got the Lagos show" should take one
 *  field to record and the rest can be filled in later. */
export function parseEventCreate(input: EventInput): {
  errors: FieldError[];
  columns: EventColumns;
} {
  const withDefaults: EventInput = {
    timezone: DEFAULT_TIMEZONE,
    setLengthMinutes: DEFAULT_SET_LENGTH_MINUTES,
    ...input,
  };
  return parseEventFields(withDefaults, { require: ['title', 'timezone', 'setLengthMinutes'] });
}

/** Patch: nothing is required, and an empty patch is refused rather than
 *  silently succeeding — a no-op write usually means a client bug. */
export function parseEventPatch(input: EventInput): {
  errors: FieldError[];
  columns: EventColumns;
} {
  const result = parseEventFields(input, { require: [] });
  if (result.errors.length === 0 && Object.keys(result.columns).length === 0) {
    return { errors: [{ field: 'body', message: 'Nothing to save.' }], columns: {} };
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Display
// ─────────────────────────────────────────────────────────────────────────────

/** A wall clock, read in a zone. `date` is 'YYYY-MM-DD', `time` 'HH:MM'. */
export type LocalParts = {
  date: string;
  time: string;
  year: string;
  weekday: string;
  day: string;
  month: string;
};

/**
 * What an instant reads as on a clock in `zone`, or null when either is
 * unusable. The one place a Shows date is broken into parts, so the list, the
 * show page, the run of show and the DJ's page cannot each format a date their
 * own way.
 */
export function localPartsInZone(iso: string | null | undefined, zone: string): LocalParts | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const safeZone = isValidTimezone(zone) ? zone : 'UTC';
  try {
    const numeric = formatterFor('numeric', safeZone).formatToParts(date);
    const words = formatterFor('words', safeZone).formatToParts(date);
    const pick = (parts: Intl.DateTimeFormatPart[], type: string) =>
      parts.find((part) => part.type === type)?.value ?? '';
    // Intl renders midnight as 24 in some environments.
    const hour = pick(numeric, 'hour') === '24' ? '00' : pick(numeric, 'hour');
    return {
      date: `${pick(numeric, 'year')}-${pick(numeric, 'month')}-${pick(numeric, 'day')}`,
      time: `${hour}:${pick(numeric, 'minute')}`,
      year: pick(numeric, 'year'),
      weekday: pick(words, 'weekday'),
      day: pick(words, 'day'),
      month: pick(words, 'month'),
    };
  } catch {
    return null;
  }
}

/** Calendar days from `fromDate` to `toDate`, both 'YYYY-MM-DD'. */
export function daysBetweenLocalDates(fromDate: string, toDate: string): number | null {
  const read = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN;
  };
  const from = read(fromDate);
  const to = read(toDate);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/**
 * A set time, in the VENUE'S zone.
 *
 * Never the viewer's. A manager in Lagos checking a London show has to read the
 * time the artist walks on stage there, and a tour manager opening the same
 * show from a plane must see the identical string. That is the entire reason
 * events.timezone exists and is not nullable.
 *
 * "Sat 20 Dec, 21:30". The YEAR appears only when it is not this year (in the
 * venue's zone), because "Sat 20 Dec" alone is ambiguous exactly when a show is
 * booked a year out, or a list reaches back into last year. Built from parts
 * rather than one locale string so the two shapes match: en-GB adds a comma
 * after the weekday when a year is present, and the list must not change
 * punctuation from row to row.
 *
 * No date reads "Date to confirm"; asking for the time alone reads "Time to
 * confirm". A broken zone falls back to UTC rather than throwing, so it
 * degrades one line, not the page.
 */
export function formatShowDateTime(
  iso: string | null | undefined,
  timezone: string,
  options?: { includeDate?: boolean; includeTime?: boolean; now?: Date }
): string {
  const includeDate = options?.includeDate !== false;
  const includeTime = options?.includeTime !== false;
  const missing = includeDate ? 'Date to confirm' : 'Time to confirm';

  const parts = localPartsInZone(iso, timezone);
  if (!parts) return missing;

  if (!includeDate) return parts.time;

  const now = localPartsInZone((options?.now ?? new Date()).toISOString(), timezone);
  const showYear = now && now.year !== parts.year ? ` ${parts.year}` : '';
  const day = `${parts.weekday} ${parts.day} ${parts.month}${showYear}`;
  return includeTime ? `${day}, ${parts.time}` : day;
}

/**
 * "Today", "Tomorrow" or "Yesterday" for a show, judged in the VENUE'S zone, or
 * null for any other day. The venue's zone because "tonight" means tonight
 * where the artist is playing; a manager in Lagos looking at a London show at
 * 00:30 Lagos time should still read "Today" for the show that starts at 22:00
 * London.
 */
export function relativeShowDay(
  iso: string | null | undefined,
  timezone: string,
  now: Date = new Date()
): 'Today' | 'Tomorrow' | 'Yesterday' | null {
  const show = localPartsInZone(iso, timezone);
  const today = localPartsInZone(now.toISOString(), timezone);
  if (!show || !today) return null;
  const days = daysBetweenLocalDates(today.date, show.date);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return null;
}

/** The calendar tile on a list row: "DEC / 20 / Sat", plus the year when it is
 *  not this year. Null when the show has no date. */
export function showDateTile(
  iso: string | null | undefined,
  timezone: string,
  now: Date = new Date()
): { month: string; day: string; weekday: string; year: string | null } | null {
  const parts = localPartsInZone(iso, timezone);
  if (!parts) return null;
  const today = localPartsInZone(now.toISOString(), timezone);
  return {
    month: parts.month,
    day: parts.day,
    weekday: parts.weekday,
    year: today && today.year !== parts.year ? parts.year : null,
  };
}

/** "Africa/Lagos" reads as "Lagos" to a human. The zone is shown next to every
 *  set time so nobody has to wonder whose clock it is. */
export function shortTimezoneLabel(timezone: string): string {
  if (!timezone) return '';
  const tail = timezone.split('/').pop() || timezone;
  return tail.replace(/_/g, ' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Wall-clock entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads a `datetime-local` value AS A WALL CLOCK IN `zone`, and returns the
 * real instant.
 *
 * A datetime-local input carries no zone, so `new Date(value)` interprets it in
 * the BROWSER'S zone — which is wrong for every show a manager books outside
 * the city they are sitting in, and silently so. There is no platform API for
 * "parse in this zone", so this measures the zone's offset instead, a day
 * either side of the wall clock, and keeps whichever candidate really reads
 * back as the clock that was typed.
 *
 * A wall clock can mean two instants or none. On the night the clocks go
 * back, 01:30 happens twice; on the night they jump forward, 02:30 never
 * happens at all, though a manager can still type it. Both are resolved the
 * way calendars resolve them (the iCalendar and Temporal "compatible" rule),
 * and the same way in every zone:
 *
 * - A time that happens twice is the FIRST one.
 * - A time that never happens moves FORWARD by the length of the jump, so
 *   02:30 becomes 03:30. A stage time pushed later is a problem somebody
 *   notices; one pulled earlier is an artist who missed their slot.
 *
 * Until 2026-09-25 this was an iterative correction that measured forward in
 * zones east of Greenwich and BACKWARD west of it, so every show in the
 * Americas typed inside the skipped hour landed an hour early.
 * lib/events-time.test.ts now checks 45 zones, every hour, on each
 * hemisphere's clock-change days.
 */
export function toIsoInZone(localValue: string, zone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localValue);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number) as unknown as number[];
  const wanted = Date.UTC(year, month - 1, day, hour, minute);

  // The zone's offset a day either side. No real zone changes its offset twice
  // inside 48 hours, so these are the only two offsets this wall clock can
  // mean, and they are the same number on every ordinary day.
  const before = offsetAt(wanted - DAY_MS, zone);
  const after = offsetAt(wanted + DAY_MS, zone);
  if (before === null || after === null) return new Date(wanted).toISOString();

  const real = [wanted - before, wanted - after].filter(
    (instant) => wallClockUtc(new Date(instant), zone) === wanted
  );
  if (real.length > 0) return new Date(Math.min(...real)).toISOString();

  // Neither offset produces this wall clock: it is inside the skipped hour.
  // The offset from before the jump lands it the length of the jump later.
  return new Date(wanted - before).toISOString();
}

const DAY_MS = 86_400_000;

/** How far `zone` is ahead of UTC at `instant`, in milliseconds. */
function offsetAt(instant: number, zone: string): number | null {
  const seen = wallClockUtc(new Date(instant), zone);
  return seen === null ? null : seen - instant;
}

/** What `date` reads as on a clock in `zone`, expressed as a UTC timestamp so
 *  two wall clocks can be subtracted. Null if the zone is unusable. */
function wallClockUtc(date: Date, zone: string): number | null {
  try {
    const parts = formatterFor('numeric', zone).formatToParts(date);

    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? NaN);
    const hour = read('hour');
    return Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      // Intl renders midnight as 24 in some environments.
      hour === 24 ? 0 : hour,
      read('minute')
    );
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Series — a festival is several linked single shows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Design-partner ask (2026-09-02): "a show with 7 days, 120 minutes each" and
 * "different artists with their own set, for a single festival." Founder call:
 * model it as ONE `events` ROW PER ARTIST PER DAY, linked by a series id, not
 * as a festival object with days and a lineup. Each row keeps one artist, one
 * slot and its own setlists, so the setlist builder's per-artist song catalog
 * and the DJ pack per set keep working with no special cases — and the events
 * spec's line ("Events cover a single show") still holds. Schema notes in the
 * header of 20260902100000_events_series.sql.
 */

/** Two weeks is generous for any festival run; beyond it is a typo. */
export const MAX_SERIES_DAYS = 14;

/** days × artists. A guard against a slip, not a ceiling anyone meets: 7 days
 *  of 8 artists is 56 rows. */
export const MAX_SERIES_SHOWS = 60;

export type SeriesCreateInput = {
  seriesTitle?: unknown;
  artistIds?: unknown;
  days?: unknown;
  /** A `datetime-local` string for DAY 1, read in `timezone` (see
   *  toIsoInZone). Every later day is the same wall clock, one day on. */
  firstDayLocalStart?: unknown;
  timezone?: unknown;
  setLengthMinutes?: unknown;
  venueName?: unknown;
  city?: unknown;
};

export type SeriesCreate = {
  seriesTitle: string;
  /** Deduplicated, in the order given. Never empty. */
  artistIds: string[];
  days: number;
  firstDayLocalStart: string | null;
  timezone: string;
  setLengthMinutes: number;
  venueName: string | null;
  city: string | null;
};

const LOCAL_WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * Validate a series booking. Reuses parseEventFields for every field a single
 * show also carries, so the messages and limits cannot drift between the two
 * forms; only artists, days and the day-1 wall clock are new.
 */
export function parseSeriesCreate(input: SeriesCreateInput): {
  errors: FieldError[];
  value: SeriesCreate | null;
} {
  const shared = parseEventFields(
    {
      title: input.seriesTitle,
      venueName: input.venueName ?? null,
      city: input.city ?? null,
      timezone: input.timezone ?? DEFAULT_TIMEZONE,
      setLengthMinutes: input.setLengthMinutes ?? DEFAULT_SET_LENGTH_MINUTES,
    },
    { require: ['title', 'timezone', 'setLengthMinutes'] }
  );
  const errors: FieldError[] = shared.errors.map((error) =>
    error.field === 'title'
      ? { field: 'seriesTitle', message: 'Give the festival a name.' }
      : error
  );

  const artistIds = Array.isArray(input.artistIds)
    ? Array.from(
        new Set(
          input.artistIds
            .filter((id): id is string => typeof id === 'string')
            .map((id) => id.trim())
            .filter(Boolean)
        )
      )
    : [];
  if (artistIds.length === 0) {
    errors.push({ field: 'artistIds', message: 'Pick at least one artist.' });
  }

  const days = input.days;
  const daysOk =
    typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= MAX_SERIES_DAYS;
  if (!daysOk) {
    errors.push({
      field: 'days',
      message: `How many days? Between 1 and ${MAX_SERIES_DAYS}.`,
    });
  } else if (artistIds.length > 0 && days * artistIds.length > MAX_SERIES_SHOWS) {
    errors.push({
      field: 'days',
      message: `That is ${days * artistIds.length} shows at once. Keep it to ${MAX_SERIES_SHOWS} and book the rest as a second series.`,
    });
  }

  let firstDayLocalStart: string | null = null;
  const rawStart = input.firstDayLocalStart;
  if (rawStart !== undefined && rawStart !== null && rawStart !== '') {
    if (typeof rawStart === 'string' && LOCAL_WALL_CLOCK.test(rawStart)) {
      firstDayLocalStart = rawStart;
    } else {
      errors.push({ field: 'firstDayLocalStart', message: 'That start time is not a real date.' });
    }
  }

  if (errors.length > 0) return { errors, value: null };

  return {
    errors: [],
    value: {
      seriesTitle: shared.columns.title as string,
      artistIds,
      days: days as number,
      firstDayLocalStart,
      timezone: shared.columns.timezone as string,
      setLengthMinutes: shared.columns.set_length_minutes as number,
      venueName: shared.columns.venue_name ?? null,
      city: shared.columns.city ?? null,
    },
  };
}

/**
 * Each member's own title stays a complete sentence, so a show read alone (the
 * detail page, a DJ pack header) needs no lookup. A colon, not a dash — the
 * house copy rule. The artist is NOT repeated here: it is already every row's
 * eyebrow. A one-day series (several artists, one night) keeps the bare title,
 * because "Day 1" of one day is noise.
 */
export function buildSeriesShowTitle(seriesTitle: string, day: number, totalDays: number): string {
  return totalDays > 1 ? `${seriesTitle}: Day ${day}` : seriesTitle;
}

/**
 * Adds calendar days to a `datetime-local` string AS A WALL CLOCK, so "11:00
 * every day" stays 11:00 across a daylight-saving change. Adding 24h to the
 * instant instead would shift every post-transition day by an hour — exactly
 * the silent set-time error events.timezone exists to prevent. Feed the result
 * to toIsoInZone with the venue's zone to get the real instant.
 */
export function shiftLocalDays(localValue: string, days: number): string | null {
  const match = LOCAL_WALL_CLOCK.exec(localValue);
  if (!match || !Number.isInteger(days)) return null;
  const [, year, month, day, hour, minute] = match.map(Number) as unknown as number[];
  const shifted = new Date(Date.UTC(year, month - 1, day + days, hour, minute));
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Upcoming and past
// ─────────────────────────────────────────────────────────────────────────────

/** The slice of a show the upcoming/past split reads. Structural, so the list
 *  page, the UrgAns tools and a test can all hand in what they have. */
export type SchedulableShow = {
  setStartAt: string | null;
  setLengthMinutes: number;
};

/**
 * When a show stops being "coming up": the END of its set, not the start.
 *
 * A show that started twenty minutes ago is happening, not over, and filing it
 * under Past while the artist is still on stage reads as the product losing
 * track of tonight. Null when there is no usable start time.
 */
export function showEndsAtMs(show: SchedulableShow): number | null {
  if (!show.setStartAt) return null;
  const start = Date.parse(show.setStartAt);
  if (Number.isNaN(start)) return null;
  const minutes =
    Number.isFinite(show.setLengthMinutes) && show.setLengthMinutes > 0 ? show.setLengthMinutes : 0;
  return start + minutes * 60_000;
}

/** Sort key. A show with no time sorts to the front of the upcoming half: an
 *  unconfirmed set time is the most urgent thing on the list. */
function upcomingRank(show: SchedulableShow): number {
  if (!show.setStartAt) return -Infinity;
  const at = Date.parse(show.setStartAt);
  return Number.isNaN(at) ? -Infinity : at;
}

/**
 * Split a show list into what is still coming and what has been and gone.
 *
 * ONE RULE for every surface. It lived in the UrgAns tool family until
 * 2026-09-25, while the shows list sorted past-first straight off the API, so
 * the assistant and the screen disagreed about what "next" meant. Both read
 * this now.
 *
 * - No set time: UPCOMING, and first. The promoter has not confirmed a time,
 *   which is a thing to chase rather than a thing to archive.
 * - Otherwise upcoming until the set has ENDED (see showEndsAtMs).
 * - Cancelled shows stay in whichever half their date puts them — they are
 *   still the answer to "what was on that weekend".
 * - An unparseable date counts as upcoming rather than vanishing.
 */
export function partitionShows<T extends SchedulableShow>(
  events: readonly T[],
  now: Date = new Date()
): { upcoming: T[]; past: T[] } {
  const cutoff = now.getTime();
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const event of events) {
    const ends = showEndsAtMs(event);
    if (ends === null || ends >= cutoff) upcoming.push(event);
    else past.push(event);
  }
  // Soonest first for what is coming, most recent first for what is done —
  // both orders answer "and then what?" from where the reader is standing.
  upcoming.sort((a, b) => upcomingRank(a) - upcomingRank(b));
  past.sort((a, b) => upcomingRank(b) - upcomingRank(a));
  return { upcoming, past };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rescheduling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How far a show moved, in milliseconds, or null when nothing should follow.
 *
 * Null when either side is missing or unreadable, and when the time did not
 * actually change. Only a real move from one date to another carries the run of
 * show with it: a show gaining its first date has no run-of-show times to move
 * (they cannot be set without a date), and a show losing its date keeps them
 * rather than inventing where they went.
 */
export function computeRescheduleDeltaMs(
  previousIso: string | null | undefined,
  nextIso: string | null | undefined
): number | null {
  if (!previousIso || !nextIso) return null;
  const previous = Date.parse(previousIso);
  const next = Date.parse(nextIso);
  if (Number.isNaN(previous) || Number.isNaN(next)) return null;
  const delta = next - previous;
  return delta === 0 ? null : delta;
}

/** One instant moved by `deltaMs`, or null for an unreadable input. Moving by
 *  the instant keeps every run-of-show step at the same distance from the set,
 *  which is what a rescheduled night actually is. */
export function shiftIsoByMs(iso: string | null | undefined, deltaMs: number): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at) || !Number.isFinite(deltaMs)) return null;
  return new Date(at + deltaMs).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Run of show
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_RUN_OF_SHOW_LABEL_LENGTH = 80;

/** A night has perhaps a dozen steps. Thirty is a guard against a slip. */
export const MAX_RUN_OF_SHOW_STEPS = 30;

export function parseRunOfShowLabel(value: unknown): { label: string } | { error: string } {
  if (typeof value !== 'string' || !value.trim()) return { error: 'Give the step a name.' };
  const label = value.trim().replace(/\s+/g, ' ');
  if (label.length > MAX_RUN_OF_SHOW_LABEL_LENGTH) {
    return { error: `Keep the name under ${MAX_RUN_OF_SHOW_LABEL_LENGTH} characters.` };
  }
  return { label };
}

/** A step's time: an ISO instant, or null to clear it. */
export function parseRunOfShowAt(value: unknown): { at: string | null } | { error: string } {
  if (value === null || value === '') return { at: null };
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return { error: 'That time is not a real time.' };
  }
  return { at: new Date(value).toISOString() };
}

/**
 * The two seeded steps that ARE the set: "Set start" and "Set end".
 *
 * Left untimed, they show the show's own times rather than a blank, so the run
 * of show a tour manager reads top to bottom never has a gap where the set
 * should be, and there is one set time to keep right rather than two that can
 * disagree. Renaming one makes it an ordinary step.
 */
export function setBoundaryOf(label: string): 'start' | 'end' | null {
  const normal = label.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normal === 'set start') return 'start';
  if (normal === 'set end') return 'end';
  return null;
}

/** The slice of a run-of-show row these helpers read. */
export type RunOfShowRow = { id: string; label: string; at: string | null; position: number };

export type RunOfShowDisplayRow<T extends RunOfShowRow> = T & {
  /** The instant shown: the step's own, or for an untimed Set start or Set end,
   *  the show's. Null when there is nothing to show yet. */
  shownAt: string | null;
  /** True when shownAt comes from the show rather than the step. */
  followsShow: boolean;
};

/**
 * The run of show in the order it happens.
 *
 * Steps with a time sort by that time; steps without one stay where they are.
 * That is the order a person would put them in by hand: a manager who has
 * timed doors and soundcheck wants them in time order, and an untimed "Load
 * out" should not jump to the top just because it has no time yet. Timed steps
 * are re-sorted into the places timed steps already held, which is what keeps
 * each untimed step in its slot.
 */
export function orderRunOfShow<T extends RunOfShowRow>(
  rows: readonly T[],
  show: SchedulableShow
): RunOfShowDisplayRow<T>[] {
  const valid = (iso: string | null) => Boolean(iso) && !Number.isNaN(Date.parse(iso as string));
  const startIso = valid(show.setStartAt) ? new Date(show.setStartAt as string).toISOString() : null;
  const endMs = startIso ? showEndsAtMs(show) : null;

  const byPosition = [...rows].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const display: RunOfShowDisplayRow<T>[] = byPosition.map((row) => {
    if (valid(row.at)) {
      return { ...row, shownAt: new Date(row.at as string).toISOString(), followsShow: false };
    }
    const boundary = setBoundaryOf(row.label);
    if (boundary === 'start' && startIso) return { ...row, shownAt: startIso, followsShow: true };
    if (boundary === 'end' && endMs !== null) {
      return { ...row, shownAt: new Date(endMs).toISOString(), followsShow: true };
    }
    return { ...row, shownAt: null, followsShow: false };
  });

  const slots = display.flatMap((row, index) => (row.shownAt ? [index] : []));
  const timed = slots
    .map((index) => display[index])
    .sort((a, b) => Date.parse(a.shownAt as string) - Date.parse(b.shownAt as string));
  const ordered = [...display];
  slots.forEach((slot, rank) => {
    ordered[slot] = timed[rank];
  });
  return ordered;
}

/**
 * A step's time as a person reads it next to the show: the wall clock in the
 * venue's zone, and how many days from the show's day it falls on (a call time
 * the day before is -1, a load out after midnight is +1). The offset is null
 * when the show has no date to measure from.
 */
export function describeRunOfShowTime(
  atIso: string | null | undefined,
  showStartIso: string | null | undefined,
  timezone: string
): { time: string; dayOffset: number | null } | null {
  const at = localPartsInZone(atIso, timezone);
  if (!at) return null;
  const anchor = localPartsInZone(showStartIso, timezone);
  return {
    time: at.time,
    dayOffset: anchor ? daysBetweenLocalDates(anchor.date, at.date) : null,
  };
}

/** "-1", "+1", "+2", or '' for the show's own day. Written with a real minus
 *  sign, like an airline itinerary. */
export function formatDayOffset(offset: number | null | undefined): string {
  if (!offset || !Number.isFinite(offset)) return '';
  return offset > 0 ? `+${offset}` : `\u2212${Math.abs(offset)}`;
}

/** The same offset in words, for a screen reader and a tooltip. */
export function describeDayOffset(offset: number | null | undefined): string {
  if (!offset || !Number.isFinite(offset)) return 'on the day of the show';
  if (offset === -1) return 'the day before the show';
  if (offset === 1) return 'the day after the show';
  return offset < 0
    ? `${Math.abs(offset)} days before the show`
    : `${offset} days after the show`;
}

/**
 * Where one run-of-show step lands when its show moves.
 *
 * It keeps its WALL CLOCK and its DAY relative to the show: soundcheck at
 * 18:00 on show day is 18:00 on the new show day, and a call time the day
 * before is still the day before. Moving it by however many hours the set
 * moved is right on an ordinary week and an hour out whenever the clocks
 * change between the two dates, because the set and a step the day before can
 * sit on different sides of the change (that was the rule until 2026-09-25).
 * Keeping the wall clock is also what lets a change of zone keep the times a
 * manager sees, which the set time already does.
 *
 * Falls back to moving by the same number of hours when the step cannot be
 * read against the old show, and answers null when nothing should move.
 */
export function rescheduleRunOfShowStep(input: {
  atIso: string | null | undefined;
  previousStartIso: string | null | undefined;
  nextStartIso: string | null | undefined;
  previousTimezone: string;
  nextTimezone: string;
}): string | null {
  const { atIso, previousStartIso, nextStartIso, previousTimezone, nextTimezone } = input;
  if (!atIso || Number.isNaN(Date.parse(atIso))) return null;
  const delta = computeRescheduleDeltaMs(previousStartIso, nextStartIso);
  const zoneChanged = previousTimezone !== nextTimezone;
  if (delta === null && !zoneChanged) return null;

  const read = describeRunOfShowTime(atIso, previousStartIso, previousTimezone);
  if (read && read.dayOffset !== null && nextStartIso) {
    const moved = runOfShowInstant({
      showStartIso: nextStartIso,
      time: read.time,
      dayOffset: read.dayOffset,
      timezone: nextTimezone,
    });
    if (moved) return moved;
  }
  return delta === null ? null : shiftIsoByMs(atIso, delta);
}

/**
 * The real instant for a step typed as a time of day plus a day (-1, 0, +1)
 * relative to the show, read as a wall clock in the venue's zone. Null when
 * the show has no date to anchor to, or the time is not a time.
 */
export function runOfShowInstant(input: {
  showStartIso: string | null | undefined;
  time: string;
  dayOffset: number;
  timezone: string;
}): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(input.time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59 || !Number.isInteger(input.dayOffset)) return null;

  const anchor = localPartsInZone(input.showStartIso, input.timezone);
  if (!anchor) return null;

  const pad = (value: number) => String(value).padStart(2, '0');
  const local = shiftLocalDays(`${anchor.date}T${pad(hour)}:${pad(minute)}`, input.dayOffset);
  return local ? toIsoInZone(local, input.timezone) : null;
}

/** What the shows list renders: a lone show, or a series with its members. */
export type ShowListEntry<T extends SeriesMember> =
  | { kind: 'show'; event: T }
  | {
      kind: 'series';
      seriesId: string;
      title: string;
      /** Distinct, in first-seen order, blanks dropped. */
      artistNames: string[];
      /** Distinct series_day values among the members. */
      days: number;
      /** In day order, then artist name, so the list reads like a schedule. */
      shows: T[];
    };

/** The slice of ShowEvent the grouping needs — kept structural so the list
 *  and any test can hand in plain objects. */
export type SeriesMember = {
  id: string;
  title: string;
  artistName: string;
  seriesId: string | null;
  seriesTitle: string | null;
  seriesDay: number | null;
};

/**
 * Group an already-ordered list (the API returns soonest first) into standalone
 * shows and series. A series takes the position of its FIRST member, so a
 * festival next week still sits above a single show next month.
 */
export function groupShowsBySeries<T extends SeriesMember>(events: readonly T[]): ShowListEntry<T>[] {
  const entries: ShowListEntry<T>[] = [];
  const bySeries = new Map<string, Extract<ShowListEntry<T>, { kind: 'series' }>>();

  for (const event of events) {
    if (!event.seriesId) {
      entries.push({ kind: 'show', event });
      continue;
    }
    let group = bySeries.get(event.seriesId);
    if (!group) {
      group = {
        kind: 'series',
        seriesId: event.seriesId,
        title: event.seriesTitle || event.title,
        artistNames: [],
        days: 0,
        shows: [],
      };
      bySeries.set(event.seriesId, group);
      entries.push(group);
    }
    group.shows.push(event);
    if (event.artistName && !group.artistNames.includes(event.artistName)) {
      group.artistNames.push(event.artistName);
    }
  }

  for (const group of bySeries.values()) {
    group.shows.sort(
      (a, b) =>
        (a.seriesDay ?? 0) - (b.seriesDay ?? 0) || a.artistName.localeCompare(b.artistName)
    );
    group.days = new Set(group.shows.map((show) => show.seriesDay ?? 0)).size;
  }

  return entries;
}

/**
 * The shows list, split into what is coming and what has been, with festivals
 * kept together.
 *
 * A festival counts as upcoming while ANY of its days is still to come, so a
 * seven-day run does not appear twice (three played days under Past, four under
 * Upcoming) with the same name on both cards. It sits in the upcoming half at
 * the place of its next day, and in the past half at the place of its last one.
 */
export function partitionShowList<T extends SeriesMember & SchedulableShow>(
  events: readonly T[],
  now: Date = new Date()
): { upcoming: ShowListEntry<T>[]; past: ShowListEntry<T>[] } {
  const split = partitionShows(events, now);
  const upcomingIds = new Set(split.upcoming.map((event) => event.id));
  const entries = groupShowsBySeries([...split.upcoming, ...split.past]);

  const upcoming: ShowListEntry<T>[] = [];
  const past: ShowListEntry<T>[] = [];
  for (const entry of entries) {
    const isUpcoming =
      entry.kind === 'show'
        ? upcomingIds.has(entry.event.id)
        : entry.shows.some((show) => upcomingIds.has(show.id));
    (isUpcoming ? upcoming : past).push(entry);
  }
  return { upcoming, past };
}
