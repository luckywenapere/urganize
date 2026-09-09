// Context tools (SERVER-ONLY, 2026-08-25) — the reason per-user MCP exists.
//
// A manager's ask was "take my context to any LLM of my choice", and these two
// tools are what that means concretely: one call that hands over everything
// UrgAns already knows, and one that hands over a single release in full.
//
// Both return the SAME text the in-app assistant reads (see
// ../portable-context.ts), so an answer from claude.ai and an answer from
// UrgAns cannot be working from different facts. That is the whole design; a
// second renderer for the outside world would drift.
//
// Both are `read`, which matters beyond documentation: the per-tool gate in
// app/api/mcp/route.ts maps kind to a synthetic HTTP method, so a team in
// read-only mode after a payment failure can still take their context out.
// Turning either into `mutate` would silently take that away.

import { buildPortableWorkspaceContext, buildReleaseContext } from '../portable-context';
import { argString, fail, type ChappiTool } from './shared';

export const CONTEXT_TOOLS: ChappiTool[] = [
  {
    name: 'get_workspace_context',
    kind: 'read',
    description:
      'Get the full working context for this team as one block of text: how the team works, every current rollout with its progress, what is overdue, who is carrying what, and who is on the team. Call this first when you need to understand the whole picture rather than one rollout.',
    inputSchema: { type: 'object', properties: {} },
    execute: async (ctx) => {
      const context = await buildPortableWorkspaceContext(ctx);
      return {
        ok: true,
        // The summary line carries the whole context rather than a count,
        // because toolResultToMcp puts `summary` in the text block and `data`
        // in a JSON dump underneath. A wall of escaped JSON is worse context
        // than prose for exactly the thing that IS prose.
        summary: context.text,
      };
    },
  },
  {
    name: 'get_release_context',
    kind: 'read',
    description:
      'Get one rollout in full as a block of text: its date and how far off it is, its progress, what is overdue, what is blocked, what is still to do, and its dated moments. Use this when the question is about a specific rollout.',
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string', description: 'The rollout id.' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('Which rollout? I need its id.');
      const context = await buildReleaseContext(ctx, releaseId);
      // A release the caller cannot see reads exactly like one that does not
      // exist — listVisibleReleases is what draws that line, and it is the same
      // line the rest of the app draws.
      if (!context) return fail('I could not find that rollout.');
      return { ok: true, summary: context };
    },
  },
];
