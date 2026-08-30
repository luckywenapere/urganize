import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SET_LENGTH_MINUTES,
  DEFAULT_TIMEZONE,
  MAX_SET_LENGTH_MINUTES,
  buildDefaultRunOfShow,
  formatShowDateTime,
  shortTimezoneLabel,
  toIsoInZone,
  isValidTimezone,
  parseEventCreate,
  parseEventPatch,
} from './events';

const fieldsWithErrors = (errors: { field: string }[]) => errors.map((error) => error.field);

describe('isValidTimezone', () => {
  it('accepts real IANA zones', () => {
    expect(isValidTimezone('Africa/Lagos')).toBe(true);
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
  });

  // A set time is meaningless without a real zone, so this is validated rather
  // than trusted — and asking Intl beats shipping a list that goes stale.
  it('rejects anything the platform does not recognise', () => {
    expect(isValidTimezone('Lagos')).toBe(false);
    expect(isValidTimezone('GMT+1')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(isValidTimezone('   ')).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(42)).toBe(false);
  });
});

describe('parseEventCreate', () => {
  it('needs only a title, and fills the rest in', () => {
    const result = parseEventCreate({ title: 'Flytime Fest' });
    expect(result.errors).toEqual([]);
    expect(result.columns).toMatchObject({
      title: 'Flytime Fest',
      timezone: DEFAULT_TIMEZONE,
      set_length_minutes: DEFAULT_SET_LENGTH_MINUTES,
    });
  });

  it('refuses a missing or blank title', () => {
    expect(fieldsWithErrors(parseEventCreate({}).errors)).toContain('title');
    expect(fieldsWithErrors(parseEventCreate({ title: '   ' }).errors)).toContain('title');
  });

  it('lets a caller override the defaults', () => {
    const result = parseEventCreate({
      title: 'Ember Nights',
      timezone: 'Europe/London',
      setLengthMinutes: 45,
    });
    expect(result.errors).toEqual([]);
    expect(result.columns.timezone).toBe('Europe/London');
    expect(result.columns.set_length_minutes).toBe(45);
  });

  it('rejects a set length outside the column check', () => {
    expect(fieldsWithErrors(parseEventCreate({ title: 'X', setLengthMinutes: 0 }).errors)).toContain(
      'setLengthMinutes'
    );
    expect(
      fieldsWithErrors(
        parseEventCreate({ title: 'X', setLengthMinutes: MAX_SET_LENGTH_MINUTES + 1 }).errors
      )
    ).toContain('setLengthMinutes');
    expect(
      fieldsWithErrors(parseEventCreate({ title: 'X', setLengthMinutes: 30.5 }).errors)
    ).toContain('setLengthMinutes');
  });

  it('trims optional text and stores blanks as null rather than empty strings', () => {
    const result = parseEventCreate({ title: 'X', venueName: '  Eko Hotel  ', city: '' });
    expect(result.columns.venue_name).toBe('Eko Hotel');
    expect(result.columns.city).toBeNull();
  });

  it('normalises a start time to ISO and refuses a fake date', () => {
    const ok = parseEventCreate({ title: 'X', setStartAt: '2026-09-12T21:30:00+01:00' });
    expect(ok.errors).toEqual([]);
    expect(ok.columns.set_start_at).toBe('2026-09-12T20:30:00.000Z');

    expect(fieldsWithErrors(parseEventCreate({ title: 'X', setStartAt: 'soon' }).errors)).toContain(
      'setStartAt'
    );
  });

  it('accepts a cleared start time', () => {
    expect(parseEventCreate({ title: 'X', setStartAt: null }).columns.set_start_at).toBeNull();
  });

  it('rejects a status that is not one a show can be in', () => {
    expect(fieldsWithErrors(parseEventCreate({ title: 'X', status: 'maybe' }).errors)).toContain(
      'status'
    );
    expect(parseEventCreate({ title: 'X', status: 'confirmed' }).columns.status).toBe('confirmed');
  });
});

