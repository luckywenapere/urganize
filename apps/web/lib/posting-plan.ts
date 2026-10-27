// The posting plan (2026-10-27): a short list of posts per artist, so a team
// keeps the artist visible between releases. Pure: data in, data out. Days are
// Lagos days (YYYY-MM-DD), weeks run Monday to Sunday.
//
// Mocks: docs/mocks/content-calendar-artist. Note: docs/notes/2026-10-27-posting-plan.md.

import { addDays, daysBetween } from '@/lib/whatsapp/chase-rules';

export const POST_PLATFORMS = ['instagram', 'tiktok', 'x', 'youtube', 'facebook', 'snapchat', 'threads', 'other'] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];

/** The four the add sheet offers; the rest stay valid for UrgAns. */
export const SHEET_PLATFORMS: PostPlatform[] = ['instagram', 'tiktok', 'x', 'youtube', 'other'];

export const PLATFORM_LABELS: Record<PostPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X',
  youtube: 'YouTube',
  facebook: 'Facebook',
  snapchat: 'Snapchat',
  threads: 'Threads',
  other: 'Other',
};

export type PostStatus = 'planned' | 'done' | 'skipped';

export type ArtistPost = {
  id: string;
  artistId: string;
  releaseId: string | null;
  postDay: string;
  what: string;
  platform: PostPlatform | null;
  ownerUserId: string | null;
  status: PostStatus;
  doneAt: string | null;
};

export const MAX_WHAT_LENGTH = 200;
/** How far "every week" repeats. Long enough to matter, short enough to edit. */
export const MAX_REPEAT_WEEKS = 8;

export function isPostPlatform(value: unknown): value is PostPlatform {
  return typeof value === 'string' && (POST_PLATFORMS as readonly string[]).includes(value);
}

export function isPostStatus(value: unknown): value is PostStatus {
  return value === 'planned' || value === 'done' || value === 'skipped';
}

export function isValidDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Monday of the week a day falls in. */
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

const byDay = (a: ArtistPost, b: ArtistPost) => a.postDay.localeCompare(b.postDay);

export function bucketPosts(posts: ArtistPost[], today: string) {
  const thisMonday = weekStart(today);
  const nextMonday = addDays(thisMonday, 7);
  const afterNext = addDays(thisMonday, 14);
  const sorted = [...posts].sort(byDay);
  return {
    past: sorted.filter((p) => p.postDay < thisMonday).reverse(),
    thisWeek: sorted.filter((p) => p.postDay >= thisMonday && p.postDay < nextMonday),
    nextWeek: sorted.filter((p) => p.postDay >= nextMonday && p.postDay < afterNext),
    later: sorted.filter((p) => p.postDay >= afterNext),
  };
}

/** "1 of 3 posted" for this week. Skipped posts still count in the total. */
export function weekSummary(posts: ArtistPost[], today: string): { done: number; total: number } {
  const week = bucketPosts(posts, today).thisWeek;
  return { done: week.filter((p) => p.status === 'done').length, total: week.length };
}

/** The first planned post after today, for "Next: lyric snippet on Thursday". */
export function nextPlannedPost(posts: ArtistPost[], today: string): ArtistPost | null {
  return [...posts].sort(byDay).find((p) => p.status === 'planned' && p.postDay > today) ?? null;
}

export type PostInput = {
  what: string;
  postDay: string;
  platform: PostPlatform | null;
  ownerUserId: string | null;
  releaseId: string | null;
};

export function normalizePostInput(raw: Record<string, unknown>): { ok: true; value: PostInput } | { ok: false; error: string } {
  const what = typeof raw.what === 'string' ? raw.what.trim() : '';
  if (!what) return { ok: false, error: 'Say what to post.' };
  if (what.length > MAX_WHAT_LENGTH) return { ok: false, error: `Keep it under ${MAX_WHAT_LENGTH} characters.` };
  if (!isValidDay(raw.postDay)) return { ok: false, error: 'Pick a day.' };
  const text = (key: string) => (typeof raw[key] === 'string' && (raw[key] as string).trim() ? (raw[key] as string).trim() : null);
  return {
    ok: true,
    value: {
      what,
      postDay: raw.postDay,
      platform: isPostPlatform(raw.platform) ? raw.platform : null,
      ownerUserId: text('ownerUserId'),
      releaseId: text('releaseId'),
    },
  };
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type WeeklyItem = { weekday: Weekday; what: string; platform?: PostPlatform | null; ownerUserId?: string | null };

/**
 * "Studio clip Tuesday, lyric snippet Thursday" as dated posts. Each weekday
 * lands on its first date on or after startDay, then repeats weekly.
 */
export function expandWeeklyPlan(input: { startDay: string; weeks: number; items: WeeklyItem[] }) {
  const weeks = Math.max(1, Math.min(MAX_REPEAT_WEEKS, Math.floor(input.weeks) || 1));
  const startWeekday = (new Date(`${input.startDay}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const out: Array<{ postDay: string; what: string; platform: PostPlatform | null; ownerUserId: string | null }> = [];
  for (let week = 0; week < weeks; week += 1) {
    for (const item of input.items) {
      const target = WEEKDAYS.indexOf(item.weekday);
      if (target < 0) continue;
      const offset = (target - startWeekday + 7) % 7;
      out.push({
        postDay: addDays(input.startDay, offset + week * 7),
        what: item.what.trim(),
        platform: item.platform ?? null,
        ownerUserId: item.ownerUserId ?? null,
      });
    }
  }
  return out.sort((a, b) => a.postDay.localeCompare(b.postDay));
}

/** The WhatsApp nudge on the day. */
export function buildPostNudgeText(name: string, what: string, artistName: string, platform: PostPlatform | null): string {
  const where = platform && platform !== 'other' ? ` on ${PLATFORM_LABELS[platform]}` : '';
  return `Morning ${name}. Post "${what}" for ${artistName}${where} today? Reply Done or Skip.`;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The day column on a post row: "Today 27" or "Thu 29". */
export function dayBadge(day: string, today: string): { label: string; date: string } {
  const d = new Date(`${day}T00:00:00Z`);
  return { label: day === today ? 'Today' : WEEKDAY_SHORT[d.getUTCDay()], date: String(d.getUTCDate()) };
}

/** "Thursday" within the week ahead, else "Thu 5 Nov". */
export function nextDayWords(day: string, today: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (daysBetween(today, day) === 1) return 'tomorrow';
  if (daysBetween(today, day) < 7) return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${WEEKDAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${month}`;
}
