import { normalizeName } from './person-identity';

// Search and filters for the contact list (Relationships, Phase 2). A team's
// book is hundreds of people at most, so the list is fetched once and filtered
// in the browser, the way tasks, releases and notes are. Pure, so it is tested.

export type FilterableRelationship = {
  personId: string;
  label: string;
  role: string;
  tags: string[];
  lastContactAt: string | null;
  /** Only present for somebody who claimed a profile and chose to be listed. */
  profile: { city: string | null; country: string | null } | null;
};

export type RelationshipFilter = {
  query?: string;
  role?: string;
  tag?: string;
  /** Only people not contacted in this many days, or never. */
  staleDays?: number;
};

const DAY_MS = 86_400_000;

/** True when the last contact is older than `days`, or there was none. A date
 *  that cannot be read counts as none: surfacing somebody for a follow-up is
 *  the safe way to be wrong. */
export function isStale(lastContactAt: string | null, days: number, now: Date = new Date()): boolean {
  if (!lastContactAt) return true;
  const time = new Date(lastContactAt).getTime();
  if (Number.isNaN(time)) return true;
  return now.getTime() - time > days * DAY_MS;
}

const searchText = (item: FilterableRelationship): string =>
  normalizeName(
    [item.label, item.role, item.tags.join(' '), item.profile?.city ?? '', item.profile?.country ?? ''].join(' ')
  );

export function filterRelationships<T extends FilterableRelationship>(
  items: T[],
  filter: RelationshipFilter,
  now: Date = new Date()
): T[] {
  const terms = normalizeName(filter.query ?? '')
    .split(' ')
    .filter(Boolean);
  const role = normalizeName(filter.role ?? '');
  const tag = (filter.tag ?? '').trim().toLowerCase();

  return items.filter((item) => {
    if (terms.length > 0) {
      const haystack = searchText(item);
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    if (role && normalizeName(item.role) !== role) return false;
    if (tag && !item.tags.includes(tag)) return false;
    if (filter.staleDays !== undefined && !isStale(item.lastContactAt, filter.staleDays, now)) return false;
    return true;
  });
}

/** The roles in use, one spelling each (lowercased), for the filter menu. */
export function distinctRoles(items: Array<{ role: string }>): string[] {
  return [...new Set(items.map((item) => item.role.trim().toLowerCase()).filter(Boolean))].sort();
}

export function distinctTags(items: Array<{ tags: string[] }>): string[] {
  return [...new Set(items.flatMap((item) => item.tags))].sort();
}
