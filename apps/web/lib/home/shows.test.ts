import { describe, expect, it } from 'vitest';
import { buildNextShow, selectNextShow } from './shows';

const NOW = new Date('2026-09-29T12:00:00.000Z');

type Show = { id: string; status: string; setStartAt: string | null; setLengthMinutes: number };

function show(overrides: Partial<Show> = {}): Show {
  return {
    id: 's1',
    status: 'confirmed',
    setStartAt: '2026-10-01T22:00:00.000Z',
    setLengthMinutes: 60,
    ...overrides,
  };
}

describe('selectNextShow', () => {
  it('returns the soonest eligible show within the window', () => {
    const shows = [
      show({ id: 'far', setStartAt: '2026-10-20T22:00:00.000Z' }),
      show({ id: 'near', setStartAt: '2026-10-01T22:00:00.000Z' }),
    ];
    expect(selectNextShow(shows, NOW)?.id).toBe('near');
  });

  it('excludes cancelled shows', () => {
    const shows = [show({ id: 's1', status: 'cancelled', setStartAt: '2026-10-01T22:00:00.000Z' })];
    expect(selectNextShow(shows, NOW)).toBeNull();
  });

  it('returns null when nothing is within the 14-day window', () => {
    const shows = [show({ setStartAt: '2026-10-20T22:00:00.000Z' })];
    expect(selectNextShow(shows, NOW)).toBeNull();
  });

  it('returns null with no shows at all', () => {
    expect(selectNextShow([], NOW)).toBeNull();
  });

  it('returns null for a show with no set time', () => {
    expect(selectNextShow([show({ setStartAt: null })], NOW)).toBeNull();
  });

  it('still includes a show that is currently happening (started, not yet ended)', () => {
    const shows = [show({ setStartAt: '2026-09-29T11:45:00.000Z', setLengthMinutes: 60 })];
    expect(selectNextShow(shows, NOW)?.id).toBe('s1');
  });
});

describe('buildNextShow', () => {
  it('assembles date/time labels, days until, and a setlist summary', () => {
    const result = buildNextShow(
      {
        id: 's1',
        artistName: 'Dorian',
        venueName: 'The Shrine',
        city: 'Lagos',
        setStartAt: '2026-10-03T21:00:00.000Z',
        timezone: 'Africa/Lagos',
        setLengthMinutes: 60,
        setlistItems: [{ itemSeconds: 1800, versionSeconds: null, songSeconds: null }],
        djLinksOpened: 1,
        djLinksTotal: 2,
      },
      NOW
    );

    expect(result.artistName).toBe('Dorian');
    expect(result.venueName).toBe('The Shrine');
    expect(result.daysUntil).toBe(4);
    expect(result.dateLabel.length).toBeGreaterThan(0);
    expect(result.setTimeLabel.length).toBeGreaterThan(0);
    expect(result.setlist).not.toBeNull();
    expect(result.setlist?.slotMinutes).toBe(60);
    expect(result.djLinks).toEqual({ opened: 1, total: 2 });
    expect(result.soundcheckLabel).toBeNull();
  });

  it('has no setlist section when there is no setlist yet', () => {
    const result = buildNextShow(
      {
        id: 's1',
        artistName: 'Dorian',
        venueName: null,
        city: null,
        setStartAt: '2026-10-03T21:00:00.000Z',
        timezone: 'Africa/Lagos',
        setLengthMinutes: 60,
        setlistItems: null,
        djLinksOpened: null,
        djLinksTotal: null,
      },
      NOW
    );
    expect(result.setlist).toBeNull();
  });

  it('omits djLinks entirely rather than claiming 0 of 0 when there is no pack', () => {
    const result = buildNextShow(
      {
        id: 's1',
        artistName: 'Dorian',
        venueName: null,
        city: null,
        setStartAt: '2026-10-03T21:00:00.000Z',
        timezone: 'Africa/Lagos',
        setLengthMinutes: 60,
        setlistItems: null,
        djLinksOpened: null,
        djLinksTotal: null,
      },
      NOW
    );
    expect(result.djLinks).toBeNull();
  });
});
