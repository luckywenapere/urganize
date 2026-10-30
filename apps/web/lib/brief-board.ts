// The brief as a board (#897, phase 1, 2026-10-30, mock approved:
// docs/mocks/visual-brief/mock.html). The pure rules the board reads: the
// look-and-feel fields people write (headline, feels like, not this, palette),
// and the live parts derived from tasks (countdown, progress, the key moments
// track). The database half is in lib/release-brief-server.ts; the plan for the
// later phases is docs/notes/2026-10-30-brief-board.md.

import { lagosDay, type BriefDateRow, type BriefTaskRow, type Parsed } from '@/lib/release-brief';

export const BOARD_HEADLINE_MAX = 120;
export const BOARD_WORD_MAX = 24;
export const BOARD_WORDS_MAX = 6;
export const BOARD_PALETTE_MAX = 6;

/** What a board edit may change. Any subset; at least one. */
export type BriefFeel = {
  headline: string;
  feelsLike: string[];
  notThis: string[];
  palette: string[];
};

export type BriefFeelPatch = Partial<BriefFeel>;

/** `#RRGGBB` in capitals from "fa0", "#c4612a" and the like; null when it is not a colour. */
export function normalizeHex(raw: string): string | null {
  const value = raw.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(value)) {
    return `#${value
      .split('')
      .map((char) => char + char)
      .join('')
      .toUpperCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toUpperCase()}`;
  return null;
}

function parseWords(value: unknown, label: string): Parsed<string[]> {
  if (!Array.isArray(value) || value.some((word) => typeof word !== 'string')) {
    return { ok: false, error: `${label} must be a list of words.` };
  }
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of value as string[]) {
    const word = raw.trim().replace(/\s+/g, ' ');
    if (!word) continue;
    if (word.length > BOARD_WORD_MAX) return { ok: false, error: `Keep each word under ${BOARD_WORD_MAX} letters.` };
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return { ok: true, value: words.slice(0, BOARD_WORDS_MAX) };
}

export function parseBriefFeel(body: unknown): Parsed<BriefFeelPatch> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Nothing to save.' };
  const input = body as Record<string, unknown>;
  const out: BriefFeelPatch = {};

  if ('headline' in input) {
    if (typeof input.headline !== 'string') return { ok: false, error: 'The headline must be text.' };
    const headline = input.headline.trim().replace(/\s+/g, ' ');
    if (headline.length > BOARD_HEADLINE_MAX) {
      return { ok: false, error: `Keep the headline under ${BOARD_HEADLINE_MAX} characters.` };
    }
    out.headline = headline;
  }
  if ('feelsLike' in input) {
    const words = parseWords(input.feelsLike, 'Feels like');
    if (!words.ok) return words;
    out.feelsLike = words.value;
  }
  if ('notThis' in input) {
    const words = parseWords(input.notThis, 'Not this');
    if (!words.ok) return words;
    out.notThis = words.value;
  }
  if ('palette' in input) {
    const list = input.palette;
    if (!Array.isArray(list) || list.some((entry) => typeof entry !== 'string')) {
      return { ok: false, error: 'Colours must be a list of hex codes.' };
    }
    const colours: string[] = [];
    for (const entry of list as string[]) {
      const hex = normalizeHex(entry);
      if (!hex) return { ok: false, error: `${entry} is not a colour. Use a code like #E9A53C.` };
      if (!colours.includes(hex)) colours.push(hex);
    }
    out.palette = colours.slice(0, BOARD_PALETTE_MAX);
  }

  if (Object.keys(out).length === 0) return { ok: false, error: 'Nothing to save.' };
  return { ok: true, value: out };
}

