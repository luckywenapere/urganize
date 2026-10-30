// Arranging the brief board (#897 phase 1b, 2026-10-30). Pure, so the rules a
// drag follows are tested without a browser: cards snap to whole cells, stay
// inside 12 columns, never overlap, and fall up so the board shows no empty
// rows. A layout is only stored once a team owner or admin moves a card;
// until then the board uses `boardPlacements`, the approved default.

import type { Parsed } from '@/lib/release-brief';
import { BOARD_COLUMNS, boardPlacements, type BoardCardKey, type BoardPlacement } from '@/lib/brief-board';

export type BoardLayout = Partial<Record<BoardCardKey, BoardPlacement>>;

/** The tallest a card can be, in board rows. */
export const BOARD_CARD_MAX_H = 4;

export const BOARD_CARD_KEYS: readonly BoardCardKey[] = [
  'cover',
  'idea',
  'countdown',
  'feels',
  'palette',
  'look',
  'sound',
  'decisions',
  'settle',
  'moments',
  'people',
  'side',
];

// The narrowest each card still reads at, in columns.
const MIN_W: Record<BoardCardKey, number> = {
  cover: 3,
  idea: 4,
  countdown: 2,
  feels: 3,
  palette: 3,
  look: 4,
  sound: 3,
  decisions: 3,
  settle: 4,
  moments: 6,
  people: 4,
  side: 3,
};

export function boardCardMinW(key: BoardCardKey): number {
  return MIN_W[key];
}

export function isBoardCardKey(value: unknown): value is BoardCardKey {
  return typeof value === 'string' && (BOARD_CARD_KEYS as readonly string[]).includes(value);
}

/** Whole cells, at least the card's narrowest, inside the 12 columns. */
export function clampPlacement(key: BoardCardKey, p: BoardPlacement): BoardPlacement {
  const w = Math.min(BOARD_COLUMNS, Math.max(MIN_W[key], Math.round(p.w)));
  const h = Math.min(BOARD_CARD_MAX_H, Math.max(1, Math.round(p.h)));
  const x = Math.min(BOARD_COLUMNS + 1 - w, Math.max(1, Math.round(p.x)));
  const y = Math.max(1, Math.round(p.y));
  return { x, y, w, h };
}

function overlaps(a: BoardPlacement, b: BoardPlacement): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Lay the cards down one by one in `order`: each is pushed below anything it
 * lands on, then falls up until it meets a card. Falling stops at the first
 * card in the way, so a card never jumps over one placed before it.
 */
function settle(order: { key: BoardCardKey; p: BoardPlacement }[]): BoardLayout {
  const placed: { key: BoardCardKey; p: BoardPlacement }[] = [];
  for (const card of order) {
    const p = { ...card.p };
    for (let hit = placed.find((other) => overlaps(p, other.p)); hit; hit = placed.find((other) => overlaps(p, other.p))) {
      p.y = hit.p.y + hit.p.h;
    }
    while (p.y > 1 && !placed.some((other) => overlaps({ ...p, y: p.y - 1 }, other.p))) p.y -= 1;
    placed.push({ key: card.key, p });
  }
  const out: BoardLayout = {};
  for (const card of placed) out[card.key] = card.p;
  return out;
}

const byPosition = (a: { p: BoardPlacement }, b: { p: BoardPlacement }) => a.p.y - b.p.y || a.p.x - b.p.x;

/**
 * The layout a board shows: the stored places of the cards that are there,
 * new cards added at the bottom at their default width, then settled. With
 * nothing stored it is the default layout, untouched.
 */
