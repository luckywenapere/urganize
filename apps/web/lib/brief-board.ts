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

/** A quarter of the board: the grid keeps 12 tracks, so a stored arrangement
 *  still reads, and the default places cards on four columns of three (#1230). */
export const BOARD_QUARTER = BOARD_COLUMNS / 4;

/**
 * Split `quarters` quarters starting at column `x` between the cards that are
 * there, by weight, so every card starts and ends on a quarter line. Each card
 * gets at least one quarter; the last takes what is left.
 */
function shareRow(
  cards: { key: BoardCardKey; weight: number }[],
  present: Set<BoardCardKey>,
  x: number,
  quarters: number
): { key: BoardCardKey; x: number; w: number }[] {
  const here = cards.filter((card) => present.has(card.key)).slice(0, quarters);
  const total = here.reduce((sum, card) => sum + card.weight, 0);
  let cursor = 0;
  return here.map((card, index) => {
    const left = here.length - index - 1;
    const share = index === here.length - 1 ? quarters - cursor : Math.max(1, Math.min(quarters - cursor - left, Math.round((card.weight / total) * quarters)));
    const out = { key: card.key, x: x + cursor * BOARD_QUARTER, w: share * BOARD_QUARTER };
    cursor += share;
    return out;
  });
}

/**
 * Where each card sits on a wide board (the approved mock, #1230): four
 * columns. The cover takes the first column down two rows; beside it the
 * countdown and the idea, then how it feels, its colours and the people. Then
 * the sound beside the look, what was decided beside what is left to settle,
 * the moments across the board, and what we are making beside the notes.
 * Only the cards that are there get a place, and the rest close up, so a
 * young rollout never shows holes. Rows size to their content; a card's `h`
 * is how many of those rows it spans.
 */
export function boardPlacements(present: Set<BoardCardKey>): Partial<Record<BoardCardKey, BoardPlacement>> {
  const out: Partial<Record<BoardCardKey, BoardPlacement>> = {};
  let y = 1;
  const cover = present.has('cover');

  // Band 1: the record, then the idea and how it feels.
  const topRows = [
    [{ key: 'countdown', weight: 1 }, { key: 'idea', weight: 2 }],
    [{ key: 'feels', weight: 1 }, { key: 'palette', weight: 1 }, { key: 'people', weight: 1 }],
  ] as { key: BoardCardKey; weight: number }[][];
  const rightTop = topRows
    .map((row) => (cover ? shareRow(row, present, 1 + BOARD_QUARTER, 3) : shareRow(row, present, 1, 4)))
    .filter((row) => row.length > 0);
  if (cover) out.cover = rightTop.length ? { x: 1, y, w: BOARD_QUARTER, h: rightTop.length } : { x: 1, y, w: BOARD_COLUMNS, h: 1 };
  rightTop.forEach((row, index) => {
    for (const cell of row) out[cell.key] = { x: cell.x, y: y + index, w: cell.w, h: 1 };
  });
  y += Math.max(rightTop.length, cover ? 1 : 0);

  // Then pairs across the board, and the moments line on its own.
  const rest: { key: BoardCardKey; weight: number }[][] = [
    [{ key: 'sound', weight: 1 }, { key: 'look', weight: 1 }],
    [{ key: 'decisions', weight: 1 }, { key: 'settle', weight: 1 }],
    [{ key: 'moments', weight: 1 }],
    [{ key: 'pieces', weight: 1 }, { key: 'side', weight: 1 }],
  ];
  for (const row of rest) {
    const cells = shareRow(row, present, 1, 4);
    if (cells.length === 0) continue;
    for (const cell of cells) out[cell.key] = { x: cell.x, y, w: cell.w, h: 1 };
    y += 1;
  }
  return out;
}

/**
 * The cover's title size on a wide board (#1230): big, but never so big that a
 * word breaks in the middle ("Owa / mbe / Seas / on"). The longest word has to
 * fit across the cover, so the size follows the cover's width (container
 * units) divided by that word's length, between a floor and a ceiling. The
 * title then wraps only at spaces.
 */
export const COVER_TITLE_MIN_PX = 18;
export const COVER_TITLE_MAX_PX = 40;
/** Roughly how wide one letter of the display face is, in ems. */
const DISPLAY_EM_PER_LETTER = 0.6;

export function coverTitleFontSize(title: string): string {
  const longest = Math.max(1, ...title.trim().split(/\s+/).map((word) => [...word].length));
  const max = title.trim().length > 28 ? 30 : COVER_TITLE_MAX_PX;
  const per = (longest * DISPLAY_EM_PER_LETTER).toFixed(2);
  return `clamp(${COVER_TITLE_MIN_PX}px, calc(100cqw / ${per}), ${max}px)`;
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

// ── UrgAns's first board (#897 phase 5) ─────────────────────────────────────

/** How many words UrgAns puts in Feels like and Not this. */
export const MODEL_FEELS_MAX = 4;
export const MODEL_NOT_THIS_MAX = 3;

function modelWords(value: unknown, max: number): string[] {
  // A list, or a comma-separated string from a model that ignored the format.
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const seen = new Set<string>();
  const words: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const word = entry
      .replace(/[#*_"“”]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.,;:!]+$/, '');
    // A word, or two or three: a long phrase is not a mood word.
    if (!word || word.length > BOARD_WORD_MAX) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
    if (words.length >= max) break;
  }
  return words;
}

/**
 * The look and feel from UrgAns's JSON, lenient: whatever is usable is kept,
 * anything else is dropped, and nothing here ever fails a run. Accepts
 * snake_case or camelCase keys.
 */
export function feelFromModel(parsed: unknown): Omit<BriefFeel, 'palette'> {
  const input = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const headline =
    typeof input.headline === 'string'
      ? input.headline
          .split('\n')[0]
          .replace(/^["“'\s]+|["”'\s]+$/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, BOARD_HEADLINE_MAX)
      : '';
  return {
    headline,
    feelsLike: modelWords(input.feels_like ?? input.feelsLike, MODEL_FEELS_MAX),
    notThis: modelWords(input.not_this ?? input.notThis, MODEL_NOT_THIS_MAX),
  };
}
