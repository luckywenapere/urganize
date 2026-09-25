import { describe, expect, it } from 'vitest';
import {
  computeRescheduleDeltaMs,
  daysBetweenLocalDates,
  formatShowDateTime,
  localPartsInZone,
  relativeShowDay,
  rescheduleRunOfShowStep,
  showDateTile,
  shiftIsoByMs,
  shiftLocalDays,
  toIsoInZone,
} from './events';

/**
 * Time, the part of Shows most likely to be quietly wrong.
 *
 * A set time is typed as the VENUE'S wall clock and stored as an instant, and
 * every screen reads it back in the venue's zone. If those two directions
 * disagree anywhere, an artist walks on at the wrong hour and nobody notices
 * until they do. So the round trip is checked across 45 zones (whole, half and
 * quarter hour offsets, both hemispheres, zones with odd daylight saving),
 * every hour of the day, on ordinary days, on each hemisphere's daylight-saving
 * days and across New Year: 10,800 round trips.
 */

const ZONES = [
  'UTC',
  'Africa/Lagos',
  'Africa/Accra',
  'Africa/Johannesburg',
  'Africa/Nairobi',
  'Africa/Cairo',
  'Africa/Casablanca',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Atlantic/Azores',
  'Atlantic/Reykjavik',
  'America/St_Johns',
  'America/Halifax',
  'America/New_York',
  'America/Havana',
  'America/Chicago',
  'America/Mexico_City',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'Pacific/Honolulu',
  'Pacific/Pago_Pago',
  'Pacific/Auckland',
  'Pacific/Chatham',
  'Pacific/Kiritimati',
  'Australia/Sydney',
  'Australia/Adelaide',
  'Australia/Lord_Howe',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Tehran',
  'Asia/Dubai',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
];

/** Ordinary days, each hemisphere's 2026 daylight-saving changes, and New Year. */
const DATES = [
  '2026-01-01',
  '2026-03-08', // US spring forward
  '2026-03-29', // EU spring forward
  '2026-04-05', // Southern hemisphere clocks go back
  '2026-06-15',
  '2026-09-27', // New Zealand springs forward
  '2026-10-04', // Australia springs forward
  '2026-10-25', // EU falls back
  '2026-11-01', // US falls back
  '2026-12-31',
];

const pad = (value: number) => String(value).padStart(2, '0');
const utcOf = (date: string, time: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute);
};

