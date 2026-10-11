import { DIRECTORY_ROLE_LABELS, type DirectoryRole } from './directory-roles';
import type { WorkRequestStatus } from './work-requests';

/**
 * "Find someone" on an open activity: the link into the directory and how the
 * row reads once somebody has been asked. Pure, so the pop-up's row and the
 * tests share one answer.
 */

/** The directory, filtered to the job this activity needs and to people taking
 *  work, carrying the rollout and the activity so a request made from there is
 *  tied to this one. `from=task` is how the demand it creates is told apart. */
export function findSomeoneHref(input: {
  role: DirectoryRole;
  releaseId: string;
  taskId: string;
}): string {
  const params = new URLSearchParams({
    role: input.role,
    availability: 'open',
    from: 'task',
    release: input.releaseId,
    task: input.taskId,
  });
  return `/dashboard/directory?${params.toString()}`;
}

export type TaskAsk = {
  status: WorkRequestStatus;
  recipient_name?: string;
  assigned_at?: string | null;
};

export type FindSomeoneView =
  | { kind: 'find'; label: string }
  | { kind: 'waiting'; text: string }
  | { kind: 'on_it'; text: string };

/**
 * What the row says. A person who said yes beats one still waiting, and an
 * answered-no or closed ask means the row goes back to offering the search,
 * because that is the next thing to do.
 */
export function describeFindSomeone(role: DirectoryRole, asks: TaskAsk[]): FindSomeoneView {
  const named = (ask: TaskAsk) => (ask.recipient_name || '').trim() || 'Somebody';
  const yes = asks.find((ask) => ask.status === 'interested');
  if (yes) {
    return {
      kind: 'on_it',
      text: yes.assigned_at ? `${named(yes)} is on this` : `${named(yes)} said yes`,
    };
  }
  const waiting = asks.find((ask) => ask.status === 'new');
  if (waiting) return { kind: 'waiting', text: `Asked ${named(waiting)}, waiting` };
  return { kind: 'find', label: `Find ${DIRECTORY_ROLE_LABELS[role].toLowerCase()}` };
}
