// Chappi dispatch (SERVER-ONLY). Builds the per-request tool context (resolving
// the caller's workspace access set) and routes a single validated tool call to
// its registry entry, normalizing any thrown error into a ChappiToolResult so
// one failing tool never crashes the agent loop.

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { getChappiTool, type ChappiToolContext } from './tools';
import type { ChappiToolResult } from './types';

type WorkspaceUser = Parameters<typeof loadWorkspaceAccessContext>[1];

export async function resolveChappiContext(params: {
  user: WorkspaceUser;
  adminClient: SupabaseClient;
  origin: string;
  authToken: string;
}): Promise<ChappiToolContext> {
  const access = await loadWorkspaceAccessContext(params.adminClient, params.user);
  return {
    user: { id: params.user.id, email: params.user.email },
    adminClient: params.adminClient,
    workspaceIds: access.workspaceIds,
    origin: params.origin,
    authToken: params.authToken,
  };
}

export async function executeToolCall(
  ctx: ChappiToolContext,
  name: string,
  rawArgs: unknown
): Promise<ChappiToolResult> {
  const tool = getChappiTool(name);
  if (!tool) return { ok: false, summary: `Unknown tool: ${name}` };

  const args =
    rawArgs && typeof rawArgs === 'object' ? (rawArgs as Record<string, unknown>) : {};

  try {
    return await tool.execute(ctx, args);
  } catch (error) {
    console.error(`[chappi] tool "${name}" failed:`, error);
    return { ok: false, summary: 'That action hit an unexpected error. Nothing was changed.' };
  }
}