/** Text colour that reads on a swatch (WCAG relative luminance). */
export function swatchInk(hex: string): 'dark' | 'light' {
  const value = normalizeHex(hex) ?? '#000000';
  const channel = (index: number) => {
    const c = parseInt(value.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return luminance > 0.36 ? 'dark' : 'light';
}

// ── Live parts, from tasks ───────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / DAY_MS;
}

export type BriefCountdown = { kind: 'before' | 'today' | 'after' | 'none'; days: number };

/** Days between Lagos "today" and release day. */
export function briefCountdown(releaseDate: string | null, today: string): BriefCountdown {
  const release = lagosDay(releaseDate);
  if (!release) return { kind: 'none', days: 0 };
  const diff = Math.round(dayNumber(release) - dayNumber(today));
  if (diff > 0) return { kind: 'before', days: diff };
  if (diff === 0) return { kind: 'today', days: 0 };
  return { kind: 'after', days: -diff };
}

export type BriefProgress = { done: number; total: number; late: number };

/** Done of total (cancelled left out), and open tasks whose day has passed. */
export function briefProgress(tasks: BriefTaskRow[], today: string): BriefProgress {
  let done = 0;
  let total = 0;
  let late = 0;
  for (const task of tasks) {
    const status = String(task.status || '');
    if (status === 'cancelled') continue;
    total += 1;
    if (status === 'done') {
      done += 1;
      continue;
    }
    const due = lagosDay(task.due_date);
    if (due && due < today) late += 1;
  }
  return { done, total, late };
}

export type MomentState = 'done' | 'late' | 'next' | 'release';
export type MomentPoint = { row: BriefDateRow; state: MomentState; at: number };
export type MomentsTrack = { points: MomentPoint[]; todayAt: number | null };

/**
 * The key moments line. Moments are spaced evenly, not to scale: a rollout's
 * dates bunch up near release day, and to scale they would print on top of
 * each other. Today is a marker between the last moment behind us and the
 * first one ahead, so "where are we" reads at a glance. Positions are percent
 * of the track's width, kept inside 6 to 94 so end labels have room.
 */
export function momentsTrack(rows: BriefDateRow[], today: string): MomentsTrack {
  const START = 6;
  const END = 94;
  const count = rows.length;
  const step = count > 1 ? (END - START) / (count - 1) : 0;
  const atIndex = (index: number) => (count > 1 ? START + step * index : 50);

  const points: MomentPoint[] = rows.map((row, index) => {
    let state: MomentState;
    if (row.isRelease) state = 'release';
    else if (row.done) state = 'done';
    else if (row.date && row.date < today) state = 'late';
    else state = 'next';
    return { row, state, at: atIndex(index) };
  });

  const dated = rows.some((row) => row.date);
  if (!dated || count === 0) return { points, todayAt: null };

  const behind = rows.filter((row) => row.date && row.date < today).length;
  let todayAt: number;
  if (behind === 0) todayAt = count > 1 ? Math.max(1, START - step / 2) : 30;
  else if (behind >= count) todayAt = count > 1 ? Math.min(99, END + step / 2) : 70;
  else todayAt = (atIndex(behind - 1) + atIndex(behind)) / 2;
  return { points, todayAt };
}

// ── Layout ───────────────────────────────────────────────────────────────────

export const BOARD_COLUMNS = 12;

/**
 * The cards a board can show. `side` is the small card next to who's on what:
 * the ideas a brief came from when there are any, else the rollout's notes.
 * The cover is always there (with no art it is a flat tile with the title).
 */
export type BoardCardKey =
  | 'cover'
  | 'idea'
  | 'countdown'
  | 'feels'
  | 'palette'
  | 'look'
  | 'sound'
  | 'decisions'
  | 'settle'
  | 'pieces'
  | 'moments'
  | 'people'
  | 'side';

/** Grid lines, 1-based: column x for w columns, row y for h rows. */
export type BoardPlacement = { x: number; y: number; w: number; h: number };

/** Split `width` columns starting at `x` between the cards that are there, by weight. */
function shareRow(
  cards: { key: BoardCardKey; weight: number }[],
  present: Set<BoardCardKey>,
  x: number,
  width: number
): { key: BoardCardKey; x: number; w: number }[] {
  const here = cards.filter((card) => present.has(card.key));
  if (here.length === 1) return [{ key: here[0].key, x, w: width }];
  const total = here.reduce((sum, card) => sum + card.weight, 0);
  let cursor = x;
  return here.map((card, index) => {
    const w = index === here.length - 1 ? x + width - cursor : Math.round((card.weight / total) * width);
    const out = { key: card.key, x: cursor, w };
    cursor += w;
    return out;
  });
}

/**
 * Where each card sits on a wide board (the approved mock): the vision on top
 * (cover beside the idea, the countdown, how it feels and its colours), the
 * look and sound next, then the work (to settle, key moments, who's on what).
 * Only the cards that are there get a place, and the rest close up, so a
 * young rollout never shows holes. Rows size to their content; a card's `h`
 * is how many of those rows it spans.
 */
export function boardPlacements(present: Set<BoardCardKey>): Partial<Record<BoardCardKey, BoardPlacement>> {
  const out: Partial<Record<BoardCardKey, BoardPlacement>> = {};
  let y = 1;

  // Band 1: the record beside the idea.
  const rightTop = [
    shareRow([{ key: 'idea', weight: 5 }, { key: 'countdown', weight: 2 }], present, 6, 7),
    shareRow([{ key: 'feels', weight: 3 }, { key: 'palette', weight: 4 }], present, 6, 7),
  ].filter((row) => row.length > 0);
  if (present.has('cover')) {
    if (rightTop.length === 0) {
      out.cover = { x: 1, y, w: BOARD_COLUMNS, h: 1 };
    } else {
      out.cover = { x: 1, y, w: 5, h: rightTop.length };
    }
  }
  const coverless = !present.has('cover');
  rightTop.forEach((row, index) => {
    const widen = coverless ? shareRow(row.map((cell) => ({ key: cell.key, weight: cell.w })), present, 1, BOARD_COLUMNS) : row;
    for (const cell of widen) out[cell.key] = { x: cell.x, y: y + index, w: cell.w, h: 1 };
  });
  y += Math.max(rightTop.length, present.has('cover') ? 1 : 0);

  // Band 2: the look beside sound and decisions.
  const stack = (['sound', 'decisions'] as const).filter((key) => present.has(key));
  if (present.has('look')) {
    out.look = { x: 1, y, w: stack.length ? 7 : BOARD_COLUMNS, h: Math.max(stack.length, 1) };
    stack.forEach((key, index) => {
      out[key] = { x: 8, y: y + index, w: 5, h: 1 };
    });
    y += Math.max(stack.length, 1);
  } else if (stack.length) {
    for (const cell of shareRow(stack.map((key) => ({ key, weight: 1 })), present, 1, BOARD_COLUMNS)) {
      out[cell.key] = { x: cell.x, y, w: cell.w, h: 1 };
    }
    y += 1;
  }

  // Band 3: the work.
  for (const key of ['settle', 'pieces', 'moments'] as const) {
    if (!present.has(key)) continue;
    out[key] = { x: 1, y, w: BOARD_COLUMNS, h: 1 };
    y += 1;
  }
  const bottom = shareRow([{ key: 'people', weight: 7 }, { key: 'side', weight: 5 }], present, 1, BOARD_COLUMNS);
  for (const cell of bottom) out[cell.key] = { x: cell.x, y, w: cell.w, h: 1 };

  return out;
}

const PHONE_ORDER: BoardCardKey[] = [
  'cover',
  'countdown',
  'idea',
  'settle',
  'feels',
  'palette',
  'look',
  'sound',
  'decisions',
  'pieces',
  'moments',
  'people',
  'side',
];

/** One column on a phone, in the order a person needs it: the record, where we are, the idea, then the look and the work. */
export function boardPhoneOrder(present: Set<BoardCardKey>): BoardCardKey[] {
  return PHONE_ORDER.filter((key) => present.has(key));
}

// ── The plan's Brief button (#902) ──────────────────────────────────────────

const BUTTON_LINE_MAX = 80;

/**
 * The line under "Brief" on the plan's button: the one-line idea, else the
 * first sentence (or line) of the story, cut to fit. Empty when nothing is
 * written yet, and the button says "Write the brief" instead.
 */
export function briefButtonLine(input: { headline: string; idea: string }): string {
  const headline = input.headline.trim();
  const source = headline || input.idea.trim().split('\n')[0].trim();
  if (!source) return '';
  const sentence = headline ? source : (source.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? source);
  if (sentence.length <= BUTTON_LINE_MAX) return sentence;
  return `${sentence.slice(0, BUTTON_LINE_MAX - 1).trimEnd()}…`;
}
