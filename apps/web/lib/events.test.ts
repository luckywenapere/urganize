import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SET_LENGTH_MINUTES,
  DEFAULT_TIMEZONE,
  MAX_SET_LENGTH_MINUTES,
  buildDefaultRunOfShow,
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
