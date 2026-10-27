// Content calendar tools (SERVER-ONLY) — planning social posts around a
// release. Planning only: nothing here posts anywhere or touches a platform
// API, matching the feature's own scope line.

import {
  CONTENT_POST_FORMAT_OPTIONS,
  CONTENT_POST_PILLAR_OPTIONS,
  CONTENT_POST_STATUS_OPTIONS,
  SOCIAL_PLATFORM_OPTIONS,
} from '@/types/content-calendar';
import {
  apiError,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

const CALENDAR_OFF = "Content calendars aren't enabled yet.";

/** YYYY-MM, the month the posts route filters by. */
function isYearMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export const CALENDAR_TOOLS: ChappiTool[] = [
  {
    name: 'list_content_calendars',
    kind: 'read',
    level: 'read',
    description:
      "List a rollout's content calendars — one per platform account, with how many posts each holds.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/content-calendars`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return fail(CALENDAR_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the calendars.'));

      const calendars = Array.isArray(res.body.calendars)
        ? (res.body.calendars as Record<string, unknown>[])
        : [];
      const data = calendars.map((calendar) => ({
        id: String(calendar.id ?? ''),
        platform: String(calendar.platform ?? ''),
        name: String(calendar.name ?? ''),
        postCount: Number(calendar.postCount ?? 0),
      }));
      return { ok: true, summary: `Found ${data.length} calendar(s).`, data };
    },
  },
  {
    name: 'create_content_calendar',
    kind: 'mutate',
    level: 'auto',
    description:
      'Add a content calendar to a rollout for one platform account. A rollout can have several per platform — use the name to tell them apart.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        platform: { type: 'string', enum: [...SOCIAL_PLATFORM_OPTIONS] },
        name: {
          type: 'string',
          description: 'Optional label, e.g. "Main account". Useful when a platform has several.',
        },
      },
      required: ['releaseId', 'platform'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const platform = argString(args, 'platform');
      if (!releaseId || !platform) return fail('releaseId and platform are required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/content-calendars`, {
        method: 'POST',
        body: { platform, name: argString(args, 'name') || undefined },
      });
      if (isFlagGateOff(res)) return fail(CALENDAR_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not create the calendar.'));
      const calendar = (res.body.calendar ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        summary: `Created a ${platform} calendar.`,
        data: { calendarId: calendar.id ?? null },
      };
    },
  },
  {
    name: 'delete_content_calendar',
    kind: 'mutate',
    level: 'confirm',
    description:
      'Delete a content calendar and every post planned on it. Requires the user to approve a confirmation card — calling this only proposes it.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        calendarId: { type: 'string' },
      },
      required: ['releaseId', 'calendarId'],
    },
    confirm: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const calendarId = argString(args, 'calendarId');
      if (!releaseId || !calendarId) {
        return { ok: false, summary: 'releaseId and calendarId are required.' };
      }
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/content-calendars`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return { ok: false, summary: CALENDAR_OFF };
      const calendars = Array.isArray(res.body.calendars)
        ? (res.body.calendars as Record<string, unknown>[])
        : [];
      const calendar = calendars.find((entry) => String(entry.id ?? '') === calendarId);
      if (!calendar) return { ok: false, summary: 'That calendar was not found on this rollout.' };

      const postCount = Number(calendar.postCount ?? 0);
      const label = String(calendar.name || calendar.platform || 'calendar');
      return {
        ok: true,
        title: `Delete the "${label}" calendar?`,
        detail:
          postCount > 0
            ? `Its ${postCount} planned post${postCount === 1 ? '' : 's'} go with it. This cannot be undone.`
            : 'It has no posts planned on it yet. This cannot be undone.',
        confirmLabel: 'Delete calendar',
      };
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const calendarId = argString(args, 'calendarId');
      if (!releaseId || !calendarId) return fail('releaseId and calendarId are required.');
      const res = await callInternalApi(
        ctx,
        `/api/releases/${releaseId}/content-calendars/${calendarId}`,
        { method: 'DELETE' }
      );
      if (isFlagGateOff(res)) return fail(CALENDAR_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not delete the calendar.'));
      return { ok: true, summary: 'Deleted the calendar.' };
    },
  },
  {
    name: 'list_content_posts',
    kind: 'read',
    level: 'read',
    description: 'List the posts planned on one calendar for one month.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        calendarId: { type: 'string' },
        month: { type: 'string', description: 'YYYY-MM' },
      },
      required: ['releaseId', 'calendarId', 'month'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const calendarId = argString(args, 'calendarId');
      const month = argString(args, 'month');
      if (!releaseId || !calendarId || !month) {
        return fail('releaseId, calendarId and month are required.');
      }
      if (!isYearMonth(month)) return fail('month must be in YYYY-MM form.');

      const res = await callInternalApi(
        ctx,
        `/api/releases/${releaseId}/content-posts?calendarId=${encodeURIComponent(calendarId)}&month=${encodeURIComponent(month)}`,
        { method: 'GET' }
      );
      if (isFlagGateOff(res)) return fail(CALENDAR_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the posts.'));

      const posts = Array.isArray(res.body.posts)
        ? (res.body.posts as Record<string, unknown>[])
        : [];
      const data = posts.map((post) => ({
        id: String(post.id ?? ''),
        title: String(post.title ?? ''),
        scheduledDate: String(post.scheduledDate ?? ''),
        format: String(post.format ?? ''),
        status: String(post.status ?? ''),
        pillar: (post.pillar ?? null) as string | null,
      }));
      return { ok: true, summary: `${data.length} post(s) planned in ${month}.`, data };
    },
  },
  {
    name: 'create_content_post',
    kind: 'mutate',
    level: 'auto',
    description: 'Plan a post on a content calendar for a specific day.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        calendarId: { type: 'string' },
        title: { type: 'string' },
        scheduledDate: { type: 'string', description: 'YYYY-MM-DD' },
        format: { type: 'string', enum: [...CONTENT_POST_FORMAT_OPTIONS] },
        status: { type: 'string', enum: [...CONTENT_POST_STATUS_OPTIONS] },
        pillar: { type: 'string', enum: [...CONTENT_POST_PILLAR_OPTIONS] },
        caption: { type: 'string' },
      },
      required: ['releaseId', 'calendarId', 'title', 'scheduledDate', 'format', 'status'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const calendarId = argString(args, 'calendarId');
      const title = argString(args, 'title');
      const scheduledDate = argString(args, 'scheduledDate');
      if (!releaseId || !calendarId || !title || !scheduledDate) {
        return fail('releaseId, calendarId, title and scheduledDate are required.');
      }
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/content-posts`, {
        method: 'POST',
        body: {
          calendarId,
          title,
          scheduledDate,
          format: argString(args, 'format') || 'other',
          status: argString(args, 'status') || 'draft',
          pillar: argString(args, 'pillar') || undefined,
          caption: argString(args, 'caption') || undefined,
        },
      });
      if (isFlagGateOff(res)) return fail(CALENDAR_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not plan the post.'));
      const post = (res.body.post ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        summary: `Planned "${title}" for ${scheduledDate}.`,
        data: { postId: post.id ?? null },
      };
    },
  },
  {
    name: 'update_content_post',
    kind: 'mutate',
    level: 'auto',
    description: 'Change a planned post. Pass only the fields being changed.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        postId: { type: 'string' },
        title: { type: 'string' },
        scheduledDate: { type: 'string', description: 'YYYY-MM-DD' },
        format: { type: 'string', enum: [...CONTENT_POST_FORMAT_OPTIONS] },
        status: { type: 'string', enum: [...CONTENT_POST_STATUS_OPTIONS] },
        pillar: { type: 'string', enum: [...CONTENT_POST_PILLAR_OPTIONS] },
        caption: { type: 'string' },
        postedUrl: { type: 'string', description: 'Link to the live post, once it is up.' },
      },
      required: ['releaseId', 'postId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const postId = argString(args, 'postId');
      if (!releaseId || !postId) return fail('releaseId and postId are required.');

      const patch: Record<string, unknown> = {};
      for (const field of ['title', 'scheduledDate', 'format', 'status', 'pillar', 'caption']) {
        const value = argString(args, field);
        if (value) patch[field] = value;
      }
      if (typeof args.postedUrl === 'string') {
        patch.postedUrl = argString(args, 'postedUrl') || null;
      }
      if (Object.keys(patch).length === 0) {
        return fail('Nothing to update — provide a field to change.');
      }

      const res = await callInternalApi(
        ctx,
        `/api/releases/${releaseId}/content-posts/${postId}`,
        { method: 'PATCH', body: patch }
      );
      if (isFlagGateOff(res)) return fail(CALENDAR_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not update the post.'));
      return { ok: true, summary: 'Updated the post.' };
    },
  },
  {
    name: 'delete_content_post',
    kind: 'mutate',
    level: 'confirm',
    description:
      'Delete a planned post. Requires the user to approve a confirmation card — calling this only proposes it.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        postId: { type: 'string' },
        title: {
          type: 'string',
          description: "The post's title, so the confirmation card can name it.",
        },
      },
      required: ['releaseId', 'postId'],
    },
    confirm: async (_ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const postId = argString(args, 'postId');
      if (!releaseId || !postId) {
        return { ok: false, summary: 'releaseId and postId are required.' };
      }
      // There is no single-post GET, and listing needs a month we do not have.
      // The title the model already read from list_content_posts is enough to
      // name the card; the id is what actually gets acted on.
      const title = argString(args, 'title');
      return {
        ok: true,
        title: title ? `Delete the post "${title}"?` : 'Delete this planned post?',
        detail: 'It is removed from the calendar. This cannot be undone.',
        confirmLabel: 'Delete post',
      };
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const postId = argString(args, 'postId');
      if (!releaseId || !postId) return fail('releaseId and postId are required.');
      const res = await callInternalApi(
        ctx,
        `/api/releases/${releaseId}/content-posts/${postId}`,
        { method: 'DELETE' }
      );
      if (isFlagGateOff(res)) return fail(CALENDAR_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not delete the post.'));
      return { ok: true, summary: 'Deleted the post.' };
    },
  },
];
