import { describe, expect, it } from 'vitest';
import { openGigCalls } from './gig-calls';

const now = new Date('2026-10-15T12:00:00Z');

describe('openGigCalls', () => {
  it('keeps pencilled-in shows still ahead, soonest first, undated last', () => {
    const shows = [
      { id: 'later', status: 'draft', setStartAt: '2026-11-20T20:00:00Z' },
      { id: 'tbc', status: 'draft', setStartAt: null },
      { id: 'soon', status: 'draft', setStartAt: '2026-10-20T20:00:00Z' },
    ];
    expect(openGigCalls(shows, now).map((s) => s.id)).toEqual(['soon', 'later', 'tbc']);
  });

  it('drops booked, played, cancelled and past shows', () => {
    const shows = [
      { id: 'booked', status: 'confirmed', setStartAt: '2026-10-20T20:00:00Z' },
      { id: 'played', status: 'done', setStartAt: '2026-09-20T20:00:00Z' },
      { id: 'off', status: 'cancelled', setStartAt: '2026-10-20T20:00:00Z' },
      { id: 'gone', status: 'draft', setStartAt: '2026-10-01T20:00:00Z' },
    ];
    expect(openGigCalls(shows, now)).toEqual([]);
  });
});