describe('venue wall clock round trip', () => {
  it('reads back every typed time exactly, or pushes a skipped time forward within the hour', () => {
    let checked = 0;
    let gaps = 0;
    const failures: string[] = [];

    for (const zone of ZONES) {
      for (const date of DATES) {
        for (let hour = 0; hour < 24; hour += 1) {
          const local = `${date}T${pad(hour)}:30`;
          const iso = toIsoInZone(local, zone);
          checked += 1;
          if (!iso) {
            failures.push(`${zone} ${local}: no instant`);
            continue;
          }
          const back = localPartsInZone(iso, zone);
          if (!back) {
            failures.push(`${zone} ${local}: unreadable`);
            continue;
          }
          const shift = utcOf(back.date, back.time) - utcOf(date, `${pad(hour)}:30`);
          if (shift === 0) {
            // A time that happens twice must be the FIRST one: no earlier
            // instant within the hour may read the same clock.
            for (const minutesEarlier of [30, 60]) {
              const earlier = localPartsInZone(
                new Date(Date.parse(iso) - minutesEarlier * 60_000).toISOString(),
                zone
              );
              if (earlier && earlier.date === date && earlier.time === `${pad(hour)}:30`) {
                failures.push(`${zone} ${local}: picked the second of two`);
              }
            }
            continue;
          }

          // A time a spring-forward skips. It must resolve FORWARD (later, the
          // safer direction for a stage time) by at most an hour, and the typed
          // clock reading must genuinely never appear around that instant.
          gaps += 1;
          if (shift < 0 || shift > 60 * 60_000) {
            failures.push(`${zone} ${local}: moved by ${shift / 60_000} minutes`);
            continue;
          }
          const instant = Date.parse(iso);
          for (let step = -8; step <= 8; step += 1) {
            const near = localPartsInZone(new Date(instant + step * 15 * 60_000).toISOString(), zone);
            if (near && near.date === date && near.time === `${pad(hour)}:30`) {
              failures.push(`${zone} ${local}: exists but was moved`);
              break;
            }
          }
        }
      }
    }

    expect(failures).toEqual([]);
    expect(checked).toBe(ZONES.length * DATES.length * 24);
    // Real daylight-saving gaps were hit, so the forward rule was exercised.
    expect(gaps).toBeGreaterThan(0);
  });

  // The cases the grid found, written out so a regression names itself.
  it.each([
    // [wall clock, zone, instant, what the venue clock reads]
    ['2026-03-08T02:30', 'America/New_York', '2026-03-08T07:30:00.000Z', '03:30'],
    ['2026-03-08T02:30', 'America/Los_Angeles', '2026-03-08T10:30:00.000Z', '03:30'],
    ['2026-03-08T02:30', 'America/Halifax', '2026-03-08T06:30:00.000Z', '03:30'],
    ['2026-03-29T01:30', 'Europe/London', '2026-03-29T01:30:00.000Z', '02:30'],
    ['2026-03-29T02:30', 'Europe/Paris', '2026-03-29T01:30:00.000Z', '03:30'],
    ['2026-09-27T02:30', 'Pacific/Auckland', '2026-09-26T14:30:00.000Z', '03:30'],
    // Lord Howe jumps half an hour, so a skipped time moves half an hour.
    ['2026-10-04T02:15', 'Australia/Lord_Howe', '2026-10-03T15:45:00.000Z', '02:45'],
  ])('moves %s in %s, which never happens, forward', (local, zone, instant, reads) => {
    const iso = toIsoInZone(local, zone);
    expect(iso).toBe(instant);
    expect(localPartsInZone(iso, zone)?.time).toBe(reads);
  });

  it.each([
    // [wall clock that happens twice, zone, the first instant]
    ['2026-11-01T01:30', 'America/New_York', '2026-11-01T05:30:00.000Z'],
    ['2026-11-01T01:30', 'America/Los_Angeles', '2026-11-01T08:30:00.000Z'],
    ['2026-10-25T01:30', 'Europe/London', '2026-10-25T00:30:00.000Z'],
    ['2026-10-25T02:30', 'Europe/Berlin', '2026-10-25T00:30:00.000Z'],
    ['2026-04-05T02:30', 'Australia/Sydney', '2026-04-04T15:30:00.000Z'],
    ['2026-04-05T02:30', 'Pacific/Auckland', '2026-04-04T13:30:00.000Z'],
  ])('reads %s in %s, which happens twice, as the first time', (local, zone, instant) => {
    expect(toIsoInZone(local, zone)).toBe(instant);
  });

  it('keeps "the same time every day" across a daylight-saving change', () => {
    // A festival booked 23:00 nightly across the EU change must stay 23:00 on
    // the clock, even though the gap between the instants is 23 or 25 hours.
    for (const zone of ['Europe/London', 'America/New_York', 'Australia/Sydney', 'Pacific/Auckland']) {
      for (let day = 0; day < 14; day += 1) {
        const local = shiftLocalDays('2026-03-22T23:00', day) as string;
        const back = localPartsInZone(toIsoInZone(local, zone), zone);
        expect(back?.time, `${zone} day ${day}`).toBe('23:00');
      }
    }
  });
});

describe('localPartsInZone', () => {
  it('reads midnight as 00:00, never 24:00', () => {
    expect(localPartsInZone('2026-06-15T23:00:00.000Z', 'Africa/Lagos')?.time).toBe('00:00');
    expect(localPartsInZone('2026-06-15T23:00:00.000Z', 'Africa/Lagos')?.date).toBe('2026-06-16');
  });

  it('answers null for nothing, not a date, and falls back to UTC for a broken zone', () => {
    expect(localPartsInZone(null, 'UTC')).toBeNull();
    expect(localPartsInZone('', 'UTC')).toBeNull();
    expect(localPartsInZone('soon', 'UTC')).toBeNull();
    expect(localPartsInZone('2026-06-15T20:30:00.000Z', 'Nowhere/Fake')?.time).toBe('20:30');
  });
});

