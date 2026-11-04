import { isUuid } from './next-records';
import { recordHref } from './artist-page';

// A task belongs to a rollout or to a project, never both and never neither
// (tasks_one_owner_check, 4 Nov 2026). The add-a-task route and the AI's
// create_task both decide it here, so they cannot disagree.

export type TaskOwner = { releaseId: string | null; recordId: string | null };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function decideTaskOwner(body: { releaseId?: unknown; recordId?: unknown }):
  | { value: TaskOwner }
  | { error: string } {
  const releaseId = text(body.releaseId);
  const recordId = text(body.recordId);
  if (releaseId && recordId) return { error: 'A task belongs to a rollout or a project, not both.' };
  if (recordId) {
    if (!isUuid(recordId)) return { error: 'That project was not found.' };
    return { value: { releaseId: null, recordId } };
  }
  if (releaseId) return { value: { releaseId, recordId: null } };
  return { error: 'Choose a rollout or a project for this task.' };
}

/** Where a task's notification, push and email link to. */
export function taskHref(input: {
  releaseId: string | null;
  record: { id: string; artistId: string } | null;
}): string {
  if (input.releaseId) return `/dashboard?release=${input.releaseId}`;
  if (input.record?.id && input.record.artistId) {
    return recordHref(input.record.artistId, input.record.id);
  }
  return '/dashboard';
}
