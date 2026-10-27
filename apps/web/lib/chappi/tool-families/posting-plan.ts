// Posting plan tools (SERVER-ONLY), 2026-10-27. A short list of posts per
// ARTIST, so a team keeps the artist visible between releases. Planning only:
// nothing here posts anywhere. The user says the week the way they would in a
// group chat ("studio clip Tuesday, lyric snippet Thursday, Ada posts"), and
// plan_posts lays it out on a card they approve before anything is added.

import { lagosDay } from '@/lib/whatsapp/chase-rules';
import {
  MAX_REPEAT_WEEKS,
  PLATFORM_LABELS,
  POST_PLATFORMS,
  WEEKDAYS,
  expandWeeklyPlan,
  isPostPlatform,
  isValidDay,
  nextDayWords,
  type ArtistPost,
  type WeeklyItem,
} from '@/lib/posting-plan';
import {
  apiError,
  argNumber,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
  type ChappiToolContext,
} from './shared';

const PLAN_OFF = "The posting plan isn't switched on for your team.";

type Poster = { userId: string; name: string };
type PlanBody = { today: string; artistName: string; posts: ArtistPost[]; people: Poster[] };

/** Matches "Ada" to "Ada Obi" (first name or whole name, any case). */
function findPoster(people: Poster[], who: string): Poster | null {
  const target = who.trim().toLowerCase();
  if (!target) return null;
  return (
    people.find((p) => p.name.toLowerCase() === target) ??
    people.find((p) => p.name.toLowerCase().split(/\s+/)[0] === target) ??
    null
  );
}

function readItems(args: Record<string, unknown>): WeeklyItem[] | string {
  const raw = Array.isArray(args.posts) ? (args.posts as Record<string, unknown>[]) : [];
  if (!raw.length) return 'posts is required: one entry per weekly post.';
  const items: WeeklyItem[] = [];
  for (const entry of raw) {
    const weekday = typeof entry.weekday === 'string' ? entry.weekday.trim().toLowerCase().slice(0, 3) : '';
    const what = typeof entry.what === 'string' ? entry.what.trim() : '';
    if (!(WEEKDAYS as readonly string[]).includes(weekday)) return `Unknown weekday "${String(entry.weekday)}".`;
    if (!what) return 'Every post needs a what.';
    items.push({
      weekday: weekday as WeeklyItem['weekday'],
      what: what.slice(0, 200),
      platform: isPostPlatform(entry.platform) ? entry.platform : null,
      // Carried as a name until the plan is loaded; resolved to an id below.
      ownerUserId: typeof entry.who === 'string' ? entry.who : null,
    });
  }
  return items;
}

async function loadPlan(ctx: ChappiToolContext, artistId: string): Promise<{ plan: PlanBody } | { error: string }> {
  const res = await callInternalApi(ctx, `/api/workspace/artists/${artistId}/posts`, { method: 'GET' });
  if (isFlagGateOff(res)) return { error: PLAN_OFF };
  if (!res.ok) return { error: apiError(res, 'Could not load the posting plan.') };
  return { plan: res.body as unknown as PlanBody };
}

/** The dated posts a plan_posts call would add, with "who" resolved to a person. */
function layOut(plan: PlanBody, items: WeeklyItem[], args: Record<string, unknown>) {
  const startArg = argString(args, 'startDay');
  const start = isValidDay(startArg) && startArg >= plan.today ? startArg : plan.today;
  const weeks = Math.max(1, Math.min(MAX_REPEAT_WEEKS, argNumber(args, 'weeks') ?? 1));
  const unknownWho = new Set<string>();
  const resolved = items.map((item) => {
    if (!item.ownerUserId) return item;
    const person = findPoster(plan.people, item.ownerUserId);
    if (!person) unknownWho.add(item.ownerUserId);
    return { ...item, ownerUserId: person?.userId ?? null };
  });
  return { posts: expandWeeklyPlan({ startDay: start, weeks, items: resolved }), weeks, unknownWho: [...unknownWho] };
}