describe('formatShowDateTime', () => {
  const now = new Date('2026-09-25T12:00:00.000Z');

  it('leaves the year out for this year and adds it for any other', () => {
    expect(formatShowDateTime('2026-12-20T20:30:00.000Z', 'Africa/Lagos', { now })).toBe('Sun 20 Dec, 21:30');
    expect(formatShowDateTime('2027-01-09T20:30:00.000Z', 'Africa/Lagos', { now })).toBe('Sat 9 Jan 2027, 21:30');
    expect(formatShowDateTime('2025-12-20T20:30:00.000Z', 'Africa/Lagos', { now })).toBe('Sat 20 Dec 2025, 21:30');
  });

  it('judges "this year" in the venue zone, so New Year’s Eve reads right on both sides of the date line', () => {
    const newYearsEve = new Date('2026-12-31T20:00:00.000Z');
    // 12:00 on 1 January in Kiritimati (UTC+14) is already next year there.
    expect(formatShowDateTime('2026-12-31T22:00:00.000Z', 'Pacific/Kiritimati', { now: newYearsEve })).toBe(
      'Fri 1 Jan, 12:00'
    );
  });

  it('can say only the date, or only the time', () => {
    expect(formatShowDateTime('2026-12-20T20:30:00.000Z', 'Africa/Lagos', { now, includeTime: false })).toBe(
      'Sun 20 Dec'
    );
    expect(formatShowDateTime('2026-12-20T20:30:00.000Z', 'Africa/Lagos', { includeDate: false })).toBe('21:30');
  });

  it('says what is missing when there is no time', () => {
    expect(formatShowDateTime(null, 'Africa/Lagos')).toBe('Date to confirm');
    expect(formatShowDateTime(null, 'Africa/Lagos', { includeDate: false })).toBe('Time to confirm');
  });
});

describe('relativeShowDay', () => {
  const cases: [string, string, string, 'Today' | 'Tomorrow' | 'Yesterday' | null][] = [
    // [show instant, zone, now instant, expected]
    ['2026-09-25T20:30:00.000Z', 'Africa/Lagos', '2026-09-25T08:00:00.000Z', 'Today'],
    ['2026-09-26T20:30:00.000Z', 'Africa/Lagos', '2026-09-25T08:00:00.000Z', 'Tomorrow'],
    ['2026-09-24T20:30:00.000Z', 'Africa/Lagos', '2026-09-25T08:00:00.000Z', 'Yesterday'],
    ['2026-09-28T20:30:00.000Z', 'Africa/Lagos', '2026-09-25T08:00:00.000Z', null],
    // The venue's day, not the viewer's: 23:30 UTC on the 25th is already the
    // 26th in Lagos, so a show then is "Tomorrow" from the Lagos morning.
    ['2026-09-25T23:30:00.000Z', 'Africa/Lagos', '2026-09-25T08:00:00.000Z', 'Tomorrow'],
    // 20:00 in Los Angeles is still "Today" there at 21:00, though it is
    // already the next morning in Lagos.
    ['2026-09-26T03:00:00.000Z', 'America/Los_Angeles', '2026-09-26T04:00:00.000Z', 'Today'],
    // Across a year end.
    ['2027-01-01T01:00:00.000Z', 'UTC', '2026-12-31T12:00:00.000Z', 'Tomorrow'],
    ['2026-12-31T23:00:00.000Z', 'UTC', '2027-01-01T01:00:00.000Z', 'Yesterday'],
  ];

  it.each(cases)('%s in %s, seen at %s', (show, zone, now, expected) => {
    expect(relativeShowDay(show, zone, new Date(now))).toBe(expected);
  });

  it('has nothing to say about a show with no date', () => {
    expect(relativeShowDay(null, 'Africa/Lagos')).toBeNull();
  });
});

describe('showDateTile', () => {
  it('gives month, day and weekday, and the year only when it is not this year', () => {
    const now = new Date('2026-09-25T12:00:00.000Z');
    expect(showDateTile('2026-12-20T20:30:00.000Z', 'Africa/Lagos', now)).toEqual({
      month: 'Dec',
      day: '20',
      weekday: 'Sun',
      year: null,
    });
    expect(showDateTile('2027-01-09T20:30:00.000Z', 'Africa/Lagos', now)?.year).toBe('2027');
    expect(showDateTile(null, 'Africa/Lagos', now)).toBeNull();
  });
});

