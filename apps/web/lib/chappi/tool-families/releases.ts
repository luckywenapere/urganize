// Release + task lifecycle tools (SERVER-ONLY): editing, scheduling, deleting.
//
// Two things here are easy to get wrong and are handled deliberately:
//
// 1. update_release sends ONLY the fields the model was actually asked to
//    change. Until 2026-09-25 this was load-bearing safety: PATCH
//    /api/releases/[releaseId] behaved like a PUT that nulled anything the
//    body omitted, and this tool worked around it with a GET-then-merge. A
//    rename-only call still omitted releaseDate, though, and the route wrote
//    that as NULL — so asking UrgAns to rename a rollout silently wiped its
//    release date and hid the whole plan behind "Set a release date first".
//    The route is a TRUE partial update now (see lib/release-edit.ts): a field
//    absent from the body is left alone, full stop, and the date is not
//    writable here at all — only through schedule_release, which also moves an
//    existing plan so it stays lined up with release day. The GET-then-merge
//    is gone; presence-testing which fields the model actually mentioned
//    (hasField below, not argString's collapse-to-'') is what is load-bearing
//    now, so "the model didn't mention X" and "the model asked to clear X"
//    stay distinguishable.
// 2. delete_release / delete_task are confirmation-gated. Their `confirm`
//    builders state the real blast radius (task counts), and the runner never
//    executes them from inside the model loop — see runner.ts.

import { TaskService } from '@/lib/services/task-service';
import { listOwnedReleases } from '../release-scope';
import {
  apiError,
  argBoolean,
  argString,
  callInternalApi,
  fail,
  type ChappiTool,
} from './shared';

/** Was this key actually IN the model's call, as opposed to simply falsy?
 * `argString` collapses "absent" and "present but empty" to the same '' —
 * right for a required id, wrong here, where an explicit empty description
 * means "clear it" and an absent one means "leave it". */
function hasField(args: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(args, key) && args[key] !== undefined;
}

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
    level: 'auto',
    description:
      "Edit a rollout's title, description, or status. Pass only the fields you are changing — anything you omit is left exactly as it is, including the release date. To change the release DATE use schedule_release instead, which also moves the rollout's activities so they stay lined up with the new day.",
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

      if (!hasField(args, 'title') && !hasField(args, 'description') && !hasField(args, 'status')) {
        return fail('Nothing to update — provide a title, description, or status.');
      }

      // Only the fields the model actually mentioned. The route is a true
      // partial update — see the header comment — so this can never again
      // wipe the release date, or anything else, by omission.
      const body: Record<string, unknown> = {};
      if (hasField(args, 'title')) body.title = argString(args, 'title');
      if (hasField(args, 'description')) body.description = argString(args, 'description');
      if (hasField(args, 'status')) body.status = argString(args, 'status');

      const res = await callInternalApi(ctx, `/api/releases/${releaseId}`, {
        method: 'PATCH',
        body,
      });
      if (!res.ok) return fail(apiError(res, 'Could not update the rollout.'));

      const changed = Array.isArray(res.body.changed) ? (res.body.changed as string[]) : [];
      const release = (res.body.release ?? {}) as { title?: unknown };
      const title = typeof release.title === 'string' ? release.title : '';
      if (changed.length === 0) {
        return {
          ok: true,
          summary: title ? `"${title}" already matches that — nothing to change.` : 'Nothing to change.',
        };
      }
      return {
        ok: true,
        summary: title ? `Updated "${title}".` : 'Updated the rollout.',
        clientAction: { type: 'refresh' },
      };
    },
  },
  {
    name: 'schedule_release',
    kind: 'mutate',
    level: 'auto',
    description:
      "Set or change a rollout's date. If the rollout was waiting on a date to build its rollout activities, this also creates them.",
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
    level: 'confirm',
    description:
      'Move a rollout to Trash, where the user can restore it for 30 days. Requires the user to approve a confirmation card and type the rollout name or DELETE themselves — calling this only proposes the deletion, it does not perform it, and you can never supply that confirmation.',
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    confirm: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return { ok: false, summary: 'releaseId is required.' };

      // OWNER-ONLY on purpose, unlike every other release read in the
      // assistant. DELETE /api/releases/[releaseId] runs ensureReleaseOwnership
      // against the caller alone, so widening this to the whole team would show
      // a teammate a confirmation card for a deletion that 403s the moment they
      // approve it. See listOwnedReleases in ../release-scope.ts.
      const releases = await listOwnedReleases(ctx);
      const release = releases.find((r) => r.id === releaseId);
      if (!release) return { ok: false, summary: 'That rollout was not found on your team.' };

      const tasks = await new TaskService(ctx.adminClient).getTasksForUser(
        ctx.user.id,
        ctx,
        { releaseId }
      );
      const taskLine = tasks.length === 1 ? '1 activity' : `${tasks.length} activities`;
      return {
        ok: true,
        title: `Delete "${release.title}"?`,
        detail: `It moves to Trash with its ${taskLine}. It stays there for 30 days and you can restore it from Settings.`,
        confirmLabel: 'Delete rollout',
        typedConfirmation: { phrase: release.title },
      };
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      // The route re-checks the typed confirmation, so a delete that arrives
      // without it (a stale client, a forged call) is refused with a 400.
      const confirmation = argString(args, 'confirmation');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}`, {
        method: 'DELETE',
        body: { confirmation },
      });
      if (!res.ok) return fail(apiError(res, 'Could not delete the rollout.'));
      return {
        ok: true,
        summary: 'Moved the rollout to Trash. It can be restored from Settings for 30 days.',
        // Back to the catalog: the scoped view the user may be sitting on now
        // points at a release that no longer exists.
        clientAction: { type: 'navigate', href: '/dashboard' },
      };
    },
  },
  {
    name: 'delete_task',
    kind: 'mutate',
    level: 'confirm',
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
        ctx
      );
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return { ok: false, summary: 'That activity was not found on your team.' };
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
    level: 'auto',
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
  {
    // ONE tool with a boolean rather than archive_/restore_ as a pair. Nothing
    // records what a release's status was before it was archived, so restoring
    // writes 'draft' either way — two tools would imply a symmetry that does
    // not exist. Not gated: archiving loses nothing and this same tool undoes
    // it, which is also why the workspace's own control is not styled
    // destructive.
    name: 'archive_release',
    kind: 'mutate',
    level: 'auto',
    description:
      "Archive a finished rollout, or bring one back. Archiving hides it from the working catalogue and frees a slot against the plan's active-rollout limit; nothing is deleted. Pass archived: false to restore it, which returns it to draft.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        archived: { type: 'boolean', description: 'True archives it, false brings it back.' },
      },
      required: ['releaseId', 'archived'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const archived = argBoolean(args, 'archived');
      if (archived === undefined) return fail('Say whether to archive it or bring it back.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/archive`, {
        method: 'POST',
        body: { archived },
      });
      if (!res.ok) return fail(apiError(res, 'Could not change the rollout.'));
      return {
        ok: true,
        summary: archived
          ? 'Archived it. Nothing was deleted, and that frees a slot for a new rollout.'
          : 'Brought it back, as a draft.',
        clientAction: { type: 'refresh' },
      };
    },
  },
];
