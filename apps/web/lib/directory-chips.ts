import type { DirectoryFilters, DirectoryEntry } from './directory-search';
import { DIRECTORY_ROLE_LABELS } from './directory-roles';
import { PROFILE_TYPE_LABELS, type ProfileType } from './directory-profile-type';

/**
 * The directory's four role chips and the small words on each row (URG-304).
 *
 * Pure and client-safe. The page keeps every filter it had (a role gaps link
 * still arrives with ?role=…&availability=open); the chips are just the four
 * one-tap answers most people come for.
 *
 * Managers is the profile TYPE, not the `manager` role: the release owner's
 * own management work is never a delivery record (lib/directory-roles.ts), so a
 * role filter would hide most managers. A&R and PR are roles.
 */

export const DIRECTORY_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'managers', label: 'Managers' },
  { key: 'a_and_r', label: 'A&R' },
  { key: 'pr', label: 'PR' },
] as const;

export type DirectoryChipKey = (typeof DIRECTORY_CHIPS)[number]['key'];

/** The filter change a chip makes. Every chip clears the other three's filters. */
export function chipFilters(key: DirectoryChipKey): Pick<DirectoryFilters, 'role' | 'profileType'> {
  switch (key) {
    case 'managers':
      return { role: null, profileType: 'manager' };
    case 'a_and_r':
      return { role: 'a_and_r', profileType: null };
    case 'pr':
      return { role: 'pr', profileType: null };
    default:
      return { role: null, profileType: null };
  }
}

/** Which chip reads as on. Null when a link set a role the chips do not name. */
export function activeChip(filters: Pick<DirectoryFilters, 'role' | 'profileType'>): DirectoryChipKey | null {
  const role = filters.role ?? null;
  const type = filters.profileType ?? null;
  if (!role && !type) return 'all';
  if (!role && type === 'manager') return 'managers';
  if (role === 'a_and_r' && !type) return 'a_and_r';
  if (role === 'pr' && !type) return 'pr';
  return null;
}

/** The one role a row leads with: delivered work first, then their own word,
 *  then their profile type. Empty when there is nothing honest to say. */
export function leadRoleLabel(entry: Pick<DirectoryEntry, 'roles' | 'profileType'>): string {
  const delivered = entry.roles.find((held) => held.delivered > 0);
  if (delivered) return DIRECTORY_ROLE_LABELS[delivered.role];
  const first = entry.roles[0];
  if (first) return DIRECTORY_ROLE_LABELS[first.role];
  const type = entry.profileType as ProfileType | null | undefined;
  return type ? PROFILE_TYPE_LABELS[type] : '';
}

/** "Manager · Lagos". Either half alone when the other is missing. */
export function rowMeta(entry: Pick<DirectoryEntry, 'roles' | 'profileType' | 'city'>): string {
  return [leadRoleLabel(entry), (entry.city ?? '').trim()].filter(Boolean).join(' · ');
}

/** The tick is the product vouching: at least one delivered record. A role
 *  somebody only typed for themselves earns no tick. */
export function isVouched(entry: Pick<DirectoryEntry, 'roles'>): boolean {
  return entry.roles.some((held) => held.delivered > 0);
}

/** "Tobi Adeyemi" -> "Tobi A.", for a face tile. One word stays as it is. */
export function shelfName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0]?.toUpperCase() ?? ''}.`;
}

/** One Rising shelf: Featured first, then On the rise, each person once. */
export function risingShelf<T extends { userId: string }>(featured: T[], onTheRise: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const person of [...featured, ...onTheRise]) {
    if (!person.userId || seen.has(person.userId)) continue;
    seen.add(person.userId);
    out.push(person);
  }
  return out;
}
