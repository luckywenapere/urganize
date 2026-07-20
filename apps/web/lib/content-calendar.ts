import { addDays, differenceInCalendarDays, endOfMonth, startOfWeek } from 'date-fns';
import type { ContentPost, SocialPlatform } from '@/types/content-calendar';

/**
 * Pure date/bucketing logic for the content calendar (URG-157, Phase A).
 * No I/O, no React, no component imports: the month grid, the mobile agenda
 * list, and the API routes all consume these helpers so components stay
 * presentational (the lib/tasks.ts precedent).
 *
 * Dates are YYYY-MM-DD strings end to end, matching the release-date
 * convention. Parsing always appends T00:00:00 so the Date lands at local
 * midnight instead of shifting across the UTC boundary.
 */

const MONTH_PARAM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Monday-start weeks everywhere in this module. */
const WEEK_OPTIONS = { weekStartsOn: 1 } as const;

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Strict YYYY-MM with a real month (01-12). */
export function isValidMonthParam(value: string | null): boolean {
  return typeof value === 'string' && MONTH_PARAM_PATTERN.test(value);
}

/**
 * Which month the calendar shows: a valid `?month=` param wins, else the
 * release month, else today's month. Routes apply the same defaulting
 * server-side so payloads stay month-windowed even without a param.
 */
export function resolveMonth(
  monthParam: string | null,
  releaseDate: string | null,
  today: string
): string {
  if (monthParam && isValidMonthParam(monthParam)) {
    return monthParam;
  }

  const releaseMonth = releaseDate ? releaseDate.slice(0, 7) : null;
  if (releaseMonth && isValidMonthParam(releaseMonth)) {
    return releaseMonth;
  }

  return today.slice(0, 7);
}

/**
 * Today's date as YYYY-MM-DD in the CLIENT-LOCAL timezone, on purpose: a
 * manager in Lagos at 00:30 must see their own "today" for overdue treatment
 * and one-tap mark-posted eligibility, not UTC's. Built from the local
 * getters (getFullYear/getMonth/getDate), never toISOString(), which would
 * shift the date across the UTC boundary.
 */
export function getClientTodayIso(): string {
  return toIsoDate(new Date());
}

export interface MonthGridDay {
  /** YYYY-MM-DD. */
  date: string;
  /** False for the leading/trailing days that pad the grid to full weeks. */
  inMonth: boolean;
}

export interface MonthGridWeek {
  /** The Monday opening this row, YYYY-MM-DD. Feed it to getWeekLabel. */
  weekStart: string;
  /** Always exactly 7 days, Monday through Sunday. */
  days: MonthGridDay[];
}

export interface MonthGrid {
  weeks: MonthGridWeek[];
}

/**
 * Monday-start week rows covering the given YYYY-MM month, padded with
 * out-of-month days so every row has exactly 7 cells.
 */
export function buildMonthGrid(month: string): MonthGrid {
  const monthStart = parseIsoDate(`${month}-01`);
  const gridStart = startOfWeek(monthStart, WEEK_OPTIONS);
  const lastWeekStart = startOfWeek(endOfMonth(monthStart), WEEK_OPTIONS);

  const weeks: MonthGridWeek[] = [];
  for (let weekStart = gridStart; weekStart <= lastWeekStart; weekStart = addDays(weekStart, 7)) {
    const days: MonthGridDay[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = toIsoDate(addDays(weekStart, offset));
      days.push({ date, inMonth: date.slice(0, 7) === month });
    }
    weeks.push({ weekStart: toIsoDate(weekStart), days });
  }

  return { weeks };
}

/**
 * Release-relative label for a grid week row: 'RELEASE WEEK' when the release
 * date falls inside [weekStart, weekStart+6], else 'WK-N'/'WK+N' by whole-week
 * distance. Null when there is no release date to anchor on (no label gutter)
 * and beyond +/-8 weeks (plain rows; the label stops orienting that far out).
 */
export function getWeekLabel(weekStart: string, releaseDate: string | null): string | null {
  if (!releaseDate || !ISO_DATE_PATTERN.test(releaseDate)) {
    return null;
  }

  const release = parseIsoDate(releaseDate);
  if (Number.isNaN(release.getTime())) {
    return null;
  }

  const releaseWeekStart = startOfWeek(release, WEEK_OPTIONS);
  const week = parseIsoDate(weekStart);
  const weekDistance = Math.round(differenceInCalendarDays(week, releaseWeekStart) / 7);

  if (weekDistance === 0) {
    return 'RELEASE WEEK';
  }

  if (Math.abs(weekDistance) > 8) {
    return null;
  }

  return weekDistance < 0 ? `WK-${Math.abs(weekDistance)}` : `WK+${weekDistance}`;
}

/**
 * Buckets posts by scheduled day for the grid/agenda. Only posts inside the
 * given YYYY-MM month are included. Within a day, overdue-unposted posts sort
 * first (the most actionable signal), then alphabetically by title. `today`
 * defaults to the client-local date; inject it in tests and on the server.
 */
export function bucketPostsByDay(
  posts: ContentPost[],
  month: string,
  today: string = getClientTodayIso()
): Map<string, ContentPost[]> {
  const byDay = new Map<string, ContentPost[]>();

  for (const post of posts) {
    if (post.scheduledDate.slice(0, 7) !== month) {
      continue;
    }
    const existing = byDay.get(post.scheduledDate);
    if (existing) {
      existing.push(post);
    } else {
      byDay.set(post.scheduledDate, [post]);
    }
  }

  for (const dayPosts of byDay.values()) {
    dayPosts.sort((left, right) => {
      const leftOverdue = isPostOverdue(left, today);
      const rightOverdue = isPostOverdue(right, today);
      if (leftOverdue !== rightOverdue) {
        return leftOverdue ? -1 : 1;
      }
      return left.title.localeCompare(right.title);
    });
  }

  return byDay;
}

/**
 * Scheduled before today and not yet posted. ISO date strings compare
 * correctly as plain strings, so no Date parsing is needed.
 */
export function isPostOverdue(
  post: Pick<ContentPost, 'scheduledDate' | 'status'>,
  today: string
): boolean {
  return post.scheduledDate < today && post.status !== 'posted';
}

/**
 * One-tap mark-posted eligibility: only posts dated today or earlier can be
 * toggled from the chip (a future post can't honestly be "posted" yet).
 */
export function canQuickTogglePosted(
  post: Pick<ContentPost, 'scheduledDate'>,
  today: string
): boolean {
  return post.scheduledDate <= today;
}

export function getPlatformLabel(platform: SocialPlatform): string {
  switch (platform) {
    case 'tiktok':
      return 'TikTok';
    case 'instagram':
      return 'Instagram';
    case 'youtube':
      return 'YouTube';
    case 'x':
      return 'X';
    case 'facebook':
      return 'Facebook';
    case 'snapchat':
      return 'Snapchat';
    case 'whatsapp':
      return 'WhatsApp';
    case 'threads':
      return 'Threads';
    default:
      return 'Other';
  }
}
