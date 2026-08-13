// Chappi tool registry (SERVER-ONLY). Each tool declares its Anthropic input
// schema + kind, and an `execute` that follows the propose→validate→execute
// discipline: read tools go straight through the services; mutating tools call
// the EXISTING REST endpoints via an internal fetch so every side effect
// (template instantiation, assignee validation, notifications) is preserved and
// nothing is reimplemented — except completion, which needs the dependency
// cascade the PATCH route lacks and so goes through TaskService directly.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ReleaseService } from '@/lib/services/release-service';
import { TaskService } from '@/lib/services/task-service';
import type {
  ChappiClientAction,
  ChappiToolKind,
  ChappiToolName,
  ChappiToolResult,
} from './types';

export type ChappiToolContext = {
  user: { id: string; email?: string | null };
  adminClient: SupabaseClient;
  /** Workspaces the caller can access (from loadWorkspaceAccessContext). */
  workspaceIds: string[];
  /** Same-origin base for internal REST calls, e.g. "http://localhost:3000". */
  origin: string;
  /** The caller's bearer token, forwarded to the protected REST endpoints. */
  authToken: string;
};

type ToolInputSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
};

export type ChappiTool = {
  name: ChappiToolName;
  kind: ChappiToolKind;
  description: string;
  inputSchema: ToolInputSchema;
  execute: (ctx: ChappiToolContext, args: Record<string, unknown>) => Promise<ChappiToolResult>;
};

// ── helpers ────────────────────────────────────────────────────────────────

function argString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value.trim() : '';
}

function fail(summary: string): ChappiToolResult {
  return { ok: false, summary };
}

