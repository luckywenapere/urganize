import { describe, expect, it } from 'vitest';
import {
  EVENT_STATUSES,
  EVENT_STATUS_COPY,
  MAX_RUN_OF_SHOW_LABEL_LENGTH,
  MAX_SERIES_DAYS,
  MAX_SERIES_SHOWS,
  SELECTABLE_EVENT_STATUSES,
  buildSeriesShowTitle,
  describeDayOffset,
  describeRunOfShowTime,
  formatDayOffset,
  groupShowsBySeries,
  groupTimezones,
  isValidTimezone,
  orderRunOfShow,
  parseRunOfShowAt,
  parseRunOfShowLabel,
  parseSeriesCreate,
  partitionShowList,
  runOfShowInstant,
  setBoundaryOf,
  showStatusBadge,
  toIsoInZone,
} from './events';

/**
 * The shows list, the run of show and festivals: how things are ordered,
 * grouped, labelled and refused.
 */

const LAGOS = 'Africa/Lagos';

describe('status words', () => {
  it('uses a manager’s words for every status', () => {
    expect(EVENT_STATUS_COPY).toEqual({
      draft: 'Pencilled in',
      confirmed: 'Confirmed',
      done: 'Played',
      cancelled: 'Cancelled',
    });
  });

  it('never asks anyone to mark a show as played: the date knows', () => {
    expect(SELECTABLE_EVENT_STATUSES).toEqual(['draft', 'confirmed', 'cancelled']);
  });

  it.each(EVENT_STATUSES.map((status) => [status]))('badges %s only when it needs attention', (status) => {
    const expected = status === 'draft' ? 'Pencilled in' : status === 'cancelled' ? 'Cancelled' : null;
    expect(showStatusBadge(status)).toBe(expected);
  });
});

describe('groupTimezones: the zone picker', () => {
  const everyZone = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

  it('offers every zone the platform knows, exactly once, and every one of them works', () => {
    const groups = groupTimezones(everyZone);
    const offered = groups.flatMap((group) => group.zones.map((zone) => zone.value));
    expect(offered.length).toBe(new Set(offered).size);
    expect(new Set(offered)).toEqual(new Set(everyZone));
    for (const zone of offered) expect(isValidTimezone(zone), zone).toBe(true);
  });

  it('names zones the way a person says them, and sorts each region', () => {
    const groups = groupTimezones(everyZone);
    const africa = groups.find((group) => group.region === 'Africa');
    expect(africa?.zones.find((zone) => zone.value === LAGOS)?.label).toBe('Lagos');
    // A three-part name keeps its middle. (The platform's own list spells this
    // zone America/Buenos_Aires, so it is handed in directly.)
    expect(groupTimezones(['America/Argentina/Buenos_Aires'])[0].zones[0].label).toBe('Argentina / Buenos Aires');
    for (const group of groups) {
      const labels = group.zones.map((zone) => zone.label);
      expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
    }
  });

  it('keeps an unusual saved zone in the list, under Other, last', () => {
    const groups = groupTimezones(['Africa/Lagos', 'Europe/London'], 'Etc/GMT+1');
    expect(groups.map((group) => group.region)).toEqual(['Africa', 'Europe', 'Other']);
    expect(groups[2].zones).toEqual([{ value: 'Etc/GMT+1', label: 'Etc/GMT+1' }]);
  });

  it('ignores blanks and repeats', () => {
    expect(groupTimezones(['', '  ', 'Africa/Lagos', 'Africa/Lagos'])).toEqual([
      { region: 'Africa', zones: [{ value: 'Africa/Lagos', label: 'Lagos' }] },
    ]);
  });
});

