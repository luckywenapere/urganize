// Reading dates out of the text of a page, and deciding what that text says
// about whether a round is open.
//
// The grant finder never trusts a date the model hands back. A deadline is real
// only when the page text itself holds it, so this module finds every date the
// text holds and refuses the ones that are ambiguous, impossible or missing a
// year. A number that is part of something longer is never read as a date.
//
// Pure. No clock: the caller passes today in.

export type FoundDate = { iso: string; raw: string; index: number };

const MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const MONTH_WORDS = 'january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec';

const pad = (n: number): string => String(n).padStart(2, '0');

export function isCalendarDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const built = new Date(Date.UTC(year, month - 1, day));
  return built.getUTCFullYear() === year && built.getUTCMonth() === month - 1 && built.getUTCDate() === day;
}

/** True only for a day strictly before today. Both are `YYYY-MM-DD`. */
export function isPastDay(iso: string, today: string): boolean {
  return iso < today;
}

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';
const isWordish = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9_]/.test(ch);

function toIso(year: number, month: number, day: number): string | null {
  const iso = `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
  return isCalendarDate(iso) ? iso : null;
}

type Candidate = FoundDate & { end: number };

function scan(text: string, pattern: RegExp, read: (m: RegExpExecArray) => string | null, boundary: (before: string | undefined, after: string | undefined) => boolean): Candidate[] {
  const found: Candidate[] = [];
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (!boundary(text[start - 1], text[end])) {
      re.lastIndex = start + 1;
      continue;
    }
    const iso = read(match);
    if (iso) found.push({ iso, raw: match[0], index: start, end });
  }
  return found;
}

export function readDates(text: string): FoundDate[] {
  if (!text) return [];
  const noDigitNear = (before: string | undefined, after: string | undefined): boolean => !isDigit(before) && !isDigit(after);

  const candidates: Candidate[] = [
    // 2026-11-30
    ...scan(
      text,
      /(\d{4})-(\d{2})-(\d{2})/,
      (m) => toIso(Number(m[1]), Number(m[2]), Number(m[3])),
      (before, after) => !isWordish(before) && before !== '-' && !isDigit(after)
    ),
    // 30 November 2026, 30th Nov 2026, the 3rd of March 2027
    ...scan(
      text,
      new RegExp(String.raw`(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(${MONTH_WORDS})\.?,?\s+(\d{4})`, 'i'),
      (m) => toIso(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1])),
      noDigitNear
    ),
    // November 30, 2026, nov 30 2026
    ...scan(
      text,
      new RegExp(String.raw`(${MONTH_WORDS})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})`, 'i'),
      (m) => toIso(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2])),
      (before, after) => !isWordish(before) && !isDigit(after)
    ),
    // 30/11/2026, 30.11.2026, 11/30/2026, only when it cannot be read two ways
    ...scan(
      text,
      /(\d{1,2})[/.](\d{1,2})[/.](\d{4})/,
      (m) => {
        const a = Number(m[1]);
        const b = Number(m[2]);
        const year = Number(m[3]);
        if (a === b) return toIso(year, a, b);
        if (a > 12 && b <= 12) return toIso(year, b, a);
        if (b > 12 && a <= 12) return toIso(year, a, b);
        return null;
      },
      (before, after) => !isDigit(before) && before !== '/' && before !== '.' && !isDigit(after)
    ),
  ];

  candidates.sort((x, y) => x.index - y.index || y.end - x.end);
  const out: FoundDate[] = [];
  let lastEnd = -1;
  for (const candidate of candidates) {
    if (candidate.index < lastEnd) continue;
    out.push({ iso: candidate.iso, raw: candidate.raw, index: candidate.index });
    lastEnd = candidate.end;
  }
  return out;
}

/** True only when the page text itself holds that exact calendar date. */
export function dateAppearsIn(iso: string, text: string): boolean {
  if (!isCalendarDate(iso)) return false;
  return readDates(text).some((found) => found.iso === iso);
}

const CLOSED_PATTERNS: RegExp[] = [
  /\bapplications?\s+(?:are\s+|have\s+|has\s+)?(?:now\s+|already\s+)?closed\b/i,
  /\b(?:call|round|programme|program|fund|grant|window|opportunity|scheme)\s+(?:is\s+|has\s+|was\s+)?(?:now\s+|already\s+)?closed\b/i,
  /\bno\s+longer\s+(?:accepting|taking|open\s+to|open\s+for)\b/i,
  /\bdeadline\s+(?:has\s+|have\s+|had\s+)?(?:now\s+|already\s+)?(?:passed|expired)\b/i,
  /\bclosed\s+(?:for|to)\s+(?:new\s+)?(?:applications?|applicants?|submissions?)\b/i,
];

/** The page says, in so many words, that the round is over. A coming close does not count. */
export function detectClosedSignal(text: string): boolean {
  return CLOSED_PATTERNS.some((pattern) => pattern.test(text));
}

const ROLLING_PATTERNS: RegExp[] = [
  /\brolling\s+(?:basis|applications?|deadlines?|admissions?|submissions?|review|intake)\b/i,
  /\byear[-\s]round\b/i,
  /\ball\s+year\s+round\b/i,
  /\bthroughout\s+the\s+year\b/i,
];

/** The page says applications are taken all the time, so there is no single deadline. */
export function detectRollingSignal(text: string): boolean {
  return ROLLING_PATTERNS.some((pattern) => pattern.test(text));
}
