import type { HomeHeader } from './types';

/**
 * "Good morning" / "Good afternoon" / "Good evening" by device-local hour:
 * 5–11:59 morning, 12–16:59 afternoon, 17–4:59 evening (wraps past midnight).
 * Matches the mapping report's 5–12 / 12–17 / 17–5 windows.
 */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** First word of a full name, or 'there' when there is nothing to read. */
export function firstNameFrom(name: string | null | undefined): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

/** "Monday, 29 September" — device date, no year (Home only ever shows
 * "today", so the year is never needed the way it is for a future show). */
export function formatHeaderDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
}

export function buildHomeHeader(input: {
  name: string | null;
  teamName: string | null;
  now?: Date;
}): HomeHeader {
  const now = input.now ?? new Date();
  return {
    greeting: greetingForHour(now.getHours()),
    firstName: firstNameFrom(input.name),
    dateLabel: formatHeaderDate(now),
    teamName: input.teamName,
  };
}
