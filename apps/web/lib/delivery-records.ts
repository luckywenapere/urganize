import { isRecapEligible } from './recap-eligibility';
import { roleForTemplateTask, type DirectoryRole } from './directory-roles';

/**
 * Turning task history into a record of what a person has delivered.
 *
 * Pure, so the backfill and any later recompute run the same rule and a change
 * to what the product asserts about somebody is a test failure rather than a
 * quiet drift. Nothing here reads a database; lib/delivery-records-server.ts
 * loads the rows and writes the results.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE RULES, AND EACH ONE EXISTS TO STOP AN INVENTED CREDENTIAL
 *
 * 1. THE RELEASE HAS TO HAVE BEEN DELIVERED, decided by isRecapEligible.
 *    NOT by `releases.status = 'released'`, which the brief asked for and which
 *    would credit nobody ever: nothing in this product writes that value, and
 *    GET /api/releases/[id] overwrites the stored status with a computed one
 *    that cannot be 'released'. isRecapEligible is already the product's honest
 *    answer to "has this happened" (date passed, or every task done), it
 *    already ships, and one definition beats two that drift.
 *
 * 2. NEVER THE RELEASE OWNER. Template instantiation assigns every task to the
 *    owner, so a row still sitting on them is the unmoved default, not a record
 *    of anything. Crediting it would hand one person sixty deliveries per
 *    release. This is the filter lib/task-owners-server.ts already calls "the
 *    insight", for the same reason.
 *
 * 3. ONE ROW PER PERSON PER ROLE PER RELEASE. A designer who delivered a draft
 *    and then the final approved artwork delivered one release's artwork. Two
 *    rows would read as two releases, and the count is the whole product.
 */

export type DeliverySourceTask = {
  id: string;
  assignedToUserId: string | null;
  templateTaskId: string | null;
  status: string;
  completedAt: string | null;
};

export type DeliverySourceRelease = {
  id: string;
  title: string;
  ownerUserId: string;
  releaseDate: string | null;
  status: string;
  tasks: DeliverySourceTask[];
};

export type DeliveryRecord = {
  userId: string;
  role: DirectoryRole;
  releaseId: string;
  /** Whatever the task row carried. Often null: the checkbox completion path
   *  sets status without stamping completed_at, so this is a nice-to-have for
   *  ordering rather than something to filter on. */
  completedAt: string | null;
};

const isDone = (task: DeliverySourceTask): boolean => task.status === 'done';

/** Has this release actually come out? Delegated, never re-implemented. */
export function isReleaseDelivered(release: DeliverySourceRelease, now: Date): boolean {
  const total = release.tasks.length;
  return isRecapEligible(
    { releaseDate: release.releaseDate, status: release.status },
    { totalTasks: total, allTasksDone: total > 0 && release.tasks.every(isDone) },
    now
  );
}

export function buildDeliveryRecords(
  releases: DeliverySourceRelease[],
  now: Date = new Date()
): DeliveryRecord[] {
  const records: DeliveryRecord[] = [];
  // Keyed on person + role + release, which is rule 3 expressed as the only
  // thing that can produce a row.
  const seen = new Set<string>();

  for (const release of releases) {
    if (!isReleaseDelivered(release, now)) continue;

    for (const task of release.tasks) {
      if (!isDone(task)) continue;

      const userId = task.assignedToUserId;
      if (!userId) continue;
      if (userId === release.ownerUserId) continue;

      const role = roleForTemplateTask(task.templateTaskId);
      if (!role) continue;

      const key = `${userId}:${role}:${release.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      records.push({ userId, role, releaseId: release.id, completedAt: task.completedAt });
    }
  }

  return records;
}

export type RoleSummary = {
  role: DirectoryRole;
  records: number;
  people: number;
};

/**
 * What a dry run reports before anything is written.
 *
 * The check that matters is shape rather than size: if one role holds every
 * record, or one person holds sixty, rule 2 has regressed and the backfill
 * must not run.
 */
export function summarizeByRole(records: DeliveryRecord[]): RoleSummary[] {
  const byRole = new Map<DirectoryRole, Set<string>>();
  const counts = new Map<DirectoryRole, number>();

  for (const record of records) {
    counts.set(record.role, (counts.get(record.role) ?? 0) + 1);
    const people = byRole.get(record.role) ?? new Set<string>();
    people.add(record.userId);
    byRole.set(record.role, people);
  }

  return [...counts.entries()]
    .map(([role, count]) => ({ role, records: count, people: byRole.get(role)?.size ?? 0 }))
    .sort((a, b) => a.role.localeCompare(b.role));
}