export const POSTING_PLAN_TOOLS: ChappiTool[] = [
  {
    name: 'list_artist_posts',
    kind: 'read',
    level: 'read',
    description:
      "An artist's posting plan: what they plan to post, on which day, where and who posts it, from 8 weeks back to 10 ahead. Posts belong to an ARTIST (call list_artists for the id), so this works with no release coming.",
    inputSchema: {
      type: 'object',
      properties: { artistId: { type: 'string' } },
      required: ['artistId'],
    },
    execute: async (ctx, args) => {
      const artistId = argString(args, 'artistId');
      if (!artistId) return fail('artistId is required.');
      const loaded = await loadPlan(ctx, artistId);
      if ('error' in loaded) return fail(loaded.error);
      const { plan } = loaded;
      const nameOf = new Map(plan.people.map((p) => [p.userId, p.name]));
      const upcoming = plan.posts.filter((p) => p.postDay >= plan.today);
      return {
        ok: true,
        summary: upcoming.length
          ? `${upcoming.length} post(s) planned for ${plan.artistName} from today.`
          : `Nothing planned for ${plan.artistName} from today.`,
        data: {
          today: plan.today,
          posts: plan.posts.map((p) => ({
            id: p.id,
            day: p.postDay,
            what: p.what,
            where: p.platform ? PLATFORM_LABELS[p.platform] : null,
            who: p.ownerUserId ? nameOf.get(p.ownerUserId) ?? null : null,
            status: p.status,
          })),
          people: plan.people.map((p) => p.name),
        },
      };
    },
  },
  {
    name: 'plan_posts',
    kind: 'mutate',
    level: 'confirm',
    description:
      "Add posts to an artist's posting plan from a weekly pattern, e.g. studio clip Tuesday, lyric snippet Thursday. Each post is a weekday and what to post, with where and who posts if the user said. Set weeks above 1 only when the user wants it repeated every week. Requires the user to approve a confirmation card — calling this only proposes it.",
    inputSchema: {
      type: 'object',
      properties: {
        artistId: { type: 'string' },
        posts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              weekday: { type: 'string', enum: [...WEEKDAYS] },
              what: { type: 'string', description: 'Short, e.g. "Studio clip".' },
              platform: { type: 'string', enum: [...POST_PLATFORMS] },
              who: { type: 'string', description: "Name of the teammate who posts. Leave out if not said; it defaults to the user." },
            },
            required: ['weekday', 'what'],
          },
        },
        weeks: { type: 'number', description: `How many weeks to repeat it, 1 to ${MAX_REPEAT_WEEKS}. Default 1.` },
        startDay: { type: 'string', description: 'YYYY-MM-DD to start from. Default today.' },
      },
      required: ['artistId', 'posts'],
    },
    confirm: async (ctx, args) => {
      const artistId = argString(args, 'artistId');
      if (!artistId) return { ok: false, summary: 'artistId is required.' };
      const items = readItems(args);
      if (typeof items === 'string') return { ok: false, summary: items };
      const loaded = await loadPlan(ctx, artistId);
      if ('error' in loaded) return { ok: false, summary: loaded.error };
      const { plan } = loaded;
      const { posts, weeks, unknownWho } = layOut(plan, items, args);
      const nameOf = new Map(plan.people.map((p) => [p.userId, p.name.split(/\s+/)[0]]));
      const firstWeek = posts.slice(0, items.length);
      const lines = firstWeek.map((p) => {
        const who = p.ownerUserId ? nameOf.get(p.ownerUserId) : null;
        const where = p.platform ? ` on ${PLATFORM_LABELS[p.platform]}` : '';
        return `${nextDayWords(p.postDay, plan.today)}: ${p.what}${where}${who ? ` (${who})` : ''}`;
      });
      const repeat = weeks > 1 ? ` Repeats every week for ${weeks} weeks, ${posts.length} posts in all.` : '';
      const missing = unknownWho.length ? ` ${unknownWho.join(', ')} isn't on your team, so you post those.` : '';
      return {
        ok: true,
        title: `Add ${posts.length} post${posts.length === 1 ? '' : 's'} for ${plan.artistName}?`,
        detail: `${lines.join('. ')}.${repeat}${missing}`,
        confirmLabel: weeks > 1 ? 'Add every week' : 'Add this week',
      };
    },
    execute: async (ctx, args) => {
      const artistId = argString(args, 'artistId');
      if (!artistId) return fail('artistId is required.');
      const items = readItems(args);
      if (typeof items === 'string') return fail(items);
      const loaded = await loadPlan(ctx, artistId);
      if ('error' in loaded) return fail(loaded.error);
      const { posts } = layOut(loaded.plan, items, args);
      const res = await callInternalApi(ctx, `/api/workspace/artists/${artistId}/posts`, {
        method: 'POST',
        body: { posts },
      });
      if (isFlagGateOff(res)) return fail(PLAN_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not add the posts.'));
      const added = Array.isArray(res.body.posts) ? res.body.posts.length : posts.length;
      return {
        ok: true,
        summary: `Added ${added} post(s) to ${loaded.plan.artistName}'s posting plan. The person posting sees each one on Home that day.`,
        data: { added, today: lagosDay(new Date()) },
      };
    },
  },
];
