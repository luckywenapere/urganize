// Team tools (SERVER-ONLY). Read-only for now: this is what lets the assistant
// turn "assign it to Ada" into a real user id instead of guessing one, which
// the task PATCH route would reject anyway.

import { apiError, callInternalApi, fail, type ChappiTool } from './shared';

export const TEAM_TOOLS: ChappiTool[] = [
  {
    name: 'list_workspace_members',
    kind: 'read',
    description:
      'List the teammates in the workspace with their user ids. Use this to resolve a person\'s name to the assigneeId that create_task and update_task need.',
    inputSchema: { type: 'object', properties: {} },
    execute: async (ctx) => {
      const res = await callInternalApi(ctx, '/api/workspace/members', { method: 'GET' });
      if (!res.ok) return fail(apiError(res, 'Could not load your teammates.'));

      const members = Array.isArray(res.body.members)
        ? (res.body.members as Record<string, unknown>[])
        : [];
      const data = members.map((member) => ({
        // userId is null for someone invited who has not joined yet — they
        // cannot be assigned work, and saying so keeps the model from trying.
        userId: (member.userId ?? null) as string | null,
        name: String(member.name ?? member.email ?? 'Teammate'),
        email: String(member.email ?? ''),
        role: String(member.role ?? ''),
        status: String(member.status ?? ''),
      }));
      const assignable = data.filter((m) => m.userId).length;
      return {
        ok: true,
        summary: `${data.length} teammate(s), ${assignable} assignable.`,
        data,
      };
    },
  },
];
