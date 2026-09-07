/**
 * The pure half of the shows family. The tools themselves need a Supabase
 * client and a live fetch, so what is testable is the decisions — the same
 * split insights.test.ts makes.
 */

import { describe, expect, it } from 'vitest';
import type { RecipientReceipt } from '@/lib/dj-pack';
import type { SetlistSummary } from '@/lib/setlist';
import type { ShowEvent } from '@/types/events';
import { describePackState, describeSetTotal, describeShow, partitionShows } from './shows';

const NOW = new Date('2026-09-07T12:00:00Z');

function show(over: Partial<ShowEvent> & { id: string }): ShowEvent {
  return {
    artistId: 'artist-1',
    artistName: 'Dorian',
    title: 'A show',
    venueName: null,
    city: null,
    country: null,
    timezone: 'Africa/Lagos',
    setStartAt: null,
    setLengthMinutes: 45,
    stage: null,
    promoterName: null,
    promoterPhone: null,
    status: 'confirmed',
    notes: null,
    seriesId: null,
    seriesTitle: null,
    seriesDay: null,
    ...over,
  } as ShowEvent;
}

function summary(over: Partial<SetlistSummary>): SetlistSummary {
  return {
    totalSeconds: 0,
    unmeasuredCount: 0,
    isPartial: false,
    slotSeconds: 25 * 60,
    deltaSeconds: -25 * 60,
    fit: 'under',
    ...over,
  };
}

function receipt(over: Partial<RecipientReceipt> & { name: string }): RecipientReceipt {
  return {
    id: 'r-1',
    role: null,
    token: 'tok',
    revokedAt: null,
    lastViewedAt: null,
    lastDownloadedAt: null,
    downloadCount: 0,
    ...over,
  };
}

describe('describeShow', () => {
  it('reads as one line: what, where, when, how long', () => {
    const line = describeShow(
      show({
        id: 's1',
        title: 'Sticks n Stones',
        venueName: 'Hard Rock',
        city: 'Lagos',
        setStartAt: '2026-12-12T20:00:00Z',
        setLengthMinutes: 25,
      })
    );
    expect(line).toContain('Sticks n Stones');
    expect(line).toContain('Hard Rock, Lagos');
    expect(line).toContain('25 min slot');
  });

  it('says the set time is missing rather than leaving a gap', () => {
    expect(describeShow(show({ id: 's1', setStartAt: null }))).toContain('no set time yet');
  });

  it('names a status that is not confirmed, and stays quiet when it is', () => {
    expect(describeShow(show({ id: 's1', status: 'cancelled' }))).toContain('cancelled');
    expect(describeShow(show({ id: 's1', status: 'confirmed' }))).not.toContain('confirmed');
  });

  it('names the festival a show belongs to', () => {
    expect(describeShow(show({ id: 's1', seriesTitle: 'Flytime Fest' }))).toContain('Flytime Fest');
  });
});

describe('partitionShows', () => {
  it('splits on the set time and sorts each half toward the reader', () => {
    const soon = show({ id: 'soon', setStartAt: '2026-09-20T20:00:00Z' });
    const later = show({ id: 'later', setStartAt: '2026-10-20T20:00:00Z' });
    const old = show({ id: 'old', setStartAt: '2026-08-01T20:00:00Z' });
    const older = show({ id: 'older', setStartAt: '2026-07-01T20:00:00Z' });

    const { upcoming, past } = partitionShows([later, older, soon, old], NOW);
    expect(upcoming.map((event) => event.id)).toEqual(['soon', 'later']);
    expect(past.map((event) => event.id)).toEqual(['old', 'older']);
  });

  it('treats a show with no set time as upcoming, and puts it first', () => {
    const undated = show({ id: 'undated', setStartAt: null });
    const dated = show({ id: 'dated', setStartAt: '2026-09-20T20:00:00Z' });
    const { upcoming, past } = partitionShows([dated, undated], NOW);
    // An unconfirmed set time is the most urgent thing on the list, not the
    // least — it is the promoter you have to chase.
    expect(upcoming.map((event) => event.id)).toEqual(['undated', 'dated']);
    expect(past).toEqual([]);
  });

  it('keeps a cancelled show in whichever half its date puts it', () => {
    const cancelled = show({ id: 'c', status: 'cancelled', setStartAt: '2026-08-01T20:00:00Z' });
    const { past } = partitionShows([cancelled], NOW);
    expect(past.map((event) => event.id)).toEqual(['c']);
  });

  it('treats an unparseable date as upcoming rather than dropping the show', () => {
    const broken = show({ id: 'broken', setStartAt: 'not a date' });
    const { upcoming } = partitionShows([broken], NOW);
    expect(upcoming.map((event) => event.id)).toEqual(['broken']);
  });
});

describe('describeSetTotal', () => {
  it('gives the count, the length and the verdict', () => {
    const line = describeSetTotal(
      summary({ totalSeconds: 22 * 60, deltaSeconds: -3 * 60, fit: 'under' }),
      6
    );
    expect(line).toContain('6 items');
    expect(line).toContain('22:00');
  });

  it('says the total is only so far when something is unmeasured', () => {
    const line = describeSetTotal(
      summary({ totalSeconds: 20 * 60, unmeasuredCount: 2, isPartial: true, deltaSeconds: -5 * 60 }),
      8
    );
    expect(line).toContain('so far');
  });

  it('reports one item in the singular', () => {
    expect(describeSetTotal(summary({ totalSeconds: 200 }), 1)).toContain('1 item,');
  });
});

describe('describePackState', () => {
  it('says so plainly when the pack exists but has gone nowhere', () => {
    expect(describePackState([], NOW)).toContain('nobody has been sent it');
  });

  it('names each person and what they have done with it', () => {
    const line = describePackState(
      [
        receipt({ name: 'Tunde', role: 'DJ', downloadCount: 2, lastDownloadedAt: NOW.toISOString() }),
        receipt({ id: 'r-2', name: 'Ada', role: 'Sound engineer' }),
      ],
      NOW
    );
    expect(line).toContain('Tunde (DJ)');
    expect(line).toContain('Ada (Sound engineer)');
  });

  it('leaves out a revoked recipient — they no longer have it', () => {
    const line = describePackState(
      [receipt({ name: 'Tunde', revokedAt: NOW.toISOString() })],
      NOW
    );
    expect(line).toContain('nobody has been sent it');
    expect(line).not.toContain('Tunde');
  });
});
