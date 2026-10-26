// Reading a WhatsApp reply. Pure.
//
// The common answers are matched here, with no model, so a chase works with AI
// off and a button tap never costs a model call. Only a reply that is none of
// these goes to the AI (see server.ts).

import { addDays, lagosDay } from './chase-rules';

export type ReplyIntent =
  | { type: 'stop' }
  | { type: 'yes' }
  | { type: 'done' }
  | { type: 'need_time'; date: string | null }
  | { type: 'not_mine' }
  | { type: 'date'; date: string }
  | { type: 'text' };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

function clean(text: string): string {
  return (text || '').toLowerCase().replace(/[^\p{L}\p{N}\s/\-.]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function validDay(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return null;
  return iso;
}

/**
 * Reads a date out of a reply and returns a Lagos day (YYYY-MM-DD), or null.
 * Understands: today, tomorrow, a weekday name (the next one, never today),
 * "2 nov" / "nov 2", "2/11" (day first, as in Nigeria), and 2026-11-02.
 * A date that already passed this year is read as next year's.
 */
export function parseReplyDate(text: string, now: Date): string | null {
  const t = clean(text);
  if (!t) return null;
  const today = lagosDay(now);
  const year = Number(today.slice(0, 4));
  const todayDate = new Date(`${today}T00:00:00Z`);

  const rollForward = (month: number, day: number): string | null => {
    const thisYear = validDay(year, month, day);
    if (!thisYear) return null;
    return thisYear < today ? validDay(year + 1, month, day) : thisYear;
  };

  const iso = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return validDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  if (/\btomorrow\b|\btmrw\b|\btmr\b/.test(t)) return addDays(today, 1);
  if (/\btoday\b|\btonight\b/.test(t)) return today;
  if (/\bnext week\b/.test(t)) return addDays(today, 7);

  const dayFirst = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([a-z]{3,9})\b/);
  if (dayFirst && MONTHS[dayFirst[2]]) return rollForward(MONTHS[dayFirst[2]], Number(dayFirst[1]));
  const monthFirst = t.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthFirst && MONTHS[monthFirst[1]]) return rollForward(MONTHS[monthFirst[1]], Number(monthFirst[2]));

  const slash = t.match(/\b(\d{1,2})[/.-](\d{1,2})\b/);
  if (slash) return rollForward(Number(slash[2]), Number(slash[1]));

  for (const word of t.split(' ')) {
    if (word in WEEKDAYS) {
      const ahead = ((WEEKDAYS[word] - todayDate.getUTCDay() + 7) % 7) || 7;
      return addDays(today, ahead);
    }
  }
  return null;
}

const DONE = /^(done|finished|complete|completed|sent|delivered|uploaded|all done|yes done|it'?s done|i'?ve done it|already done)\b/;
const NEED_TIME = /\b(need more time|more time|not yet|not done|delayed|running late|late|extension|can'?t make|cannot make|won'?t make|need time|push it|postpone)\b/;
const NOT_MINE = /\b(not mine|not my task|not my job|wrong person|someone else|reassign)\b/;

/**
 * `awaitingDate` is true when UrgAns has just asked "what date works?", so a
 * bare "Monday" means a new due date rather than free text.
 */
export function parseReply(text: string, now: Date, awaitingDate = false): ReplyIntent {
  const t = clean(text);
  if (!t) return { type: 'text' };

  if (/^(stop|unsubscribe|cancel|opt ?out|stop all)$/.test(t)) return { type: 'stop' };

  if (awaitingDate) {
    const date = parseReplyDate(text, now);
    if (date) return { type: 'date', date };
  }

  if (NOT_MINE.test(t)) return { type: 'not_mine' };
  if (/^(yes|y|yep|yeah|ok|okay|sure|allow)$/.test(t)) return { type: 'yes' };
  if (DONE.test(t)) return { type: 'done' };
  if (NEED_TIME.test(t)) return { type: 'need_time', date: parseReplyDate(text, now) };
  return { type: 'text' };
}
