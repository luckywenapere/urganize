import { CHAPPI_SPEAKS_RELEASE_WINDOW_DAYS } from './config';
import { daysUntilDate } from './state';

// "Chappi Speaks": the one line of encouragement at the top of a quiet Home.
//
// ALL THE WORDS LIVE IN THIS FILE, on purpose, so the founder can edit the
// copy without touching a component. House rules for anything added here:
// Chappi has no arms and never shouts (no exclamation marks), it is warm and a
// little bossy, and it never uses an em dash or the word "workspace".
// lib/press-kit-copy-guard.test.ts enforces the last two.

/**
 * One line per day of the week, indexed by Date.getDay() so Sunday is first.
 * Friday is "release day" because that is the day music comes out everywhere,
 * and the line only reaches people who have no release of their own coming
 * (pickChappiSpeaks below).
 */
export const CHAPPI_SPEAKS_WEEKDAY_LINES: readonly string[] = [
  /* Sunday */ 'A new week starts tomorrow. Dream big, then write down the first step.',
  /* Monday */ 'Never give up on your dreams. Pick one small thing and start it today.',
  /* Tuesday */ 'Big careers are built on quiet days like this one. Plan your next move.',
  /* Wednesday */ 'You are halfway through the week. Keep going, the work is adding up.',
  /* Thursday */ 'Great music deserves a team that follows through. Line up what comes next.',
  /* Friday */ 'Today is release day for artists everywhere. You are destined for greatness, and your team will be part of it soon.',
  /* Saturday */ 'Rest is part of the plan. Recharge, then come back sharp.',
];

/** A release is dated within the next two weeks, but not today. */
export const CHAPPI_SPEAKS_RELEASE_SOON_LINE =
  'Release day is close and nothing is waiting on you. Rest well and trust the plan.';

/** A release is dated today. */
export const CHAPPI_SPEAKS_RELEASE_TODAY_LINE = 'Your music is out today. You earned this, so go and enjoy it.';

export type ChappiSpeaksOccasion = 'weekday' | 'release_soon' | 'release_today';

export type ChappiSpeaksLine = {
  text: string;
  occasion: ChappiSpeaksOccasion;
};

/**
 * Chooses today's line. Reads the DEVICE clock and device-local days, like the
 * greeting and every other Home date, so "Friday" is the user's Friday and the
 * line changes at their midnight.
 *
 * A release of your own outranks the weekday: telling someone whose music is
 * out on Friday that "today is release day for artists everywhere" would read
 * as if nobody had looked at their calendar. Today's release beats a later one.
 * A release with no date, an unreadable date, or one that has passed counts as
 * no release at all.
 */
export function pickChappiSpeaks(input: {
  releases: readonly { releaseDate: string | null }[];
  now?: Date;
}): ChappiSpeaksLine {
  const now = input.now ?? new Date();

  let soonest: number | null = null;
  for (const release of input.releases) {
    const daysOut = daysUntilDate(release.releaseDate, now);
    if (daysOut === null || daysOut < 0 || daysOut > CHAPPI_SPEAKS_RELEASE_WINDOW_DAYS) continue;
    if (soonest === null || daysOut < soonest) soonest = daysOut;
  }

  if (soonest === 0) return { text: CHAPPI_SPEAKS_RELEASE_TODAY_LINE, occasion: 'release_today' };
  if (soonest !== null) return { text: CHAPPI_SPEAKS_RELEASE_SOON_LINE, occasion: 'release_soon' };
  return { text: CHAPPI_SPEAKS_WEEKDAY_LINES[now.getDay()], occasion: 'weekday' };
}
