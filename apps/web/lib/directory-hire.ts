import { DIRECTORY_ROLE_LABELS, type DirectoryRole } from './directory-roles';
import type { DirectoryFilters } from './directory-search';
import type { ProfileType } from './directory-profile-type';
import { findRoleGaps, type GapTask } from './role-gaps';
import type { ProfileRole } from '@/types/directory';

/**
 * The Directory on a computer (#1221, approved mock directory-desktop): a place
 * you hire from. Pure and client-safe.
 *
 * The chips name the jobs people hire for and map onto the existing
 * DIRECTORY_ROLES filters. A chip with one role sets `role`, so the demand
 * beacon, the ask sheet's default role and the role gaps links all keep
 * working as they did; a chip with several sets `roles`. Managers is the
 * profile TYPE, for the reason lib/directory-chips.ts gives.
 */

export type HireChipKey =
  | 'everyone'
  | 'designers'
  | 'engineers'
  | 'producers'
  | 'videographers'
  | 'pr'
  | 'marketers'
  | 'managers'
  | 'a_and_r';

type HireChip = {
  key: HireChipKey;
  label: string;
  roles: readonly DirectoryRole[];
  profileType?: ProfileType;
};

export const HIRE_CHIPS: readonly HireChip[] = [
  { key: 'everyone', label: 'Everyone', roles: [] },
  { key: 'designers', label: 'Designers', roles: ['graphic_designer'] },
  { key: 'engineers', label: 'Engineers', roles: ['mix_engineer', 'master_engineer'] },
  { key: 'producers', label: 'Producers', roles: ['producer'] },
  { key: 'videographers', label: 'Videographers', roles: ['videographer', 'video_director'] },
  { key: 'pr', label: 'PR', roles: ['pr'] },
  { key: 'marketers', label: 'Marketers', roles: ['digital_marketer'] },
  { key: 'managers', label: 'Managers', roles: [], profileType: 'manager' },
  { key: 'a_and_r', label: 'A&R', roles: ['a_and_r'] },
];

type ChipFilters = Pick<DirectoryFilters, 'role' | 'roles' | 'profileType'>;

/** The filter change a chip makes. Every chip clears the others' filters. */
export function hireChipFilters(key: HireChipKey): Required<ChipFilters> {
  const chip = HIRE_CHIPS.find((entry) => entry.key === key) ?? HIRE_CHIPS[0];
  if (chip.profileType) return { role: null, roles: null, profileType: chip.profileType };
  if (chip.roles.length === 1) return { role: chip.roles[0], roles: null, profileType: null };
  if (chip.roles.length > 1) return { role: null, roles: [...chip.roles], profileType: null };
  return { role: null, roles: null, profileType: null };
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((entry) => b.includes(entry));

/** Which chip reads as on. Null when the filters (a link) name something no chip does. */
export function activeHireChip(filters: ChipFilters): HireChipKey | null {
  const role = filters.role ?? null;
  const roles = filters.roles && filters.roles.length > 0 ? filters.roles : null;
  const type = filters.profileType ?? null;
  if (!role && !roles && !type) return 'everyone';
  for (const chip of HIRE_CHIPS) {
    if (chip.profileType) {
      if (!role && !roles && type === chip.profileType) return chip.key;
      continue;
    }
    if (type) continue;
    if (chip.roles.length === 1 && role === chip.roles[0] && !roles) return chip.key;
    if (chip.roles.length > 1 && !role && roles && sameSet(roles, chip.roles)) return chip.key;
  }
  return null;
}

/** The role a search says is in demand. A many-role chip says nothing about which job is short. */
export function demandRole(filters: ChipFilters): DirectoryRole | null {
  return filters.role ?? null;
}

/** The work itself, for a row and a profile: what arrives when the role delivers. */
export const ROLE_WORK: Record<DirectoryRole, string> = {
  manager: 'Management',
  a_and_r: 'A&R',
  producer: 'Production',
  mix_engineer: 'Mixes',
  master_engineer: 'Masters',
  songwriter: 'Songwriting',
  videographer: 'Video edits',
  video_director: 'Video direction',
  photographer: 'Photos',
  graphic_designer: 'Cover art',
  pr: 'Press',
  digital_marketer: 'Ads',
  playlist_curator: 'Playlisting',
  booking_agent: 'Bookings',
  tour_manager: 'Tour management',
  distributor: 'Distribution',
};

/**
 * "Cover art on 2 rollouts", from delivery records only (one record per role
 * per rollout, so `delivered` is a count of rollouts). Claimed roles never
 * count: somebody who only says they design is "New here".
 */
export function deliveredLine(roles: readonly ProfileRole[]): string {
  let best: ProfileRole | null = null;
  for (const held of roles) {
    if (held.delivered > 0 && (!best || held.delivered > best.delivered)) best = held;
  }
  if (!best) return 'New here';
  return `${ROLE_WORK[best.role]} on ${best.delivered} ${best.delivered === 1 ? 'rollout' : 'rollouts'}`;
}

/** "A graphic designer", "An A&R", "Someone for PR". */
export function neededLabel(role: DirectoryRole): string {
  if (role === 'pr') return 'Someone for PR';
  const label = DIRECTORY_ROLE_LABELS[role];
  const lower = /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
  return `${/^[aeiouAEIOU]/.test(label) ? 'An' : 'A'} ${lower}`;
}

export type RolloutNeed = {
  role: DirectoryRole;
  releaseId: string;
  releaseTitle: string;
  taskId: string;
  taskTitle: string;
  dueDate: string | null;
};

/**
 * The role gaps (lib/role-gaps.ts, the same rule the rollout's panel uses)
 * across every rollout you own, soonest first. A rollout somebody shared with
 * you is theirs to hire for, as on the rollout page.
 */
export function rolloutNeeds(
  releases: readonly { id: string; title: string; ownerUserId: string }[],
  tasks: readonly (GapTask & { releaseId: string | null })[],
  viewerId: string
): RolloutNeed[] {
  if (!viewerId) return [];
  const needs: RolloutNeed[] = [];
  for (const release of releases) {
    if (release.ownerUserId !== viewerId) continue;
    const gaps = findRoleGaps(
      tasks.filter((task) => task.releaseId === release.id),
      release.ownerUserId
    );
    for (const gap of gaps) {
      needs.push({
        role: gap.role,
        releaseId: release.id,
        releaseTitle: release.title,
        taskId: gap.taskId,
        taskTitle: gap.taskTitle,
        dueDate: gap.dueDate,
      });
    }
  }
  return needs.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.releaseTitle.localeCompare(b.releaseTitle);
  });
}
