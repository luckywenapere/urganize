// Chappi dispatch (SERVER-ONLY). Builds the per-request tool context (resolving
// the caller's workspace access set) and routes a single validated tool call to
// its registry entry, normalizing any thrown error into a ChappiToolResult so
// one failing tool never crashes the agent loop.

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { isLoggedLevel, resolveLogObject } from '@/lib/urgans-action-log';
import { logUrgansAction, snapshotLogObject } from '@/lib/urgans-action-log-server';
import { getChappiTool, type ChappiTool, type ChappiToolContext } from './tools';
import type { ChappiToolResult } from './types';

type WorkspaceUser = Parameters<typeof loadWorkspaceAccessContext>[1];

export async function resolveChappiContext(params: {
  user: WorkspaceUser;
  adminClient: SupabaseClient;
  origin: string;
  authToken: string;
  /** See ChappiToolContext.urgansPass. */
  urgansPass?: string;
}): Promise<ChappiToolContext> {
  const access = await loadWorkspaceAccessContext(params.adminClient, params.user);
  return {
    user: { id: params.user.id, email: params.user.email },
    adminClient: params.adminClient,
    workspaceIds: access.workspaceIds,
    // Releases are owner-scoped, not workspace-scoped, so these three travel
    // together with workspaceIds or the assistant answers differently from the
    // rest of the app. This function used to forward workspaceIds alone and
    // drop the rest on the floor; see lib/chappi/release-scope.ts for what
    // that cost and why the scope maps are not optional.
    releaseOwnerIds: access.releaseOwnerIds,
    artistScopeByOwnerId: access.artistScopeByOwnerId,
    artistScopeByWorkspaceId: access.artistScopeByWorkspaceId,
    releaseScopeByOwnerId: access.releaseScopeByOwnerId,
    releaseScopeByWorkspaceId: access.releaseScopeByWorkspaceId,
    origin: params.origin,
    authToken: params.authToken,
    ...(params.urgansPass ? { urgansPass: params.urgansPass } : {}),
  };
}

export async function executeToolCall(
  ctx: ChappiToolContext,
  name: string,
  rawArgs: unknown,
  /** confirmed: a person approved this exact call on a card (the approve leg). */
  options: { confirmed?: boolean } = {}
): Promise<ChappiToolResult> {
  const tool = getChappiTool(name);
  if (!tool) return { ok: false, summary: `Unknown tool: ${name}` };

  const args =
    rawArgs && typeof rawArgs === 'object' ? (rawArgs as Record<string, unknown>) : {};

  // Every write goes in the action log, from whichever door it came through.
  // Reads and suggestions change nothing, so they are not logged.
  const logged = isLoggedLevel(tool.level);
  const object = logged ? resolveLogObject(args) : null;
  const before = logged ? await snapshotLogObject(ctx.adminClient, object).catch(() => null) : null;

  let result: ChappiToolResult;
  let thrown: string | null = null;
  try {
    result = await tool.execute(ctx, args);
  } catch (error) {
    console.error(`[chappi] tool "${name}" failed:`, error);
    thrown = error instanceof Error ? error.message : String(error);
    result = { ok: false, summary: 'That action hit an unexpected error. Nothing was changed.' };
  }

  if (logged) await logToolCall(ctx, tool, args, object, before, result, thrown, options.confirmed === true);
  return result;
}

async function logToolCall(
  ctx: ChappiToolContext,
  tool: ChappiTool,
  args: Record<string, unknown>,
  object: ReturnType<typeof resolveLogObject>,
  before: unknown,
  result: ChappiToolResult,
  thrown: string | null,
  confirmed: boolean
) {
  try {
    const after = object ? await snapshotLogObject(ctx.adminClient, object).catch(() => null) : null;
    // A created object has no id in its args; what the tool handed back is
    // the best "after" there is.
    const afterValue = after ?? (result.ok && !object ? result.data ?? null : null);
    const row = (Array.isArray(before) ? null : before) as Record<string, unknown> | null;
    const releaseId =
      (typeof args.releaseId === 'string' && args.releaseId) ||
      (object?.type === 'release' ? object.ids[0] : null) ||
      (typeof row?.release_id === 'string' ? row.release_id : null);
    const workspaceId =
      (typeof row?.workspace_id === 'string' ? row.workspace_id : null) || ctx.workspaceIds[0] || null;
    await logUrgansAction(ctx.adminClient, {
      source: ctx.audit?.source ?? 'chat',
      trigger: ctx.audit?.trigger ?? (confirmed ? 'confirmed_card' : 'message'),
      tool: tool.name,
      level: tool.level,
      actorUserId: ctx.user.id,
      workspaceId,
      releaseId,
      objectType: object?.type ?? null,
      objectId: object && object.ids.length === 1 ? object.ids[0] : null,
      args,
      before,
      after: afterValue,
      confirmed,
      ok: result.ok,
      summary: result.summary,
      error: thrown ?? (result.ok ? null : result.summary),
    });
  } catch (error) {
    console.error('[chappi] action log failed:', error);
  }
}