export function resolveBoardLayout(stored: BoardLayout | null, present: Set<BoardCardKey>): BoardLayout {
  const fallback = boardPlacements(present);
  const storedKeys = stored ? (Object.keys(stored) as BoardCardKey[]).filter((key) => present.has(key)) : [];
  if (storedKeys.length === 0) return fallback;

  const cards = storedKeys.map((key) => ({ key, p: clampPlacement(key, stored![key]!) })).sort(byPosition);
  let bottom = cards.reduce((max, card) => Math.max(max, card.p.y + card.p.h), 1);
  for (const key of BOARD_CARD_KEYS) {
    if (!present.has(key) || storedKeys.includes(key)) continue;
    const base = fallback[key] ?? { x: 1, y: 1, w: BOARD_COLUMNS, h: 1 };
    cards.push({ key, p: clampPlacement(key, { ...base, x: 1, y: bottom }) });
    bottom += base.h;
  }
  return settle(cards);
}

/**
 * Drop `key` at `to` (moved, resized or both). The cards it lands on are
 * pushed down. Moving down past a card puts it below that card; moving up
 * puts it above.
 */
export function moveBoardCard(layout: BoardLayout, key: BoardCardKey, to: BoardPlacement): BoardLayout {
  const from = layout[key];
  if (!from) return layout;
  const target = clampPlacement(key, to);
  const lead = target.y > from.y ? 0.5 : -0.5;
  const cards = (Object.keys(layout) as BoardCardKey[]).map((other) => ({
    key: other,
    p: other === key ? target : layout[other]!,
    sort: other === key ? target.y + lead : layout[other]!.y,
  }));
  cards.sort((a, b) => a.sort - b.sort || a.p.x - b.p.x);
  return settle(cards);
}

export type NudgeDirection = 'up' | 'down' | 'left' | 'right';

/** The keyboard way to arrange: arrows move a card one cell, shift and arrows resize it. */
export function nudgeBoardCard(layout: BoardLayout, key: BoardCardKey, direction: NudgeDirection, resize: boolean): BoardLayout {
  const p = layout[key];
  if (!p) return layout;
  const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  if (resize) return moveBoardCard(layout, key, { ...p, w: p.w + dx, h: p.h + dy });
  // Down moves below the next card in the way, not just one row.
  if (dy === 1) {
    const below = (Object.keys(layout) as BoardCardKey[])
      .filter((other) => other !== key)
      .map((other) => layout[other]!)
      .filter((other) => other.y >= p.y + p.h && other.x < p.x + p.w && p.x < other.x + other.w)
      .sort((a, b) => a.y - b.y)[0];
    // Aiming at the next card's own row puts this one just after it.
    return moveBoardCard(layout, key, { ...p, y: below ? below.y : p.y + 1 });
  }
  return moveBoardCard(layout, key, { ...p, x: p.x + dx, y: p.y + dy });
}

/** One column on a phone once a board is arranged: top to bottom, then left to right. */
export function layoutPhoneOrder(layout: BoardLayout): BoardCardKey[] {
  return (Object.keys(layout) as BoardCardKey[])
    .map((key) => ({ key, p: layout[key]! }))
    .sort(byPosition)
    .map((card) => card.key);
}

const isCell = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** `PUT /brief/layout` body: `{ cards: [{ key, x, y, w, h }] }`, the whole board at once. */
export function parseBoardLayout(body: unknown): Parsed<BoardLayout> {
  const cards = (body as { cards?: unknown } | null)?.cards;
  if (!Array.isArray(cards) || cards.length === 0 || cards.length > BOARD_CARD_KEYS.length) {
    return { ok: false, error: 'Send the board’s cards.' };
  }
  const out: BoardLayout = {};
  for (const raw of cards) {
    const card = raw as Record<string, unknown> | null;
    if (!card || !isBoardCardKey(card.key)) return { ok: false, error: 'That card is not on the brief.' };
    if (out[card.key]) return { ok: false, error: 'A card is on the board twice.' };
    const { x, y, w, h } = card;
    if (!isCell(w, 1, BOARD_COLUMNS) || !isCell(x, 1, BOARD_COLUMNS + 1 - (w as number)) || !isCell(y, 1, 200) || !isCell(h, 1, BOARD_CARD_MAX_H)) {
      return { ok: false, error: 'A card is off the board.' };
    }
    out[card.key] = { x, y, w, h };
  }
  return { ok: true, value: out };
}
