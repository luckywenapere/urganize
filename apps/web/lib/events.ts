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

export const EVENT_STATUS_COPY: Record<EventStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  done: 'Done',
  cancelled: 'Cancelled',
};

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
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The founder's own market. A manager in Lagos should not have to pick this
 *  on every show; anyone elsewhere changes it once per event. */
export const DEFAULT_TIMEZONE = 'Africa/Lagos';

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
        message: `Check the ${label} — it is too long or not text.`,
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
        message: `How long is the set, in minutes? Between ${MIN_SET_LENGTH_MINUTES} and ${MAX_SET_LENGTH_MINUTES}.`,
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

/**
 * A set time, in the VENUE'S zone.
 *
 * Never the viewer's. A manager in Lagos checking a London show has to read the
 * time the artist walks on stage there, and a tour manager opening the same
 * show from a plane must see the identical string. That is the entire reason
 * events.timezone exists and is not nullable.
 *
 * Falls back to UTC if the stored zone is somehow unusable, rather than
 * throwing — a broken zone should degrade one line, not take down the page.
 */
export function formatShowDateTime(
  iso: string | null | undefined,
  timezone: string,
  options?: { includeDate?: boolean; includeTime?: boolean }
): string {
  if (!iso) return 'Time to confirm';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Time to confirm';

  const zone = isValidTimezone(timezone) ? timezone : 'UTC';
  const includeDate = options?.includeDate !== false;
  const includeTime = options?.includeTime !== false;

  const parts: Intl.DateTimeFormatOptions = { timeZone: zone };
  if (includeDate) {
    parts.weekday = 'short';
    parts.day = 'numeric';
    parts.month = 'short';
  }
  if (includeTime) {
    // Padded and explicitly 24-hour: a list of set times reads as a schedule,
    // and "05:30" next to "21:30" lines up where "5:30" does not. hour12 is
    // pinned rather than left to the locale so the format cannot drift.
    parts.hour = '2-digit';
    parts.minute = '2-digit';
    parts.hour12 = false;
  }

  try {
    return new Intl.DateTimeFormat('en-GB', parts).format(date);
  } catch {
    return 'Time to confirm';
  }
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
 * "parse in this zone", so this measures the offset instead: format a first
 * guess back into the target zone, see how far it lands from the wall clock we
 * were given, and shift by that much.
 *
 * Runs twice, and the reason is narrower than it looks. Measured across 1536
 * wall clocks spanning four transitions in four zones, one pass and two agree
 * on every time that REALLY EXISTS. They differ only inside the hour a
 * spring-forward skips — a time a manager can type but that no clock ever
 * shows. There, one pass resolves BACKWARD (01:30 becomes 00:30, moving the
 * set earlier than intended) and two resolve FORWARD (01:30 becomes 02:30),
 * which is both the conventional resolution and the safer direction for a
 * stage time. The loop is bounded rather than recursive so a pathological zone
 * cannot hang the form.
 */
export function toIsoInZone(localValue: string, zone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localValue);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number) as unknown as number[];
  const wanted = Date.UTC(year, month - 1, day, hour, minute);

  let instant = wanted;
  for (let pass = 0; pass < 2; pass += 1) {
    const seen = wallClockUtc(new Date(instant), zone);
    if (seen === null) return new Date(wanted).toISOString();
    const drift = seen - wanted;
    if (drift === 0) break;
    instant -= drift;
  }

  return new Date(instant).toISOString();
}

/** What `date` reads as on a clock in `zone`, expressed as a UTC timestamp so
 *  two wall clocks can be subtracted. Null if the zone is unusable. */
function wallClockUtc(date: Date, zone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

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