describe('parseEventPatch', () => {
  // THE load-bearing property. The release PATCH handler is a full-row replace,
  // so a sparse body there nulls whatever it omits — a documented trap that
  // forces callers into read-then-merge. A new object must not inherit it.
  it('writes only the fields the caller actually sent', () => {
    const result = parseEventPatch({ setLengthMinutes: 45 });
    expect(result.errors).toEqual([]);
    expect(Object.keys(result.columns)).toEqual(['set_length_minutes']);
    expect(result.columns.title).toBeUndefined();
    expect(result.columns.venue_name).toBeUndefined();
    expect(result.columns.timezone).toBeUndefined();
  });

  it('still validates the fields it is given', () => {
    expect(fieldsWithErrors(parseEventPatch({ timezone: 'Nowhere/Fake' }).errors)).toContain(
      'timezone'
    );
    expect(fieldsWithErrors(parseEventPatch({ title: '' }).errors)).toContain('title');
  });

  it('can deliberately clear an optional field', () => {
    const result = parseEventPatch({ stage: null });
    expect(result.errors).toEqual([]);
    expect(result.columns.stage).toBeNull();
  });

  it('refuses an empty patch rather than doing a silent no-op write', () => {
    expect(fieldsWithErrors(parseEventPatch({}).errors)).toContain('body');
  });
});