describe('parseSeriesCreate: booking a festival', () => {
  const base = { seriesTitle: 'Flytime Fest', artistIds: ['a1'], days: 1 };

  it('books every combination of days and artists up to the limit, and refuses one more', () => {
    let checked = 0;
    for (let days = 1; days <= MAX_SERIES_DAYS; days += 1) {
      for (let artists = 1; artists <= 8; artists += 1) {
        const result = parseSeriesCreate({
          ...base,
          days,
          artistIds: Array.from({ length: artists }, (_, index) => `a${index}`),
        });
        const allowed = days * artists <= MAX_SERIES_SHOWS;
        expect(result.errors.length === 0, `${days} days x ${artists} artists`).toBe(allowed);
        if (!allowed) {
          expect(result.errors[0].message).toBe(
            `That is ${days * artists} shows at once. Keep it to ${MAX_SERIES_SHOWS} and book the rest as a second series.`
          );
        }
        checked += 1;
      }
    }
    expect(checked).toBe(MAX_SERIES_DAYS * 8);
  });

  it.each([0, -1, 1.5, MAX_SERIES_DAYS + 1, '7', null])('refuses %j days', (days) => {
    expect(parseSeriesCreate({ ...base, days: days as number }).errors.map((error) => error.field)).toContain('days');
  });

  it('books each artist once however often they are picked, and ignores blanks', () => {
    const result = parseSeriesCreate({ ...base, artistIds: ['a1', ' a1 ', '', 'a2', 7 as unknown as string] });
    expect(result.value?.artistIds).toEqual(['a1', 'a2']);
  });

  it.each([
    [{ ...base, artistIds: [] }, 'artistIds', 'Pick at least one artist.'],
    [{ ...base, seriesTitle: '  ' }, 'seriesTitle', 'Give the festival a name.'],
    [{ ...base, firstDayLocalStart: 'tomorrow' }, 'firstDayLocalStart', 'That start time is not a real date.'],
  ])('refuses %j', (input, field, message) => {
    expect(parseSeriesCreate(input).errors).toContainEqual({ field, message });
  });

  it('lets a festival be booked before its times are known', () => {
    expect(parseSeriesCreate({ ...base, firstDayLocalStart: '' }).value?.firstDayLocalStart).toBeNull();
  });

  it.each([
    ['Flytime Fest', 1, 1, 'Flytime Fest'],
    ['Flytime Fest', 1, 7, 'Flytime Fest: Day 1'],
    ['Flytime Fest', 7, 7, 'Flytime Fest: Day 7'],
  ])('titles day %i of %s', (title, day, total, expected) => {
    expect(buildSeriesShowTitle(title as string, day as number, total as number)).toBe(expected);
  });
});

describe('the shows list', () => {
  type Show = {
    id: string;
    title: string;
    artistName: string;
    seriesId: string | null;
    seriesTitle: string | null;
    seriesDay: number | null;
    setStartAt: string | null;
    setLengthMinutes: number;
  };
  const show = (id: string, setStartAt: string | null, over: Partial<Show> = {}): Show => ({
    id,
    title: id,
    artistName: 'Dorian',
    seriesId: null,
    seriesTitle: null,
    seriesDay: null,
    setStartAt,
    setLengthMinutes: 60,
    ...over,
  });
  const NOW = new Date('2026-09-25T12:00:00.000Z');
  const ids = (entries: ReturnType<typeof partitionShowList<Show>>['upcoming']) =>
    entries.map((entry) => (entry.kind === 'show' ? entry.event.id : `series:${entry.seriesId}`));

  it('puts shows with no date first, then soonest; past shows most recent first', () => {
    const { upcoming, past } = partitionShowList(
      [
        show('next-month', '2026-10-25T20:00:00.000Z'),
        show('last-month', '2026-08-25T20:00:00.000Z'),
        show('tomorrow', '2026-09-26T20:00:00.000Z'),
        show('no-date', null),
        show('last-week', '2026-09-18T20:00:00.000Z'),
      ],
      NOW
    );
    expect(ids(upcoming)).toEqual(['no-date', 'tomorrow', 'next-month']);
    expect(ids(past)).toEqual(['last-week', 'last-month']);
  });

  it('keeps a show on the list until its set has ended, not when it starts', () => {
    const playingNow = show('playing', '2026-09-25T11:30:00.000Z', { setLengthMinutes: 60 });
    const justEnded = show('ended', '2026-09-25T10:30:00.000Z', { setLengthMinutes: 60 });
    const { upcoming, past } = partitionShowList([playingNow, justEnded], NOW);
    expect(ids(upcoming)).toEqual(['playing']);
    expect(ids(past)).toEqual(['ended']);
  });

  it('keeps a festival that is half played together, under Upcoming, at its next day', () => {
    const fest = (day: number, date: string) =>
      show(`fest-${day}`, date, { seriesId: 'f', seriesTitle: 'Flytime Fest', seriesDay: day });
    const { upcoming, past } = partitionShowList(
      [
        fest(1, '2026-09-23T20:00:00.000Z'),
        fest(2, '2026-09-24T20:00:00.000Z'),
        fest(3, '2026-09-26T20:00:00.000Z'),
        show('single-sooner', '2026-09-25T20:00:00.000Z'),
        show('single-later', '2026-09-30T20:00:00.000Z'),
      ],
      NOW
    );
    expect(ids(upcoming)).toEqual(['single-sooner', 'series:f', 'single-later']);
    expect(past).toEqual([]);
    const card = upcoming[1];
    expect(card.kind === 'series' && card.shows.map((member) => member.id)).toEqual(['fest-1', 'fest-2', 'fest-3']);
  });

  it('files a festival that has finished under Past, at its last day', () => {
    const fest = (day: number, date: string) =>
      show(`fest-${day}`, date, { seriesId: 'f', seriesTitle: 'Flytime Fest', seriesDay: day });
    const { upcoming, past } = partitionShowList(
      [
        fest(1, '2026-09-10T20:00:00.000Z'),
        fest(2, '2026-09-20T20:00:00.000Z'),
        show('between', '2026-09-15T20:00:00.000Z'),
      ],
      NOW
    );
    expect(upcoming).toEqual([]);
    expect(ids(past)).toEqual(['series:f', 'between']);
  });

  it('lists a festival’s shows by day, then artist, and counts its days and artists', () => {
    const entries = groupShowsBySeries([
      show('b2', null, { seriesId: 'f', seriesTitle: 'Fest', seriesDay: 2, artistName: 'Victony' }),
      show('a1', null, { seriesId: 'f', seriesTitle: 'Fest', seriesDay: 1, artistName: 'Asa' }),
      show('b1', null, { seriesId: 'f', seriesTitle: 'Fest', seriesDay: 1, artistName: 'Victony' }),
      show('a2', null, { seriesId: 'f', seriesTitle: 'Fest', seriesDay: 2, artistName: 'Asa' }),
    ]);
    expect(entries).toHaveLength(1);
    const card = entries[0];
    expect(card.kind).toBe('series');
    if (card.kind !== 'series') return;
    expect(card.shows.map((member) => member.id)).toEqual(['a1', 'b1', 'a2', 'b2']);
    expect(card.days).toBe(2);
    expect(card.artistNames).toEqual(['Victony', 'Asa']);
  });
});