describe('daysBetweenLocalDates', () => {
  it.each([
    ['2026-09-25', '2026-09-25', 0],
    ['2026-09-25', '2026-09-26', 1],
    ['2026-09-26', '2026-09-25', -1],
    ['2026-12-31', '2027-01-01', 1],
    ['2028-02-28', '2028-03-01', 2], // a leap year
    ['2026-02-28', '2026-03-01', 1],
    ['2026-03-28', '2026-03-30', 2], // across a daylight-saving change
  ])('%s to %s is %i', (from, to, days) => {
    expect(daysBetweenLocalDates(from, to)).toBe(days);
  });

  it('refuses anything that is not a date', () => {
    expect(daysBetweenLocalDates('soon', '2026-09-25')).toBeNull();
    expect(daysBetweenLocalDates('2026-09-25', '')).toBeNull();
  });
});

describe('rescheduleRunOfShowStep', () => {
  const lagos = 'Africa/Lagos';
  const london = 'Europe/London';

  it('keeps a step on the same clock time and the same day as the show when it moves a week', () => {
    // Show 21:30 Lagos on the 12th, soundcheck 18:00 the same day.
    const moved = rescheduleRunOfShowStep({
      atIso: toIsoInZone('2026-09-12T18:00', lagos),
      previousStartIso: toIsoInZone('2026-09-12T21:30', lagos),
      nextStartIso: toIsoInZone('2026-09-19T21:30', lagos),
      previousTimezone: lagos,
      nextTimezone: lagos,
    });
    expect(moved).toBe(toIsoInZone('2026-09-19T18:00', lagos));
  });

  it('keeps a call time the day before as the day before', () => {
    const moved = rescheduleRunOfShowStep({
      atIso: toIsoInZone('2026-09-11T10:00', lagos),
      previousStartIso: toIsoInZone('2026-09-12T21:30', lagos),
      nextStartIso: toIsoInZone('2026-10-03T21:30', lagos),
      previousTimezone: lagos,
      nextTimezone: lagos,
    });
    expect(moved).toBe(toIsoInZone('2026-10-02T10:00', lagos));
  });

  it('does not drift an hour when the clocks change between the two dates', () => {
    // A London show moves from Sat 28 Mar to Sun 29 Mar, across the night the
    // clocks go forward. Travel at 10:00 the day before must stay 10:00.
    const previousStartIso = toIsoInZone('2026-03-28T21:30', london);
    const nextStartIso = toIsoInZone('2026-03-29T21:30', london);
    const travel = rescheduleRunOfShowStep({
      atIso: toIsoInZone('2026-03-27T10:00', london),
      previousStartIso,
      nextStartIso,
      previousTimezone: london,
      nextTimezone: london,
    });
    expect(localPartsInZone(travel, london)).toMatchObject({ date: '2026-03-28', time: '10:00' });

    // Moving by the raw hours would have put it at 09:00, which is the bug.
    const delta = computeRescheduleDeltaMs(previousStartIso, nextStartIso) as number;
    const naive = shiftIsoByMs(toIsoInZone('2026-03-27T10:00', london), delta);
    expect(localPartsInZone(naive, london)?.time).toBe('09:00');
  });

  it('keeps the clock a manager sees when the show changes zone', () => {
    // Lagos to London in winter: the set is kept at 21:30 on the new clock,
    // and soundcheck at 18:00 stays 18:00 on it too.
    const moved = rescheduleRunOfShowStep({
      atIso: toIsoInZone('2026-12-05T18:00', lagos),
      previousStartIso: toIsoInZone('2026-12-05T21:30', lagos),
      nextStartIso: toIsoInZone('2026-12-05T21:30', london),
      previousTimezone: lagos,
      nextTimezone: london,
    });
    expect(localPartsInZone(moved, london)).toMatchObject({ date: '2026-12-05', time: '18:00' });
  });

  it('keeps a load out after midnight on the day after', () => {
    const moved = rescheduleRunOfShowStep({
      atIso: toIsoInZone('2026-09-13T01:15', lagos),
      previousStartIso: toIsoInZone('2026-09-12T23:00', lagos),
      nextStartIso: toIsoInZone('2026-09-20T23:00', lagos),
      previousTimezone: lagos,
      nextTimezone: lagos,
    });
    expect(localPartsInZone(moved, lagos)).toMatchObject({ date: '2026-09-21', time: '01:15' });
  });

  it('moves nothing when the show did not move, gained its first date, or lost it', () => {
    const at = toIsoInZone('2026-09-12T18:00', lagos);
    const start = toIsoInZone('2026-09-12T21:30', lagos);
    const base = { atIso: at, previousTimezone: lagos, nextTimezone: lagos };
    expect(rescheduleRunOfShowStep({ ...base, previousStartIso: start, nextStartIso: start })).toBeNull();
    expect(rescheduleRunOfShowStep({ ...base, previousStartIso: null, nextStartIso: start })).toBeNull();
    expect(rescheduleRunOfShowStep({ ...base, previousStartIso: start, nextStartIso: null })).toBeNull();
  });

  it('leaves an untimed or unreadable step alone', () => {
    const start = toIsoInZone('2026-09-12T21:30', lagos);
    const next = toIsoInZone('2026-09-19T21:30', lagos);
    const base = { previousStartIso: start, nextStartIso: next, previousTimezone: lagos, nextTimezone: lagos };
    expect(rescheduleRunOfShowStep({ ...base, atIso: null })).toBeNull();
    expect(rescheduleRunOfShowStep({ ...base, atIso: 'soon' })).toBeNull();
  });

  it('keeps every step the same clock time across a whole year of moves in several zones', () => {
    // 12 months x 4 zones x 5 steps, each moved from one date to a date a
    // month later, across every clock change in 2026. Every one must keep its
    // clock time and its day relative to the show.
    const zones = ['Africa/Lagos', 'Europe/London', 'America/New_York', 'Australia/Sydney'];
    const steps: [number, string][] = [
      [-1, '10:00'],
      [0, '15:00'],
      [0, '18:30'],
      [0, '20:00'],
      [1, '01:30'],
    ];
    let checked = 0;
    for (const zone of zones) {
      for (let month = 1; month <= 12; month += 1) {
        const showDay = `2026-${pad(month)}-14`;
        const nextDay = (shiftLocalDays(`${showDay}T21:30`, 31) as string).slice(0, 10);
        const previousStartIso = toIsoInZone(`${showDay}T21:30`, zone);
        const nextStartIso = toIsoInZone(`${nextDay}T21:30`, zone);
        for (const [offset, time] of steps) {
          const stepLocal = shiftLocalDays(`${showDay}T${time}`, offset) as string;
          const moved = rescheduleRunOfShowStep({
            atIso: toIsoInZone(stepLocal, zone),
            previousStartIso,
            nextStartIso,
            previousTimezone: zone,
            nextTimezone: zone,
          });
          const expectedDay = (shiftLocalDays(`${nextDay}T${time}`, offset) as string).slice(0, 10);
          expect(localPartsInZone(moved, zone), `${zone} ${showDay} ${time} ${offset}`).toMatchObject({
            date: expectedDay,
            time,
          });
          checked += 1;
        }
      }
    }
    expect(checked).toBe(240);
  });
});

