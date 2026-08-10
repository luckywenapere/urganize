// Copy + formatting rules for the release recap card. Pure functions only (no
// node imports, no React) so the card renderer, the API route and the modal can
// all share them and so the brand copy rules are enforced by unit test.
//
// Two house rules apply to EVERY string that reaches the card, including
// user-entered text we do not control:
//   1. No em dashes or en dashes anywhere.
//   2. Never a comma before "and".

const DASHES = /\s*[–—]\s*/g;
const COMMA_BEFORE_AND = /,(\s+and\b)/gi;

/**
 * Normalize any dynamic string before it reaches the card. Dashes become a
 * comma + space (the natural replacement in a clause), then the comma-before-
 * "and" rule is applied to whatever that produced, so "a — and b" cannot smuggle
 * a violation in through the dash rule.
 */
export function sanitizeRecapText(value: string): string {
  return value
    .replace(DASHES, ', ')
    .replace(COMMA_BEFORE_AND, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Thousands separators, so 12400 reads as 12,400 on the poster. */
export function formatRecapNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * releases.release_date is a DATE column. Parsing the bare string would read it
 * as UTC midnight and shift the day backwards in western timezones, so append a
 * local midnight the way every other formatter in the app does.
 */
export function parseReleaseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/** "August 9, 2026", or null when the release has no date set. */
export function formatRecapDate(value: string | null | undefined): string | null {
  const parsed = parseReleaseDate(value);
  if (!parsed) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

/** Singular/plural without a leading count, since the card renders the number separately. */
export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export const RECAP_TITLE_MAX_CHARS = 60;

/**
 * Hard ceiling on the headline. Uses a real ellipsis character rather than
 * three dots so the poster's typography stays clean.
 */
export function truncateTitle(title: string, max = RECAP_TITLE_MAX_CHARS): string {
  if (title.length <= max) return title;
  return `${title.slice(0, max - 1).trimEnd()}…`;
}

export type RecapCardSize = 'story' | 'square';

/**
 * The headline is the loudest thing on the card, so it scales down in tiers as
 * the title gets longer instead of wrapping into a wall of text. Square is
 * roughly 65% of story throughout, matching the smaller canvas.
 *
 * These run large on purpose. The canvas is 1080px wide and gets viewed as a
 * thumbnail in a feed before anyone opens it, so a timid headline reads as a
 * document rather than a poster. A short title fills most of the width.
 */
export function titleFontSize(title: string, size: RecapCardSize): number {
  const length = truncateTitle(title).length;
  const story = length <= 14 ? 200 : length <= 24 ? 144 : length <= 40 ? 100 : 76;
  const square = length <= 14 ? 132 : length <= 24 ? 100 : length <= 40 ? 72 : 56;
  return size === 'story' ? story : square;
}

// Static card copy. Kept here (not inline in the renderer) so the copy-rule
// test can assert over every string the card can print.
export const RECAP_EYEBROW = 'RELEASE RECAP';
export const RECAP_NO_DATE_LABEL = 'OUT NOW';
export const RECAP_WATERMARK = 'Made with Urganize';

export const RECAP_STAT_LABELS = {
  tasksCompletedSingular: 'task completed',
  tasksCompletedPlural: 'tasks completed',
  daysOfWorkSingular: 'day of work',
  daysOfWorkPlural: 'days of work',
  teamSize: 'people on the team',
  firstWeekStreams: 'first week streams',
  pitchesSent: 'playlist pitches sent',
  pitchAdds: 'playlist adds',
} as const;

export const RECAP_STATIC_STRINGS: string[] = [
  RECAP_EYEBROW,
  RECAP_NO_DATE_LABEL,
  RECAP_WATERMARK,
  ...Object.values(RECAP_STAT_LABELS),
];