async function callInternalApi(
  ctx: ChappiToolContext,
  path: string,
  init: { method: string; body?: Record<string, unknown> }
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${ctx.origin}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${ctx.authToken}`,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, body };
}

type CompactTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
};

function compactTask(task: {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}): CompactTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
  };
}

// ── registry ────────────────────────────────────────────────────────────────

export const CHAPPI_TOOLS: ChappiTool[] = [
  {
    name: 'list_releases',
    kind: 'read',
    description: "List all of the user's releases with status and date.",
    inputSchema: { type: 'object', properties: {} },
    execute: async (ctx) => {
      const releases = await new ReleaseService(ctx.adminClient).getReleasesForUser(ctx.user.id);
      const data = releases.map((r) => ({
        id: r.id,
        title: r.title,
        artist: r.artistName,
        status: r.status,
        releaseDate: r.releaseDate,
      }));
      return { ok: true, summary: `Found ${data.length} release(s).`, data };
    },
  },
  {
    name: 'get_release',
    kind: 'read',
    description: 'Get one release and its tasks by release id.',
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string', description: 'The release id.' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const releases = await new ReleaseService(ctx.adminClient).getReleasesForUser(ctx.user.id);
      const release = releases.find((r) => r.id === releaseId);
      if (!release) return fail('That release was not found in your workspace.');
      const tasks = await new TaskService(ctx.adminClient).getTasksForUser(
        ctx.user.id,
        ctx.workspaceIds,
        { releaseId }
      );
      const done = tasks.filter((t) => t.status === 'done').length;
      return {
        ok: true,
        summary: `${release.title}: ${done}/${tasks.length} tasks done.`,
        data: {
          release: {
            id: release.id,
            title: release.title,
            artist: release.artistName,
            status: release.status,
            releaseDate: release.releaseDate,
          },
          tasks: tasks.map(compactTask),
        },
      };
    },
  },
  {
    name: 'list_tasks',
    kind: 'read',
    description: 'List tasks, optionally filtered by release, status, or priority.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        status: { type: 'string', description: 'e.g. todo, in_progress, done, locked' },
        priority: { type: 'string', description: 'none, low, medium, high' },
      },
    },
    execute: async (ctx, args) => {
      const tasks = await new TaskService(ctx.adminClient).getTasksForUser(
        ctx.user.id,
        ctx.workspaceIds,
        {
          releaseId: argString(args, 'releaseId') || undefined,
          status: argString(args, 'status') || undefined,
          priority: argString(args, 'priority') || undefined,
        }
      );
      return { ok: true, summary: `Found ${tasks.length} task(s).`, data: tasks.map(compactTask) };
    },
  },
  {
    name: 'get_dashboard',
    kind: 'read',
    description:
      "Get a high-level snapshot: release count, task counts by state, and today's suggested focus task.",
    inputSchema: { type: 'object', properties: {} },
    execute: async (ctx) => {
      const releases = await new ReleaseService(ctx.adminClient).getReleasesForUser(ctx.user.id);
      const tasks = ctx.workspaceIds.length
        ? await new TaskService(ctx.adminClient).getTasksForUser(ctx.user.id, ctx.workspaceIds)
        : [];
      const incomplete = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
      const todayStr = new Date().toISOString().slice(0, 10);
      const overdue = incomplete.find((t) => t.dueDate && t.dueDate < todayStr);
      const dueToday = incomplete.find((t) => t.dueDate === todayStr);
      const focus = overdue || dueToday || incomplete[0] || null;
      return {
        ok: true,
        summary: `${releases.length} release(s), ${incomplete.length} open task(s).`,
        data: {
          releaseCount: releases.length,
          openTasks: incomplete.length,
          doneTasks: tasks.length - incomplete.length,
          todaysFocus: focus ? compactTask(focus) : null,
        },
      };
    },
  },
  {
    name: 'create_release',
    kind: 'mutate',
    description:
      "Create a new release. Depending on the environment this either generates the rollout task plan from the template straight away, or leaves the release ready to be planned. Call this AT MOST ONCE per user request — it is not idempotent.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The release title.' },
        releaseDate: { type: 'string', description: 'Optional release date, YYYY-MM-DD.' },
      },
      required: ['title'],
    },
    execute: async (ctx, args) => {
      const title = argString(args, 'title');
      if (!title) return fail('title is required.');
      const releaseDate = argString(args, 'releaseDate');
      const res = await callInternalApi(ctx, '/api/releases', {
        method: 'POST',
        body: { title, releaseDate: releaseDate || undefined, source: 'chappi' },
      });
      if (!res.ok) return fail(String(res.body.error || 'Could not create the release.'));
      const releaseId = String(res.body.releaseId || '');
      const clientAction: ChappiClientAction = releaseId
        ? { type: 'navigate', href: `/dashboard?release=${releaseId}` }
        : { type: 'refresh' };
      // Branch on what the API actually did, not on the flag: with the
      // planner on, the release is created with no tasks and the manager
      // plans it, so promising a generated plan here would be a lie.
      const plannerPending = res.body.plannerPending === true;
      return {
        ok: true,
        summary: plannerPending
          ? `Created "${title}". Open it to plan the rollout with UrgAns.`
          : `Created "${title}" and generated its rollout tasks.`,
        data: { releaseId },
        clientAction,
      };
    },
  },
  {
    name: 'create_task',
    kind: 'mutate',
    description: 'Create a task on a release.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        dueDate: { type: 'string', description: 'YYYY-MM-DD' },
        priority: { type: 'string', description: 'none, low, medium, high' },
        assigneeId: { type: 'string', description: 'Workspace member user id to assign.' },
      },
      required: ['releaseId', 'title'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const title = argString(args, 'title');
      if (!releaseId || !title) return fail('releaseId and title are required.');
      const res = await callInternalApi(ctx, '/api/tasks', {
        method: 'POST',
        body: {
          releaseId,
          title,
          description: argString(args, 'description') || undefined,
          dueDate: argString(args, 'dueDate') || undefined,
          priority: argString(args, 'priority') || undefined,
          assignedToUserId: argString(args, 'assigneeId') || undefined,
          autoGenerated: false,
          source: 'quick_create',
        },
      });
      if (!res.ok) return fail(String(res.body.error || 'Could not create the task.'));
      return {
        ok: true,
        summary: `Added "${title}".`,
        data: { taskId: res.body.taskId ?? (res.body.task as { id?: string })?.id ?? null },
        clientAction: { type: 'refresh' },
      };
    },
  },
  {
    name: 'create_note',
    kind: 'mutate',
    description: "Create a private note for the user. Optionally attach it to a release.",
    inputSchema: {
      type: 'object',
      properties: {
        body: {
          type: 'string',
          description: 'The note text. Its first line becomes the title.',
        },
        releaseId: {
          type: 'string',
          description: 'Release to attach the note to. Omit for a note with no release.',
        },
      },
      required: ['body'],
    },
    execute: async (ctx, args) => {
      const body = argString(args, 'body');
      if (!body) return fail('The note needs some text.');
      const res = await callInternalApi(ctx, '/api/notes', {
        method: 'POST',
        // Explicit null, not undefined: the route distinguishes "no release"
        // from a malformed value, and JSON.stringify would drop undefined.
        body: { body, releaseId: argString(args, 'releaseId') || null },
      });
      // The route 404s for two unrelated reasons and the model needs to tell
      // them apart: the feature being off ('Not found.', the flag gate) versus
      // a release that isn't the user's ('Release not found.', which is a
      // useful thing to relay). Matching the exact flag-gate string keeps the
      // ownership message intact instead of swallowing both as "not enabled".
      //
      // Translating the flag here rather than gating registration keeps the
      // check per-request: NEXT_PUBLIC_* reads are inlined at build time, so a
      // registry-level gate would bake the answer into the bundle. Same
      // approach generate_status_update takes below.
      if (res.status === 404 && res.body.error === 'Not found.') {
        return fail("Notes aren't enabled yet.");
      }
      if (!res.ok) return fail(String(res.body.error || 'Could not save the note.'));
      return {
        ok: true,
        summary: 'Saved the note.',
        data: { noteId: (res.body.note as { id?: string })?.id ?? null },
        // Deliberately no clientAction. Navigating away mid-conversation would
        // interrupt the capture the user is still in, and `refresh` re-syncs
        // the command center, which does not carry notes.
      };
    },
  },
  {
    name: 'update_task',
    kind: 'mutate',
    description: 'Update a task: title, description, due date, priority, or assignee.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        dueDate: { type: 'string', description: 'YYYY-MM-DD' },
        priority: { type: 'string', description: 'none, low, medium, high' },
        assigneeId: { type: 'string', description: 'Workspace member user id.' },
      },
      required: ['taskId'],
    },
    execute: async (ctx, args) => {
      const taskId = argString(args, 'taskId');
      if (!taskId) return fail('taskId is required.');
      const patch: Record<string, unknown> = {};
      if (argString(args, 'title')) patch.title = argString(args, 'title');
      if (argString(args, 'description')) patch.description = argString(args, 'description');
      if (argString(args, 'dueDate')) patch.dueDate = argString(args, 'dueDate');
      if (argString(args, 'priority')) patch.priority = argString(args, 'priority');
      if (argString(args, 'assigneeId')) patch.assignedToUserId = argString(args, 'assigneeId');
      if (Object.keys(patch).length === 0) return fail('Nothing to update — provide a field to change.');
      const res = await callInternalApi(ctx, `/api/tasks/${taskId}`, { method: 'PATCH', body: patch });
      if (!res.ok) return fail(String(res.body.error || 'Could not update the task.'));
      return { ok: true, summary: 'Task updated.', clientAction: { type: 'refresh' } };
    },
  },
  {
    name: 'complete_task',
    kind: 'mutate',
    description:
      'Mark a task done. Enforces the dependency gate — a task blocked by unfinished dependencies cannot be completed.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
    },
    execute: async (ctx, args) => {
      const taskId = argString(args, 'taskId');
      if (!taskId) return fail('taskId is required.');
      const result = await new TaskService(ctx.adminClient).completeTaskWithCascade(
        taskId,
        ctx.user.id,
        ctx.workspaceIds
      );
      if (!result.ok) return fail(result.message);
      const unlocked = result.unlockedIds.length
        ? ` Unlocked ${result.unlockedIds.length} dependent task(s).`
        : '';
      return {
        ok: true,
        summary: `Marked the task done.${unlocked}`,
        clientAction: { type: 'refresh' },
      };
    },
  },
  {
    name: 'reopen_task',
    kind: 'mutate',
    description: 'Reopen a completed task (set it back to todo).',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
    },
    execute: async (ctx, args) => {
      const taskId = argString(args, 'taskId');
      if (!taskId) return fail('taskId is required.');
      const result = await new TaskService(ctx.adminClient).reopenTask(taskId, ctx.workspaceIds);
      if (!result.ok) return fail(result.message);
      return { ok: true, summary: 'Task reopened.', clientAction: { type: 'refresh' } };
    },
  },
  {
    name: 'generate_status_update',
    kind: 'mutate',
    description: 'Generate a one-paragraph status update for a release.',
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/generate-status`, {
        method: 'POST',
        body: {},
      });
      if (!res.ok) {
        if (res.status === 404) return fail('The status update generator is not enabled yet.');
        return fail(String(res.body.error || 'Could not generate the status update.'));
      }
      const statusUpdate = String(res.body.status_update || '');
      return {
        ok: true,
        summary: statusUpdate || 'Generated a status update.',
        data: { statusUpdate },
      };
    },
  },
  {
    name: 'navigate',
    kind: 'mutate',
    description: 'Take the user to a page: the dashboard, settings, or a specific release.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['dashboard', 'settings', 'release'] },
        releaseId: { type: 'string', description: 'Required when target is "release".' },
      },
      required: ['target'],
    },
    execute: async (_ctx, args) => {
      const target = argString(args, 'target');
      const releaseId = argString(args, 'releaseId');
      let href = '/dashboard';
      if (target === 'settings') href = '/settings';
      else if (target === 'release') {
        if (!releaseId) return fail('releaseId is required to open a release.');
        href = `/dashboard?release=${releaseId}`;
      }
      return { ok: true, summary: 'Navigating…', clientAction: { type: 'navigate', href } };
    },
  },
];

const TOOLS_BY_NAME = new Map<string, ChappiTool>(CHAPPI_TOOLS.map((tool) => [tool.name, tool]));

export function getChappiTool(name: string): ChappiTool | undefined {
  return TOOLS_BY_NAME.get(name);
}

/** OpenAI chat-completions tool schemas derived from the registry (the shape
 * the RodiumAi gateway's /v1/chat/completions expects). */
export function getChappiToolSchemas() {
  return CHAPPI_TOOLS.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}
