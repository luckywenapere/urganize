import { describe, expect, it } from 'vitest';
import { boardPlacements, BOARD_COLUMNS, type BoardCardKey } from './brief-board';
import {
  BOARD_CARD_MAX_H,
  boardCardMinW,
  clampPlacement,
  layoutPhoneOrder,
  moveBoardCard,
  nudgeBoardCard,
  parseBoardLayout,
  resolveBoardLayout,
  type BoardLayout,
} from './brief-board-layout';

const ALL: BoardCardKey[] = [
  'cover',
  'idea',
  'countdown',
  'feels',
  'palette',
  'look',
  'sound',
  'decisions',
  'moments',
  'people',
];
const present = (keys: BoardCardKey[] = ALL) => new Set(keys);

/** No two cards share a cell, and every card fits inside the 12 columns. */
function expectSound(layout: BoardLayout) {
  const entries = Object.entries(layout) as [BoardCardKey, NonNullable<BoardLayout[BoardCardKey]>][];
  for (const [, p] of entries) {
    expect(p.x).toBeGreaterThanOrEqual(1);
    expect(p.x + p.w).toBeLessThanOrEqual(BOARD_COLUMNS + 1);
    expect(p.y).toBeGreaterThanOrEqual(1);
  }
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [ka, a] = entries[i];
      const [kb, b] = entries[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `${ka} overlaps ${kb}`).toBe(false);
    }
  }
}

describe('clampPlacement', () => {
  it('snaps to whole cells and keeps the card inside 12 columns', () => {
    expect(clampPlacement('idea', { x: 10.6, y: 0, w: 6.2, h: 9 })).toEqual({ x: 7, y: 1, w: 6, h: BOARD_CARD_MAX_H });
  });

  it('never makes a card narrower than it can be read', () => {
    expect(clampPlacement('moments', { x: 1, y: 1, w: 1, h: 1 }).w).toBe(boardCardMinW('moments'));
  });
});

describe('resolveBoardLayout', () => {
  it('uses the default layout when nothing is stored', () => {
    expect(resolveBoardLayout(null, present())).toEqual(boardPlacements(present()));
    expect(resolveBoardLayout({}, present())).toEqual(boardPlacements(present()));
  });

  it('keeps stored places and drops cards that are not there', () => {
    const stored: BoardLayout = { idea: { x: 1, y: 1, w: 12, h: 1 }, settle: { x: 1, y: 2, w: 12, h: 1 } };
    const layout = resolveBoardLayout(stored, present(['idea', 'cover']));
    expect(layout.idea).toEqual({ x: 1, y: 1, w: 12, h: 1 });
    expect(layout.settle).toBeUndefined();
    // The cover was never placed, so it lands below what was.
    expect(layout.cover?.y).toBe(2);
    expectSound(layout);
  });

  it('pulls cards up so the board never shows an empty row', () => {
    const stored: BoardLayout = { idea: { x: 1, y: 5, w: 6, h: 1 }, cover: { x: 7, y: 9, w: 6, h: 1 } };
    const layout = resolveBoardLayout(stored, present(['idea', 'cover']));
    expect(layout.idea?.y).toBe(1);
    expect(layout.cover?.y).toBe(1);
  });

  it('untangles a stored layout that overlaps', () => {
    const stored: BoardLayout = { idea: { x: 1, y: 1, w: 8, h: 1 }, cover: { x: 5, y: 1, w: 8, h: 1 } };
    expectSound(resolveBoardLayout(stored, present(['idea', 'cover'])));
  });
});

describe('moveBoardCard', () => {
  it('a dropped card pushes the cards it lands on down', () => {
    const start = boardPlacements(present());
    const moved = moveBoardCard(start, 'moments', { x: 1, y: 1, w: 12, h: 1 });
    expect(moved.moments).toEqual({ x: 1, y: 1, w: 12, h: 1 });
    expect(moved.cover!.y).toBeGreaterThan(1);
    expectSound(moved);
  });

  it('keeps every card when resizing to full width', () => {
    const start = boardPlacements(present());
    const moved = moveBoardCard(start, 'idea', { ...start.idea!, x: 1, w: 12 });
    expect(Object.keys(moved).sort()).toEqual(Object.keys(start).sort());
    expectSound(moved);
  });

  it('cannot drop a card past the right edge', () => {
    const start = boardPlacements(present());
    const moved = moveBoardCard(start, 'countdown', { x: 12, y: 1, w: 4, h: 1 });
    expect(moved.countdown!.x + moved.countdown!.w).toBe(BOARD_COLUMNS + 1);
    expectSound(moved);
  });

  it('ignores a card that is not on the board', () => {
    const start = boardPlacements(present(['idea']));
    expect(moveBoardCard(start, 'cover', { x: 1, y: 1, w: 4, h: 1 })).toEqual(start);
  });
});

