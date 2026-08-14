// Release + task lifecycle tools (SERVER-ONLY): editing, scheduling, deleting.
//
// Two things here are easy to get wrong and are handled deliberately:
//
// 1. PATCH /api/releases/[releaseId] behaves like a PUT — `title` is required
//    and any field omitted from the body is written as null. So update_release
//    READS the release first and merges, rather than sending a sparse patch
//    that would silently wipe the description.
// 2. delete_release / delete_task are confirmation-gated. Their `confirm`
//    builders state the real blast radius (task counts), and the runner never
//    executes them from inside the model loop — see runner.ts.

import { ReleaseService } from '@/lib/services/release-service';
import { TaskService } from '@/lib/services/task-service';
import {
  apiError,
  argString,
  callInternalApi,
  fail,
  type ChappiTool,
} from './shared';

/** YYYY-MM-DD, and a real date — the schedule route rejects anything else. */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const RELEASE_TOOLS: ChappiTool[] = [
  {
    name: 'update_release',
    kind: 'mutate',
    description:
      "Edit a release's title, description, or status. Pass only the fields you are changing — everything else is preserved. To change the release DATE use schedule_release instead.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: {
          type: 'string',
          enum: ['draft', 'planning', 'in_progress', 'ready', 'released', 'archived'],
        },
      },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');

      const title = argString(args, 'title');
      const description = argString(args, 'description');
      const status = argString(args, 'status');
      if (!title && !description && !status) {
        return fail('Nothing to update — provide a title, description, or status.');
      }

      // Read-then-merge: the route replaces the whole row, so a sparse body
      // would null out whatever it omits.
      const current = await callInternalApi(ctx, `/api/releases/${releaseId}`, { method: 'GET' });
      if (!current.ok) {
        return fail(apiError(current, 'That release was not found in your workspace.'));
      }
      const release = (current.body.release ?? {}) as Record<string, unknown>;
      const currentTitle = typeof release.title === 'string' ? release.title : '';
      const currentDescription =
        typeof release.description === 'string' ? release.description : '';
      // The GET overwrites `status` with a COMPUTED value that is never
      // 'released'; echoing it back would rewrite the stored status. Only send
      // a status when the user actually asked to change one.
      const body: Record<string, unknown> = {
        title: title || currentTitle,
        description: description || currentDescription,
      };
      if (status) body.status = status;
      if (!body.title) return fail('A release needs a title.');

      const res = await callInternalApi(ctx, `/api/releases/${releaseId}`, {
        method: 'PATCH',
        body,
      });
      if (!res.ok) return fail(apiError(res, 'Could not update the release.'));
      return {
        ok: true,
        summary: `Updated "${body.title as string}".`,
        clientAction: { type: 'refresh' },
      };
    },
  },
  {
    name: 'schedule_release',
    kind: 'mutate',
    description:
      "Set or change a release's date. If the release was waiting on a date to build its rollout activities, this also creates them.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        releaseDate: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['releaseId', 'releaseDate'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const releaseDate = argString(args, 'releaseDate');
      if (!releaseId || !releaseDate) return fail('releaseId and releaseDate are required.');
      if (!isIsoDate(releaseDate)) return fail('releaseDate must be a real date in YYYY-MM-DD form.');

      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/schedule`, {
        method: 'POST',
        body: { releaseDate },
      });
      if (!res.ok) return fail(apiError(res, 'Could not set the release date.'));

      // 207: the date saved but building the activities failed. Say so rather
      // than reporting a clean success.
      const created = Number(res.body.activitiesCreated ?? 0);
      const stillPending = res.body.templatePending === true;
      if (stillPending) {
        return {
          ok: true,
          summary: `Set the date to ${releaseDate}, but the rollout activities could not be built yet. Try again shortly.`,
          clientAction: { type: 'refresh' },
        };
      }
      return {
        ok: true,
        summary: created
          ? `Set the date to ${releaseDate} and built ${created} activities.`
          : `Set the date to ${releaseDate}.`,
        clientAction: { type: 'refresh' },
      };
    },
  },
  {
    name: 'delete_release',
    kind: 'mutate',
    description:
      'Permanently delete a release and everything attached to it. Requires the user to approve a confirmation card — calling this only proposes the deletion, it does not perform it.',
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    confirm: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return { ok: false, summary: 'releaseId is required.' };

      const releases = await new ReleaseService(ctx.adminClient).getReleasesForUser(ctx.user.id);
      const release = releases.find((r) => r.id === releaseId);
      if (!release) return { ok: false, summary: 'That release was not found in your workspace.' };

      const tasks = await new TaskService(ctx.adminClient).getTasksForUser(
        ctx.user.id,
        ctx.workspaceIds,
        { releaseId }
      );
      const taskLine = tasks.length === 1 ? '1 activity' : `${tasks.length} activities`;
      return {
        ok: true,
        title: `Delete "${release.title}"?`,
        detail: `This removes the release, its ${taskLine}, and every file attached to it. It cannot be undone.`,
        confirmLabel: 'Delete release',
      };
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}`, { method: 'DELETE' });
      if (!res.ok) return fail(apiError(res, 'Could not delete the release.'));
      return {
        ok: true,
        summary: 'Deleted the release.',
        // Back to the catalog: the scoped view the user may be sitting on now
        // points at a release that no longer exists.
        clientAction: { type: 'navigate', href: '/dashboard' },
      };
    },
  },
  {
    name: 'delete_task',
    kind: 'mutate',
    description:
      'Permanently delete a task. Requires the user to approve a confirmation card — calling this only proposes the deletion, it does not perform it.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
    },
    confirm: async (ctx, args) => {
      const taskId = argString(args, 'taskId');
      if (!taskId) return { ok: false, summary: 'taskId is required.' };
      const tasks = await new TaskService(ctx.adminClient).getTasksForUser(
        ctx.user.id,
        ctx.workspaceIds
      );
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return { ok: false, summary: 'That activity was not found in your workspace.' };
      return {
        ok: true,
        title: `Delete "${task.title}"?`,
        detail: 'This removes the activity and its comments and attachments. It cannot be undone.',
        confirmLabel: 'Delete activity',
      };
    },
    execute: async (ctx, args) => {
      const taskId = argString(args, 'taskId');
      if (!taskId) return fail('taskId is required.');
      const res = await callInternalApi(ctx, `/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) return fail(apiError(res, 'Could not delete the activity.'));
      return { ok: true, summary: 'Deleted the activity.', clientAction: { type: 'refresh' } };
    },
  },
  {
    name: 'add_task_comment',
    kind: 'mutate',
    description: 'Add a comment to a task.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        content: { type: 'string', description: 'The comment text.' },
      },
      required: ['taskId', 'content'],
    },
    execute: async (ctx, args) => {
      const taskId = argString(args, 'taskId');
      const content = argString(args, 'content');
      if (!taskId || !content) return fail('taskId and content are required.');
      const res = await callInternalApi(ctx, `/api/tasks/${taskId}/comments`, {
        method: 'POST',
        body: { content },
      });
      if (!res.ok) return fail(apiError(res, 'Could not add the comment.'));
      return { ok: true, summary: 'Added the comment.', clientAction: { type: 'refresh' } };
    },
  },
];
