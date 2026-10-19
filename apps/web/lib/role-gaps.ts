import { roleNeededForTask, type DirectoryRole } from './directory-roles';

/**
 * Which jobs on this release have nobody on them.
 *
 * The rollout plan already knows what a release needs, so the plan writes the
 * job posts and nobody has to describe what they are looking for. Pure, in
 * lib/, so the rule is testable and the panel stays presentational.
 *
 * WHAT COUNTS AS A GAP, and it is not what it looks like:
 *
 * Template instantiation assigns EVERY task to the release owner, so there is
 * no such thing as an unassigned template task and a panel keyed on "nobody
 * assigned" would be permanently empty. A row still sitting on the owner is
 * the signal — lib/task-owners-server.ts already calls it "the unmoved
 * default" and uses the same filter to decide what counts as evidence.
 *
 * A manager-added activity CAN carry no assignee, so both count.
 */

export type GapTask = {
  id: string;
  templateTaskId: string | null;
  assignedToUserId: string | null;
  status: string;
  dueDate: string | null;
  title: string;
};

export type RoleGap = {
  role: DirectoryRole;
  /** The earliest step that needs this role. */
  taskId: string;
  taskTitle: string;
  dueDate: string | null;
};

/** Sorts a null date LAST. "No date" is not "due now", and leading the panel
 *  with a dateless row would bury the urgent one. */
function byDueDate(a: RoleGap, b: RoleGap): number {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return a.role.localeCompare(b.role);
}

export function findRoleGaps(tasks: GapTask[], ownerUserId: string): RoleGap[] {
  const earliest = new Map<DirectoryRole, RoleGap>();

  for (const task of tasks) {
    // The work happened. A manager who did their own artwork should not be
    // told they need a designer.
    if (task.status === 'done') continue;
    // Dropped work needs nobody (URG-389): a cancelled step must not tell the
    // manager to go and hire for it.
    if (task.status === 'cancelled') continue;

    // Somebody else is on it. Telling the manager to go and hire would be
    // wrong, and this is the rule the whole panel rests on.
    const assignee = task.assignedToUserId;
    if (assignee && assignee !== ownerUserId) continue;

    const role = roleNeededForTask(task.templateTaskId);
    if (!role) continue;

    const candidate: RoleGap = {
      role,
      taskId: task.id,
      taskTitle: task.title,
      dueDate: task.dueDate,
    };

    // EARLIEST per role. Surfacing the late step instead of the briefing one
    // tells the manager a week after it would have helped.
    const held = earliest.get(role);
    if (!held || byDueDate(candidate, held) < 0) earliest.set(role, candidate);
  }

  return [...earliest.values()].sort(byDueDate);
}