describe('the run of show', () => {
  const start = toIsoInZone('2026-09-12T21:30', LAGOS) as string;
  const at = (clock: string) => toIsoInZone(`2026-09-12T${clock}`, LAGOS);
  const row = (id: string, label: string, position: number, time: string | null = null) => ({
    id,
    label,
    position,
    at: time ? at(time) : null,
  });
  const show = { setStartAt: start, setLengthMinutes: 60 };
  const labels = (rows: ReturnType<typeof orderRunOfShow>) => rows.map((entry) => entry.label);

  const seeded = [
    row('1', 'Call time', 0),
    row('2', 'Soundcheck', 1, '18:00'),
    row('3', 'Doors', 2, '20:00'),
    row('4', 'Set start', 3),
    row('5', 'Set end', 4),
    row('6', 'Load out', 5),
  ];

  it('shows the set’s own times on untimed Set start and Set end, so there is never a gap', () => {
    const ordered = orderRunOfShow(seeded, show);
    expect(labels(ordered)).toEqual(['Call time', 'Soundcheck', 'Doors', 'Set start', 'Set end', 'Load out']);
    expect(ordered[3]).toMatchObject({ shownAt: start, followsShow: true });
    expect(ordered[4]).toMatchObject({ shownAt: at('22:30'), followsShow: true });
    expect(ordered[0]).toMatchObject({ shownAt: null, followsShow: false });
  });

  it('sorts steps typed out of order into time order, and leaves untimed ones in their place', () => {
    const rows = [
      row('1', 'Call time', 0),
      row('2', 'Soundcheck', 1, '19:00'),
      row('3', 'Doors', 2, '18:30'),
      row('4', 'Set start', 3),
      row('6', 'Load out', 4),
    ];
    expect(labels(orderRunOfShow(rows, show))).toEqual(['Call time', 'Doors', 'Soundcheck', 'Set start', 'Load out']);
  });

  it('moves a step after the set once it is timed after the set', () => {
    const rows = [row('1', 'Meet and greet', 0, '23:00'), row('4', 'Set start', 1), row('5', 'Set end', 2)];
    expect(labels(orderRunOfShow(rows, show))).toEqual(['Set start', 'Set end', 'Meet and greet']);
  });

  it('lets Set start carry a time of its own', () => {
    const rows = [row('4', 'Set start', 0, '21:00')];
    expect(orderRunOfShow(rows, show)[0]).toMatchObject({ shownAt: at('21:00'), followsShow: false });
  });

  it('treats a renamed set step as an ordinary step', () => {
    expect(orderRunOfShow([row('4', 'Headline set', 0)], show)[0]).toMatchObject({ shownAt: null, followsShow: false });
  });

  it('shows nothing for the set steps while the show has no date', () => {
    const ordered = orderRunOfShow(seeded, { setStartAt: null, setLengthMinutes: 60 });
    expect(ordered.find((entry) => entry.label === 'Set start')).toMatchObject({ shownAt: null });
    expect(ordered.find((entry) => entry.label === 'Set end')).toMatchObject({ shownAt: null });
  });

  it('treats an unreadable time as no time', () => {
    const ordered = orderRunOfShow([{ id: 'x', label: 'Doors', position: 0, at: 'soon' }], show);
    expect(ordered[0]).toMatchObject({ shownAt: null });
  });

  it('keeps two steps at the same time in the order they were put', () => {
    const rows = [row('a', 'Line check', 0, '18:00'), row('b', 'Soundcheck', 1, '18:00')];
    expect(labels(orderRunOfShow(rows, show))).toEqual(['Line check', 'Soundcheck']);
  });

  it.each(['Set start', 'set start', '  SET   START ', 'Set Start'])('knows %j is the set start', (label) => {
    expect(setBoundaryOf(label)).toBe('start');
  });

  it.each(['Set end', 'set end', 'SET END'])('knows %j is the set end', (label) => {
    expect(setBoundaryOf(label)).toBe('end');
  });

  it.each(['Set', 'Start', 'Set starts', 'Headline set start', ''])('does not mistake %j for the set', (label) => {
    expect(setBoundaryOf(label)).toBeNull();
  });

  it.each([
    ['2026-09-11T10:00', { time: '10:00', dayOffset: -1 }],
    ['2026-09-12T18:00', { time: '18:00', dayOffset: 0 }],
    ['2026-09-13T01:30', { time: '01:30', dayOffset: 1 }],
    ['2026-09-14T09:00', { time: '09:00', dayOffset: 2 }],
  ])('reads a step at %s against the show', (local, expected) => {
    expect(describeRunOfShowTime(toIsoInZone(local, LAGOS), start, LAGOS)).toEqual(expected);
  });

  it('reads a step’s time even when the show has lost its date', () => {
    expect(describeRunOfShowTime(at('18:00'), null, LAGOS)).toEqual({ time: '18:00', dayOffset: null });
    expect(describeRunOfShowTime(null, start, LAGOS)).toBeNull();
  });

  it('turns a typed time and a day into the right moment, and refuses what is not a time', () => {
    for (const dayOffset of [-2, -1, 0, 1, 2]) {
      for (const time of ['00:00', '07:05', '7:05', '12:30', '23:59']) {
        const instant = runOfShowInstant({ showStartIso: start, time, dayOffset, timezone: LAGOS });
        const read = describeRunOfShowTime(instant, start, LAGOS);
        expect(read, `${time} ${dayOffset}`).toEqual({ time: time.padStart(5, '0'), dayOffset });
      }
    }
    for (const time of ['24:00', '07:60', '07:5', '7', 'seven', '', '18:00:00']) {
      expect(runOfShowInstant({ showStartIso: start, time, dayOffset: 0, timezone: LAGOS }), time).toBeNull();
    }
    expect(runOfShowInstant({ showStartIso: start, time: ' 18:00 ', dayOffset: 0, timezone: LAGOS })).toBe(
      at('18:00')
    );
    expect(runOfShowInstant({ showStartIso: start, time: '18:00', dayOffset: 0.5, timezone: LAGOS })).toBeNull();
    expect(runOfShowInstant({ showStartIso: null, time: '18:00', dayOffset: 0, timezone: LAGOS })).toBeNull();
  });

  it.each([
    [0, '', 'on the day of the show'],
    [null, '', 'on the day of the show'],
    [Number.NaN, '', 'on the day of the show'],
    [1, '+1', 'the day after the show'],
    [-1, '−1', 'the day before the show'],
    [2, '+2', '2 days after the show'],
    [-3, '−3', '3 days before the show'],
  ])('writes day %s as %j and says it as %j', (offset, short, words) => {
    expect(formatDayOffset(offset)).toBe(short);
    expect(describeDayOffset(offset)).toBe(words);
  });

  it.each([
    ['  Doors  ', { label: 'Doors' }],
    ['Line    check', { label: 'Line check' }],
    ['', { error: 'Give the step a name.' }],
    ['   ', { error: 'Give the step a name.' }],
    [42, { error: 'Give the step a name.' }],
    ['x'.repeat(MAX_RUN_OF_SHOW_LABEL_LENGTH + 1), { error: `Keep the name under ${MAX_RUN_OF_SHOW_LABEL_LENGTH} characters.` }],
  ])('names a step %j', (input, expected) => {
    expect(parseRunOfShowLabel(input)).toEqual(expected);
  });

  it.each([
    [null, { at: null }],
    ['', { at: null }],
    ['2026-09-12T18:00:00+01:00', { at: '2026-09-12T17:00:00.000Z' }],
    ['soon', { error: 'That time is not a real time.' }],
    [42, { error: 'That time is not a real time.' }],
  ])('times a step with %j', (input, expected) => {
    expect(parseRunOfShowAt(input)).toEqual(expected);
  });
});