describe('computeRescheduleDeltaMs and shiftIsoByMs', () => {
  it('measures a real move and nothing else', () => {
    expect(computeRescheduleDeltaMs('2026-09-12T20:30:00.000Z', '2026-09-19T20:30:00.000Z')).toBe(7 * 86_400_000);
    expect(computeRescheduleDeltaMs('2026-09-12T20:30:00.000Z', '2026-09-12T20:30:00.000Z')).toBeNull();
    expect(computeRescheduleDeltaMs(null, '2026-09-12T20:30:00.000Z')).toBeNull();
    expect(computeRescheduleDeltaMs('2026-09-12T20:30:00.000Z', null)).toBeNull();
    expect(computeRescheduleDeltaMs('soon', '2026-09-12T20:30:00.000Z')).toBeNull();
  });

  it('moves an instant, or refuses one it cannot read', () => {
    expect(shiftIsoByMs('2026-09-12T20:30:00.000Z', 3_600_000)).toBe('2026-09-12T21:30:00.000Z');
    expect(shiftIsoByMs(null, 3_600_000)).toBeNull();
    expect(shiftIsoByMs('soon', 3_600_000)).toBeNull();
    expect(shiftIsoByMs('2026-09-12T20:30:00.000Z', Number.NaN)).toBeNull();
  });
});
