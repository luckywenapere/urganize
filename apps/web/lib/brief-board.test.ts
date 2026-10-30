import { describe, expect, it } from 'vitest';
import {
  BOARD_WORD_MAX,
  briefButtonLine,
  briefCountdown,
  briefProgress,
  momentsTrack,
  BOARD_COLUMNS,
  boardPhoneOrder,
  boardPlacements,
  type BoardCardKey,
  normalizeHex,
  parseBriefFeel,
  swatchInk,
} from './brief-board';
import type { BriefDateRow, BriefTaskRow } from './release-brief';

function task(over: Partial<BriefTaskRow> & { id: string }): BriefTaskRow {
  return { title: 'Task', status: 'todo', due_date: null, assigned_to_user_id: null, metadata: null, ...over };
}

function row(over: Partial<BriefDateRow> & { id: string }): BriefDateRow {
  return { title: over.id, date: '', done: false, isRelease: false, ...over };
}

describe('parseBriefFeel', () => {
  it('accepts any subset of the four fields', () => {
    expect(parseBriefFeel({ headline: '  Tell the truth.  ' })).toEqual({ ok: true, value: { headline: 'Tell the truth.' } });
    expect(parseBriefFeel({ palette: ['#e9a53c'] })).toEqual({ ok: true, value: { palette: ['#E9A53C'] } });
  });

  it('refuses a body with none of them', () => {
    expect(parseBriefFeel({ idea: 'x' }).ok).toBe(false);
    expect(parseBriefFeel(null).ok).toBe(false);
  });

  it('cleans words: trims, drops blanks and repeats (any case), caps at 6', () => {
    const parsed = parseBriefFeel({ feelsLike: [' Sunlit ', '', 'sunlit', 'Close', 'a', 'b', 'c', 'd', 'e'] });
    expect(parsed).toEqual({ ok: true, value: { feelsLike: ['Sunlit', 'Close', 'a', 'b', 'c', 'd'] } });
  });

  it('refuses a word that is too long', () => {
    expect(parseBriefFeel({ notThis: ['x'.repeat(BOARD_WORD_MAX + 1)] }).ok).toBe(false);
  });

  it('refuses a headline over 120 characters', () => {
    expect(parseBriefFeel({ headline: 'x'.repeat(121) }).ok).toBe(false);
  });

  it('refuses a colour that is not a hex code', () => {
    expect(parseBriefFeel({ palette: ['gold'] }).ok).toBe(false);
  });

  it('refuses a list that is not an array of strings', () => {
    expect(parseBriefFeel({ feelsLike: 'Sunlit' }).ok).toBe(false);
    expect(parseBriefFeel({ palette: [3] }).ok).toBe(false);
  });
});

describe('normalizeHex', () => {
  it('reads 3 and 6 digit codes, with or without #', () => {
    expect(normalizeHex('fa0')).toBe('#FFAA00');
    expect(normalizeHex(' #c4612a ')).toBe('#C4612A');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('zzzzzz')).toBeNull();
  });
});

describe('swatchInk', () => {
  it('puts dark text on light colours and light text on dark ones', () => {
    expect(swatchInk('#F2E2C2')).toBe('dark');
    expect(swatchInk('#3A2417')).toBe('light');
  });
});

describe('briefCountdown', () => {
  it('counts whole days to release in Lagos days', () => {
    expect(briefCountdown('2026-11-06', '2026-10-30')).toEqual({ kind: 'before', days: 7 });
  });
  it('says today on release day', () => {
    expect(briefCountdown('2026-11-06', '2026-11-06')).toEqual({ kind: 'today', days: 0 });
  });
  it('counts days since once it is out', () => {
    expect(briefCountdown('2026-11-06', '2026-11-09')).toEqual({ kind: 'after', days: 3 });
  });
  it('has no countdown without a release day', () => {
    expect(briefCountdown(null, '2026-10-30')).toEqual({ kind: 'none', days: 0 });
  });
});

describe('briefProgress', () => {
  it('counts done, total and late, leaving cancelled tasks out', () => {
    const tasks = [
      task({ id: '1', status: 'done', due_date: '2026-10-01' }),
      task({ id: '2', status: 'todo', due_date: '2026-10-29' }),
      task({ id: '3', status: 'in_progress', due_date: '2026-10-29T10:00:00Z' }),
      task({ id: '4', status: 'todo', due_date: '2026-10-30' }),
      task({ id: '5', status: 'cancelled', due_date: '2026-10-01' }),
      task({ id: '6', status: 'todo' }),
    ];
    expect(briefProgress(tasks, '2026-10-30')).toEqual({ done: 1, total: 5, late: 2 });
  });
});

