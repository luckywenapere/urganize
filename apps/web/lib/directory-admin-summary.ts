import { DIRECTORY_ROLES, type DirectoryRole } from './directory-roles';
import type { DirectoryDemandSource } from './directory-demand';

/**
 * Supply against demand, one row per role.
 *
 * The founder's read on whether the directory is working, and the one table
 * that answers the only question a cold-start marketplace has: which roles are
 * managers asking for that nobody has delivered. That is the recruiting list,
 * and it is `recruit` below.
 *
 * Aggregated in TypeScript rather than SQL, the same call
 * lib/urgans-actions/admin-summary.ts made and for the same reasons: a view
 * defaults to owner privileges, and at this volume the arithmetic is free.
 *
 * SUPPLY IS PEOPLE, NEVER RECORDS. Somebody who delivered artwork on four
 * releases is one designer you can call, not four.
 */

export type DirectoryProfileRow = { roles: string[] };
export type DirectoryRecordRow = { userId: string; role: string };
export type DirectoryDemandRow = { role: string; matched: boolean; source: DirectoryDemandSource };

export type DirectoryRoleSummary = {
  role: DirectoryRole;
  /** People who claim it. Their own word. */
  listed: number;
  /** People with at least one delivery record for it. What we vouch for. */
  delivered: number;
  /** Times somebody looked for it. */
  wanted: number;
  /** Times they looked and nobody came back. */
  unmet: number;
  /** How much of that demand the role gaps panel created rather than typing. */
  fromRoleGaps: number;
};

export type DirectorySummary = {
  byRole: DirectoryRoleSummary[];
  /** Roles worth recruiting for, worst first. */
  recruit: DirectoryRoleSummary[];
  totals: { listed: number; withARecord: number; wanted: number; unmet: number };
};

const isRole = (value: string): value is DirectoryRole =>
  (DIRECTORY_ROLES as readonly string[]).includes(value);

export function summarizeDirectory(input: {
  profiles: DirectoryProfileRow[];
  records: DirectoryRecordRow[];
  demand: DirectoryDemandRow[];
}): DirectorySummary {
  const blank = (role: DirectoryRole): DirectoryRoleSummary => ({
    role,
    listed: 0,
    delivered: 0,
    wanted: 0,
    unmet: 0,
    fromRoleGaps: 0,
  });

  const rows = new Map<DirectoryRole, DirectoryRoleSummary>();
  const row = (role: DirectoryRole) => {
    const existing = rows.get(role);
    if (existing) return existing;
    const created = blank(role);
    rows.set(role, created);
    return created;
  };

  for (const profile of input.profiles) {
    for (const claimed of profile.roles || []) {
      if (isRole(claimed)) row(claimed).listed += 1;
    }
  }

  // People, not records.
  const peopleByRole = new Map<DirectoryRole, Set<string>>();
  for (const record of input.records) {
    if (!isRole(record.role) || !record.userId) continue;
    const held = peopleByRole.get(record.role) ?? new Set<string>();
    held.add(record.userId);
    peopleByRole.set(record.role, held);
  }
  for (const [role, people] of peopleByRole) {
    row(role).delivered = people.size;
  }

  for (const want of input.demand) {
    if (!isRole(want.role)) continue;
    const entry = row(want.role);
    entry.wanted += 1;
    if (!want.matched) entry.unmet += 1;
    if (want.source === 'role_gap') entry.fromRoleGaps += 1;
  }

  // Vocabulary order, so the table reads the same way every week rather than
  // reshuffling itself as counts move.
  const byRole = DIRECTORY_ROLES.map((role) => rows.get(role)).filter(
    (entry): entry is DirectoryRoleSummary => Boolean(entry)
  );

  // Worst first: most unmet demand, and where that ties, the role with nobody
  // who has ever delivered it. Demand is what makes a gap a gap — a role nobody
  // asked for is not a shortage, and listing every empty role would bury the
  // two that matter.
  const recruit = byRole
    .filter((entry) => entry.unmet > 0)
    .slice()
    .sort((a, b) => b.unmet - a.unmet || a.delivered - b.delivered || b.wanted - a.wanted);

  const withARecord = new Set<string>();
  for (const record of input.records) {
    if (isRole(record.role) && record.userId) withARecord.add(record.userId);
  }

  return {
    byRole,
    recruit,
    totals: {
      listed: input.profiles.length,
      withARecord: withARecord.size,
      wanted: byRole.reduce((sum, entry) => sum + entry.wanted, 0),
      unmet: byRole.reduce((sum, entry) => sum + entry.unmet, 0),
    },
  };
}
