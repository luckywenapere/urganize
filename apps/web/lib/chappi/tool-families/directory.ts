/**
 * The Urganize Directory: people you can hire, and the work requests that
 * connect the two sides.
 *
 * Newer than every other family here — it merged on 2026-09-06, while these
 * tools were being planned — and the only surface in this registry that is not
 * about the team's own data. A directory profile belongs to a PERSON and is
 * visible across teams, so two things follow:
 *
 * The search reuses applyDirectoryFilters from lib/directory-search.ts rather
 * than filtering by hand. That function is tested and carries a documented
 * ranking (name only, two tiers, "a role is a filter, not something to fuzzy
 * match"), and a second implementation would drift from what the page shows.
 * GET /api/directory takes no query parameters at all — the page filters in
 * the browser — so this is the only correct place to narrow.
 *
 * WORK REQUESTS ARE ON THEIR OWN FLAG, not the directory's, and the route's
 * header says why: the directory is live in production with real people in it,
 * so folding an inbox in behind the same flag would have put that inbox live
 * at merge. So search and profile can work while requests do not, and each
 * translates its own gate.
 */

import { DIRECTORY_ROLES } from '@/lib/directory-roles';
import { applyDirectoryFilters, type DirectoryEntry } from '@/lib/directory-search';
import {
  WORK_REQUEST_NOTE_MAX_CHARS,
  WORK_REQUEST_REPLY_MAX_CHARS,
} from '@/lib/work-requests';
import {
  apiError,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

const DIRECTORY_OFF = "The directory isn't switched on for this team yet.";
const REQUESTS_OFF = "Work requests aren't switched on yet.";

const AVAILABILITY = ['open', 'selective', 'closed'] as const;

export const DIRECTORY_TOOLS: ChappiTool[] = [
  {
    name: 'search_directory',
    kind: 'read',
    level: 'read',
    description:
      'Find people to hire: producers, engineers, designers, PR, photographers, tour managers. Narrow by role, city or whether they are taking work. Use this before send_work_request, which needs the person id.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part of a name.' },
        role: { type: 'string', enum: [...DIRECTORY_ROLES] },
        city: { type: 'string' },
        availability: { type: 'string', enum: [...AVAILABILITY] },
      },
    },
    execute: async (ctx, args) => {
      const res = await callInternalApi(ctx, '/api/directory', { method: 'GET' });
      if (isFlagGateOff(res)) return fail(DIRECTORY_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not search the directory.'));
      const people = (res.body.people || []) as DirectoryEntry[];

      const role = argString(args, 'role');
      const availability = argString(args, 'availability');
      const matches = applyDirectoryFilters(people, {
        query: argString(args, 'query'),
        role: role && (DIRECTORY_ROLES as readonly string[]).includes(role)
          ? (role as (typeof DIRECTORY_ROLES)[number])
          : null,
        city: argString(args, 'city') || null,
        availability:
          availability && (AVAILABILITY as readonly string[]).includes(availability)
            ? (availability as (typeof AVAILABILITY)[number])
            : null,
      });

      return {
        ok: true,
        summary:
          matches.length === 0
            ? 'Nobody in the directory matches that yet.'
            : `${matches.length} ${matches.length === 1 ? 'person' : 'people'} match.`,
        data: {
          // Capped: the directory is a browse surface and a long list would
          // crowd out the conversation. The page is where you scroll.
          people: matches.slice(0, 20).map((person) => ({
            userId: person.userId,
            name: person.displayName,
            city: person.city,
            availability: person.availability,
            roles: person.roles,
          })),
          truncated: matches.length > 20 || res.body.truncated === true,
        },
      };
    },
  },
  {
    name: 'get_my_directory_profile',
    kind: 'read',
    level: 'read',
    description:
      "The user's own directory listing, which is how other teams see them. Returns nothing if they have not made one.",
    inputSchema: { type: 'object', properties: {} },
    execute: async (ctx) => {
      const res = await callInternalApi(ctx, '/api/directory/profile', { method: 'GET' });
      if (isFlagGateOff(res)) return fail(DIRECTORY_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load your listing.'));
      const profile = res.body.profile as Record<string, unknown> | null;
      if (!profile) {
        return {
          ok: true,
          summary: 'You are not listed in the directory yet.',
          data: { profile: null },
        };
      }
      return {
        ok: true,
        summary: `Listed as ${String(profile.displayName || 'unnamed')}${
          profile.city ? ` in ${String(profile.city)}` : ''
        }, ${String(profile.availability || 'open')} to work.`,
        data: { profile, roles: res.body.roles ?? [] },
      };
    },
  },
  {
    name: 'update_my_directory_profile',
    kind: 'mutate',
    level: 'auto',
    description:
      "Change the user's own directory listing. Send only what is changing. This is how they appear to other teams, so write it in their words rather than yours: draft it in the conversation and save once they agree.",
    inputSchema: {
      type: 'object',
      properties: {
        displayName: { type: 'string' },
        roles: {
          type: 'array',
          items: { type: 'string', enum: [...DIRECTORY_ROLES] },
          description: 'What they do. A few at most.',
        },
        city: { type: 'string' },
        country: { type: 'string' },
        availability: {
          type: 'string',
          enum: [...AVAILABILITY],
          description: 'Whether they are taking work.',
        },
        bio: { type: 'string' },
      },
    },
    execute: async (ctx, args) => {
      // Genuinely sparse: parsePersonProfileInput reads each field with
      // `'field' in payload`, so anything left out is preserved. No
      // read-then-merge needed, unlike the capture page.
      const body: Record<string, unknown> = {};
      for (const key of ['displayName', 'city', 'country', 'availability', 'bio']) {
        if (key in args) body[key] = argString(args, key);
      }
      if (Array.isArray(args.roles)) {
        body.roles = (args.roles as unknown[]).filter(
          (role): role is string =>
            typeof role === 'string' && (DIRECTORY_ROLES as readonly string[]).includes(role)
        );
      }
      if (Object.keys(body).length === 0) return fail('Nothing to change.');

      const res = await callInternalApi(ctx, '/api/directory/profile', {
        method: 'PATCH',
        body,
      });
      if (isFlagGateOff(res)) return fail(DIRECTORY_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not update your listing.'));
      return { ok: true, summary: 'Updated your directory listing.' };
    },
  },
  {
    name: 'list_work_requests',
    kind: 'read',
    level: 'read',
    description:
      'Work requests, either the ones sent to the user (received) or the ones they sent out (sent), with any answers.',
    inputSchema: {
      type: 'object',
      properties: {
        box: {
          type: 'string',
          enum: ['received', 'sent'],
          description: 'Defaults to received.',
        },
      },
    },
    execute: async (ctx, args) => {
      const box = argString(args, 'box') === 'sent' ? 'sent' : 'received';
      const res = await callInternalApi(ctx, `/api/directory/requests?box=${box}`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return fail(REQUESTS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the work requests.'));
      const requests = (res.body.requests || []) as Array<Record<string, unknown>>;
      const waiting = requests.filter((request) => request.status === 'new').length;
      return {
        ok: true,
        summary:
          requests.length === 0
            ? box === 'received'
              ? 'Nobody has asked you for work.'
              : 'You have not asked anybody for work.'
            : `${requests.length} ${box}, ${waiting} still unanswered.`,
        data: { box, requests },
      };
    },
  },
  {
    name: 'send_work_request',
    kind: 'mutate',
    level: 'confirm',
    description:
      'Ask somebody in the directory to do a job. Say what the work is in their language, in a few sentences.',
    inputSchema: {
      type: 'object',
      properties: {
        recipientUserId: { type: 'string', description: 'From search_directory.' },
        role: {
          type: 'string',
          enum: [...DIRECTORY_ROLES],
          description: 'The job you need done.',
        },
        note: {
          type: 'string',
          description: `What the work is. Up to ${WORK_REQUEST_NOTE_MAX_CHARS} characters.`,
        },
        releaseId: { type: 'string', description: 'Optional: which release it is for.' },
      },
      required: ['recipientUserId', 'role', 'note'],
    },
    confirm: async (ctx, args) => {
      const recipientUserId = argString(args, 'recipientUserId');
      const role = argString(args, 'role');
      const note = argString(args, 'note');
      if (!recipientUserId || !role || !note) {
        return { ok: false, summary: 'recipientUserId, role and note are all required.' };
      }
      if (note.length > WORK_REQUEST_NOTE_MAX_CHARS) {
        return {
          ok: false,
          summary: `Keep the note to ${WORK_REQUEST_NOTE_MAX_CHARS} characters or fewer.`,
        };
      }
      const res = await callInternalApi(ctx, '/api/directory', { method: 'GET' });
      if (isFlagGateOff(res)) return { ok: false, summary: DIRECTORY_OFF };
      const people = res.ok ? ((res.body.people || []) as DirectoryEntry[]) : [];
      const person = people.find((entry) => entry.userId === recipientUserId);
      if (!person) {
        return { ok: false, summary: 'That person is not listed in the directory.' };
      }
      return {
        ok: true,
        title: `Send this to ${person.displayName}?`,
        detail: `"${note}". It lands in their inbox and cannot be unsent.`,
        confirmLabel: 'Send request',
      };
    },
    execute: async (ctx, args) => {
      const recipientUserId = argString(args, 'recipientUserId');
      const role = argString(args, 'role');
      const note = argString(args, 'note');
      if (!recipientUserId || !role || !note) {
        return fail('recipientUserId, role and note are all required.');
      }
      const res = await callInternalApi(ctx, '/api/directory/requests', {
        method: 'POST',
        body: {
          recipientUserId,
          role,
          note,
          releaseId: argString(args, 'releaseId') || null,
        },
      });
      if (isFlagGateOff(res)) return fail(REQUESTS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not send the request.'));
      return { ok: true, summary: 'Sent. They will see it in their inbox.' };
    },
  },
  {
    name: 'answer_work_request',
    kind: 'mutate',
    level: 'auto',
    description:
      'Answer a request somebody sent the user: interested, or passed, with an optional one-line reply. Each request can only be answered once.',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
        status: { type: 'string', enum: ['interested', 'passed'] },
        reply: {
          type: 'string',
          description: `Optional, up to ${WORK_REQUEST_REPLY_MAX_CHARS} characters.`,
        },
      },
      required: ['requestId', 'status'],
    },
    execute: async (ctx, args) => {
      const requestId = argString(args, 'requestId');
      const status = argString(args, 'status');
      if (!requestId) return fail('requestId is required.');
      if (status !== 'interested' && status !== 'passed') {
        return fail("status must be 'interested' or 'passed'.");
      }
      const reply = argString(args, 'reply');
      if (reply.length > WORK_REQUEST_REPLY_MAX_CHARS) {
        return fail(`Keep the reply to ${WORK_REQUEST_REPLY_MAX_CHARS} characters or fewer.`);
      }
      const res = await callInternalApi(ctx, `/api/directory/requests/${requestId}`, {
        method: 'PATCH',
        body: { status, reply: reply || undefined },
      });
      if (isFlagGateOff(res)) return fail(REQUESTS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not answer the request.'));
      return {
        ok: true,
        summary: status === 'interested' ? 'Said you are interested.' : 'Passed on it.',
      };
    },
  },
];