describe('momentsTrack', () => {
  const today = '2026-10-30';
  it('spaces moments evenly and puts today between the past and the future', () => {
    const track = momentsTrack(
      [
        row({ id: 'a', date: '2026-09-18' }),
        row({ id: 'b', date: '2026-10-24', done: true }),
        row({ id: 'c', date: '2026-11-02' }),
        row({ id: 'release', date: '2026-11-06', isRelease: true }),
      ],
      today
    );
    expect(track.points.map((point) => point.state)).toEqual(['late', 'done', 'next', 'release']);
    const positions = track.points.map((point) => point.at);
    expect(positions[0]).toBeGreaterThan(0);
    expect(positions[3]).toBeLessThan(100);
    // Even spacing.
    expect(Math.round(positions[1] - positions[0])).toBe(Math.round(positions[2] - positions[1]));
    // Today sits between b and c.
    expect(track.todayAt).toBeGreaterThan(positions[1]);
    expect(track.todayAt).toBeLessThan(positions[2]);
  });

  it('puts today at the start when everything is ahead, and at the end when all is behind', () => {
    const ahead = momentsTrack([row({ id: 'x', date: '2026-11-02' })], today);
    expect(ahead.todayAt).toBeLessThan(ahead.points[0].at);
    const behind = momentsTrack([row({ id: 'x', date: '2026-10-02', done: true })], today);
    expect(behind.todayAt).toBeGreaterThan(behind.points[0].at);
  });

  it('marks a moment due today as next, not late', () => {
    expect(momentsTrack([row({ id: 'x', date: today })], today).points[0].state).toBe('next');
  });

  it('has no today marker for undated plans', () => {
    const track = momentsTrack([row({ id: 'x', when: 'Now' }), row({ id: 'release', isRelease: true, when: 'Pick a day' })], today);
    expect(track.todayAt).toBeNull();
    expect(track.points.map((point) => point.state)).toEqual(['next', 'release']);
  });
});

describe('board layout', () => {
  const all = new Set<BoardCardKey>(['cover', 'idea', 'countdown', 'feels', 'palette', 'look', 'sound', 'decisions', 'settle', 'moments', 'people', 'side']);

  it('never puts two cards on the same cell', () => {
    for (const present of [all, new Set<BoardCardKey>(['cover', 'idea', 'countdown', 'feels', 'palette', 'look', 'sound', 'decisions', 'moments', 'people'])]) {
      const placed = boardPlacements(present);
      const cells = new Set<string>();
      for (const spot of Object.values(placed)) {
        for (let x = spot.x; x < spot.x + spot.w; x += 1) {
          for (let y = spot.y; y < spot.y + spot.h; y += 1) {
            const cell = `${x}:${y}`;
            expect(cells.has(cell)).toBe(false);
            cells.add(cell);
          }
        }
      }
    }
  });

  it('keeps every card inside 12 columns', () => {
    for (const spot of Object.values(boardPlacements(all))) {
      expect(spot.x).toBeGreaterThanOrEqual(1);
      expect(spot.x + spot.w - 1).toBeLessThanOrEqual(BOARD_COLUMNS);
    }
  });

  it('places only the cards that are there, and closes the gaps they leave', () => {
    const without = boardPlacements(new Set<BoardCardKey>(['cover', 'idea', 'countdown', 'moments', 'people']));
    expect(Object.keys(without).sort()).toEqual(['countdown', 'cover', 'idea', 'moments', 'people']);
    // No side card: who's on what takes the full width.
    expect(without.people?.w).toBe(BOARD_COLUMNS);
    // No rows left empty between the top and the moments line.
    const rows = new Set(Object.values(without).flatMap((spot) => Array.from({ length: spot.h }, (_, i) => spot.y + i)));
    const max = Math.max(...rows);
    for (let y = 1; y <= max; y += 1) expect(rows.has(y)).toBe(true);
  });

  it('reads top to bottom on a phone: the record, where we are, the idea, then the look', () => {
    expect(boardPhoneOrder(all).slice(0, 4)).toEqual(['cover', 'countdown', 'idea', 'settle']);
    expect(boardPhoneOrder(new Set<BoardCardKey>(['look', 'cover']))).toEqual(['cover', 'look']);
  });
});

describe('briefButtonLine', () => {
  it('uses the one-line idea first', () => {
    expect(briefButtonLine({ headline: 'Tell the truth.', idea: 'A long story.' })).toBe('Tell the truth.');
  });

  it('falls back to the first sentence of the story', () => {
    expect(briefButtonLine({ headline: '', idea: 'Warm and handmade. Then more.' })).toBe('Warm and handmade.');
    expect(briefButtonLine({ headline: '  ', idea: '\n First line\nsecond line' })).toBe('First line');
  });

  it('shortens a long sentence', () => {
    const line = briefButtonLine({ headline: '', idea: 'word '.repeat(40) });
    expect(line.length).toBeLessThanOrEqual(80);
    expect(line.endsWith('…')).toBe(true);
  });

  it('is empty when there is nothing written', () => {
    expect(briefButtonLine({ headline: '', idea: '' })).toBe('');
  });
});