describe('buildDefaultRunOfShow', () => {
  it('seeds the running order a tour manager reads top to bottom', () => {
    const items = buildDefaultRunOfShow();
    expect(items.map((item) => item.label)).toEqual([
      'Call time',
      'Soundcheck',
      'Doors',
      'Set start',
      'Set end',
      'Load out',
    ]);
    expect(items.map((item) => item.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('returns a fresh array each time so a caller cannot mutate the template', () => {
    const first = buildDefaultRunOfShow();
    first[0].label = 'Changed';
    expect(buildDefaultRunOfShow()[0].label).toBe('Call time');
  });
});

describe('formatShowDateTime', () => {
  // THE load-bearing property. A show at 21:30 in Lagos must read 21:30 to
  // everyone, whatever machine they are on — that is why events.timezone is
  // not nullable.
  it('renders the set time in the venue zone, not the viewer’s', () => {
    const iso = '2026-09-12T20:30:00.000Z'; // 21:30 in Lagos, 21:30 in London (BST)
    expect(formatShowDateTime(iso, 'Africa/Lagos')).toContain('21:30');
    expect(formatShowDateTime(iso, 'America/New_York')).toContain('16:30');
    expect(formatShowDateTime(iso, 'Asia/Tokyo')).toContain('05:30');
  });

  it('says the time is unconfirmed rather than inventing one', () => {
    expect(formatShowDateTime(null, 'Africa/Lagos')).toBe('Time to confirm');
    expect(formatShowDateTime('', 'Africa/Lagos')).toBe('Time to confirm');
    expect(formatShowDateTime('not a date', 'Africa/Lagos')).toBe('Time to confirm');
  });

  // Degrades one line rather than taking down the page.
  it('falls back to UTC on an unusable zone instead of throwing', () => {
    const iso = '2026-09-12T20:30:00.000Z';
    expect(() => formatShowDateTime(iso, 'Nowhere/Fake')).not.toThrow();
    expect(formatShowDateTime(iso, 'Nowhere/Fake')).toContain('20:30');
  });

  it('can render date or time alone', () => {
    const iso = '2026-09-12T20:30:00.000Z';
    expect(formatShowDateTime(iso, 'Africa/Lagos', { includeTime: false })).not.toContain(':');
    expect(formatShowDateTime(iso, 'Africa/Lagos', { includeDate: false })).toBe('21:30');
  });
});

describe('shortTimezoneLabel', () => {
  it('reads the way a person says it', () => {
    expect(shortTimezoneLabel('Africa/Lagos')).toBe('Lagos');
    expect(shortTimezoneLabel('America/New_York')).toBe('New York');
    expect(shortTimezoneLabel('UTC')).toBe('UTC');
    expect(shortTimezoneLabel('')).toBe('');
  });
});

describe('toIsoInZone', () => {
  // THE reason this function exists. A datetime-local input carries no zone, so
  // `new Date(value)` reads it in the BROWSER'S zone — wrong for every show
  // booked outside the city the manager is sitting in, and wrong silently.
  it('reads the wall clock in the venue zone, not the browser’s', () => {
    // 21:30 in Lagos (UTC+1) is 20:30 UTC.
    expect(toIsoInZone('2026-09-12T21:30', 'Africa/Lagos')).toBe('2026-09-12T20:30:00.000Z');
    // The same wall clock in New York (UTC-4 in September) is 01:30 UTC next day.
    expect(toIsoInZone('2026-09-12T21:30', 'America/New_York')).toBe('2026-09-13T01:30:00.000Z');
    // And in Tokyo (UTC+9) it is 12:30 UTC the same day.
    expect(toIsoInZone('2026-09-12T21:30', 'Asia/Tokyo')).toBe('2026-09-12T12:30:00.000Z');
  });

  it('round-trips through the display formatter', () => {
    for (const zone of ['Africa/Lagos', 'America/New_York', 'Asia/Tokyo', 'Europe/London', 'UTC']) {
      const iso = toIsoInZone('2026-09-12T21:30', zone);
      expect(iso).not.toBeNull();
      expect(formatShowDateTime(iso, zone, { includeDate: false })).toBe('21:30');
    }
  });

  // A zone whose offset differs either side of the entered time is exactly the
  // case a single-pass correction gets wrong, which is why the loop runs twice.
  it('handles a wall clock near a daylight-saving change', () => {
    // London springs forward 2026-03-29 at 01:00 GMT. 21:30 the evening after
    // is BST (UTC+1) → 20:30 UTC.
    expect(toIsoInZone('2026-03-29T21:30', 'Europe/London')).toBe('2026-03-29T20:30:00.000Z');
    // The evening before is still GMT → 21:30 UTC.
    expect(toIsoInZone('2026-03-28T21:30', 'Europe/London')).toBe('2026-03-28T21:30:00.000Z');
  });

  it('refuses a value that is not a wall clock', () => {
    expect(toIsoInZone('', 'Africa/Lagos')).toBeNull();
    expect(toIsoInZone('tomorrow', 'Africa/Lagos')).toBeNull();
    expect(toIsoInZone('2026-09-12', 'Africa/Lagos')).toBeNull();
  });

  // Degrades to treating the input as UTC rather than throwing inside a form
  // submit, where an exception would lose everything the manager typed.
  it('falls back instead of throwing on an unusable zone', () => {
    expect(() => toIsoInZone('2026-09-12T21:30', 'Nowhere/Fake')).not.toThrow();
    expect(toIsoInZone('2026-09-12T21:30', 'Nowhere/Fake')).toBe('2026-09-12T21:30:00.000Z');
  });
});

describe('toIsoInZone: the hour that does not exist', () => {
  // London springs forward 2026-03-29 at 01:00 GMT, so 01:30 never happens
  // that day. A manager can still type it. One correction pass would resolve
  // it BACKWARD to 00:30 — moving the set earlier than intended; two resolve
  // it FORWARD to 02:30, the conventional answer and the safer direction for a
  // stage time. This is the only case where the second pass changes anything.
  it('resolves a skipped wall clock forward, not backward', () => {
    const iso = toIsoInZone('2026-03-29T01:30', 'Europe/London');
    expect(iso).toBe('2026-03-29T01:30:00.000Z');
    expect(formatShowDateTime(iso, 'Europe/London', { includeDate: false })).toBe('02:30');
  });
});