describe('nudgeBoardCard', () => {
  it('moves one cell with the arrow keys and resizes with shift', () => {
    const start: BoardLayout = { idea: { x: 1, y: 1, w: 6, h: 1 } };
    expect(nudgeBoardCard(start, 'idea', 'right', false).idea).toEqual({ x: 2, y: 1, w: 6, h: 1 });
    expect(nudgeBoardCard(start, 'idea', 'right', true).idea).toEqual({ x: 1, y: 1, w: 7, h: 1 });
    expect(nudgeBoardCard(start, 'idea', 'down', true).idea).toEqual({ x: 1, y: 1, w: 6, h: 2 });
    expect(nudgeBoardCard(start, 'idea', 'left', false).idea).toEqual({ x: 1, y: 1, w: 6, h: 1 });
  });

  it('moving down goes below the next card', () => {
    const start: BoardLayout = { idea: { x: 1, y: 1, w: 12, h: 1 }, cover: { x: 1, y: 2, w: 12, h: 2 } };
    const moved = nudgeBoardCard(start, 'idea', 'down', false);
    expect(moved.cover!.y).toBe(1);
    expect(moved.idea!.y).toBe(3);
  });

  it('moving down passes only the next card, not the one after it', () => {
    const start: BoardLayout = {
      idea: { x: 1, y: 1, w: 5, h: 1 },
      cover: { x: 1, y: 2, w: 5, h: 2 },
      look: { x: 1, y: 4, w: 7, h: 2 },
    };
    const moved = nudgeBoardCard(start, 'idea', 'down', false);
    expect(moved.cover!.y).toBe(1);
    expect(moved.idea!.y).toBe(3);
    expect(moved.look!.y).toBe(4);
  });

  it('moving up swaps above the card over it', () => {
    const start: BoardLayout = { cover: { x: 1, y: 1, w: 12, h: 1 }, idea: { x: 1, y: 2, w: 12, h: 1 } };
    const moved = nudgeBoardCard(start, 'idea', 'up', false);
    expect(moved.idea!.y).toBe(1);
    expect(moved.cover!.y).toBe(2);
  });
});

describe('layoutPhoneOrder', () => {
  it('reads top to bottom, then left to right', () => {
    const layout: BoardLayout = {
      people: { x: 1, y: 3, w: 12, h: 1 },
      idea: { x: 6, y: 1, w: 7, h: 1 },
      cover: { x: 1, y: 1, w: 5, h: 2 },
    };
    expect(layoutPhoneOrder(layout)).toEqual(['cover', 'idea', 'people']);
  });
});

describe('parseBoardLayout', () => {
  it('accepts a list of placed cards', () => {
    const parsed = parseBoardLayout({ cards: [{ key: 'idea', x: 1, y: 1, w: 6, h: 1 }] });
    expect(parsed).toEqual({ ok: true, value: { idea: { x: 1, y: 1, w: 6, h: 1 } } });
  });

  it('turns away unknown cards, repeats and bad numbers', () => {
    expect(parseBoardLayout({ cards: [{ key: 'budget', x: 1, y: 1, w: 6, h: 1 }] }).ok).toBe(false);
    expect(
      parseBoardLayout({
        cards: [
          { key: 'idea', x: 1, y: 1, w: 6, h: 1 },
          { key: 'idea', x: 7, y: 1, w: 6, h: 1 },
        ],
      }).ok
    ).toBe(false);
    expect(parseBoardLayout({ cards: [{ key: 'idea', x: 1.5, y: 1, w: 6, h: 1 }] }).ok).toBe(false);
    expect(parseBoardLayout({ cards: [{ key: 'idea', x: 10, y: 1, w: 6, h: 1 }] }).ok).toBe(false);
    expect(parseBoardLayout({ cards: [] }).ok).toBe(false);
    expect(parseBoardLayout(null).ok).toBe(false);
  });
});
