import { describe, expect, it } from 'vitest';
import {
  BOARD_WORD_MAX,
  BOARD_HEADLINE_MAX,
  briefButtonLine,
  feelFromModel,
  briefCountdown,
  briefProgress,
  momentsTrack,
  BOARD_COLUMNS,
  BOARD_QUARTER,
  boardPhoneOrder,
  coverTitleFontSize,
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

  it('lays the whole board on four columns (#1230)', () => {
    const placed = boardPlacements(all);
    for (const spot of Object.values(placed)) {
      expect((spot.x - 1) % BOARD_QUARTER).toBe(0);
      expect(spot.w % BOARD_QUARTER).toBe(0);
    }
    // The cover takes the first column, two rows down; the countdown and the
    // idea sit beside it, then how it feels, the colours and the people.
    expect(placed.cover).toEqual({ x: 1, y: 1, w: 3, h: 2 });
    expect(placed.countdown).toEqual({ x: 4, y: 1, w: 3, h: 1 });
    expect(placed.idea).toEqual({ x: 7, y: 1, w: 6, h: 1 });
    expect([placed.feels, placed.palette, placed.people]).toEqual([
      { x: 4, y: 2, w: 3, h: 1 },
      { x: 7, y: 2, w: 3, h: 1 },
      { x: 10, y: 2, w: 3, h: 1 },
    ]);
    // Sound beside the look; the moments line across the board.
    expect(placed.sound).toEqual({ x: 1, y: 3, w: 6, h: 1 });
    expect(placed.look).toEqual({ x: 7, y: 3, w: 6, h: 1 });
    expect(placed.moments?.w).toBe(BOARD_COLUMNS);
  });

  it('places only the cards that are there, and closes the gaps they leave', () => {
    const without = boardPlacements(new Set<BoardCardKey>(['cover', 'idea', 'countdown', 'moments', 'people']));
    expect(Object.keys(without).sort()).toEqual(['countdown', 'cover', 'idea', 'moments', 'people']);
    // No feels or colours: the people take the rest of the row beside the cover.
    expect(without.people).toEqual({ x: 4, y: 2, w: 9, h: 1 });
    // No rows left empty between the top and the moments line.
    const rows = new Set(Object.values(without).flatMap((spot) => Array.from({ length: spot.h }, (_, i) => spot.y + i)));
    const max = Math.max(...rows);
    for (let y = 1; y <= max; y += 1) expect(rows.has(y)).toBe(true);
  });

  it('spreads the top rows across the board when there is no cover', () => {
    const placed = boardPlacements(new Set<BoardCardKey>(['idea', 'countdown', 'feels', 'palette', 'people']));
    expect(placed.countdown).toEqual({ x: 1, y: 1, w: 3, h: 1 });
    expect(placed.idea).toEqual({ x: 4, y: 1, w: 9, h: 1 });
    expect(placed.people!.x + placed.people!.w - 1).toBe(BOARD_COLUMNS);
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

describe('feelFromModel', () => {
  it('takes the one-line idea and the words', () => {
    expect(
      feelFromModel({ headline: '  "Tell the truth, then dance."  ', feels_like: ['Sunlit', 'close', 'Unpolished', 'Joyful'], not_this: ['glossy', 'club lights'] })
    ).toEqual({ headline: 'Tell the truth, then dance.', feelsLike: ['Sunlit', 'close', 'Unpolished', 'Joyful'], notThis: ['glossy', 'club lights'] });
  });

  it('keeps what is usable from bad output', () => {
    const feel = feelFromModel({
      headline: 'x'.repeat(300),
      feels_like: 'warm, handmade, warm, a very long phrase that is not a word at all',
      not_this: [4, null, 'Neon.', '#hashtag'],
    });
    expect(feel.headline.length).toBeLessThanOrEqual(BOARD_HEADLINE_MAX);
    expect(feel.feelsLike).toEqual(['warm', 'handmade']);
    expect(feel.notThis).toEqual(['Neon', 'hashtag']);
  });

  it('caps the lists at four and three, and gives empty fields for nothing', () => {
    const feel = feelFromModel({ feelsLike: ['a1', 'b1', 'c1', 'd1', 'e1'], notThis: ['x1', 'y1', 'z1', 'w1'] });
    expect(feel.feelsLike).toHaveLength(4);
    expect(feel.notThis).toHaveLength(3);
    expect(feelFromModel(null)).toEqual({ headline: '', feelsLike: [], notThis: [] });
    expect(feelFromModel({ headline: 42 })).toEqual({ headline: '', feelsLike: [], notThis: [] });
  });

  it('keeps a headline to its first line', () => {
    expect(feelFromModel({ headline: 'First line\nSecond line' }).headline).toBe('First line');
  });
});

describe('coverTitleFontSize', () => {
  it('sizes the title so its longest word fits across the cover', () => {
    expect(coverTitleFontSize('Owambe Season')).toBe('clamp(18px, calc(100cqw / 3.60), 40px)');
  });

  it('goes smaller for a longer word, and caps a long title lower', () => {
    expect(coverTitleFontSize('Supercalifragilistic')).toBe('clamp(18px, calc(100cqw / 12.00), 40px)');
    expect(coverTitleFontSize('A song with a very long name for a cover')).toBe('clamp(18px, calc(100cqw / 3.00), 30px)');
  });

  it('counts letters, not bytes, and copes with an empty title', () => {
    expect(coverTitleFontSize('Àṣà')).toBe('clamp(18px, calc(100cqw / 1.80), 40px)');
    expect(coverTitleFontSize('  ')).toBe('clamp(18px, calc(100cqw / 0.60), 40px)');
  });
});
