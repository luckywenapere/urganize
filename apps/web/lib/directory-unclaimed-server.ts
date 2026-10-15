import type { SupabaseClient } from '@supabase/supabase-js';
import { RELEASE_CREDIT_ROLE_LABELS, type ReleaseCreditRole } from '@/types/credits';
import { IN_LIST_CHUNK, inChunks } from './paged-rows';

/**
 * Unclaimed people the directory may list (URG-304).
 *
 * EXACTLY the set /p/{slug} already serves to anyone (lib/person-unclaimed-
 * server.ts), narrowed further, never wider:
 *   - status `unclaimed`, a slug, no removal asked for and none done;
 *   - AND at least one attested, visible credit on a rollout
 *     (`release_credit_submissions.person_id`, confirmed_accurate, not hidden).
 *
 * The credit rule is what keeps this to the strategy doc's seeded-profile rule
 * (built only from credits on a released rollout): a consent-pending profile
 * from founder seeding or a Directory invite has no credit, so it never shows
 * here, and nothing about it is public until the person publishes it.
 *
 * Only public business facts leave this file: the name on the credit, the
 * handle, and the role they were credited for. No contact, no city, no bio.
 * Never throws; any failure is an empty list, so the directory still opens.
 */

export type ListedUnclaimed = {
  personId: string;
  displayName: string;
  slug: string;
  /** The credited role as a word ("Producer"), or empty. */
  roleLabel: string;
};

const LIMIT = 100;

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const roleWord = (role: string): string =>
  role in RELEASE_CREDIT_ROLE_LABELS ? RELEASE_CREDIT_ROLE_LABELS[role as ReleaseCreditRole] : '';

export async function loadListedUnclaimed(admin: SupabaseClient): Promise<ListedUnclaimed[]> {
  try {
    const { data, error } = await admin
      .from('person_profiles')
      .select('id, display_name, slug')
      .eq('status', 'unclaimed')
      .is('user_id', null)
      .is('removal_requested_at', null)
      .is('removed_at', null)
      .not('slug', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(LIMIT);
    if (error || !data || data.length === 0) return [];

    const profiles = data.map(asRow).filter((row) => text(row.id) && text(row.slug) && text(row.display_name).trim());
    const roleByPerson = new Map<string, string>();
    for (const ids of inChunks(profiles.map((row) => text(row.id)), IN_LIST_CHUNK)) {
      const credits = await admin
        .from('release_credit_submissions')
        .select('person_id, roles')
        .in('person_id', ids)
        .eq('confirmed_accurate', true)
        .eq('person_hidden', false);
      if (credits.error) return [];
      for (const row of (credits.data || []).map(asRow)) {
        const personId = text(row.person_id);
        if (!personId) continue;
        const roles = Array.isArray(row.roles) ? (row.roles as unknown[]).map(text).map(roleWord).filter(Boolean) : [];
        if (!roleByPerson.has(personId) || (!roleByPerson.get(personId) && roles[0])) {
          roleByPerson.set(personId, roles[0] ?? '');
        }
      }
    }

    return profiles
      .filter((row) => roleByPerson.has(text(row.id)))
      .map((row) => ({
        personId: text(row.id),
        displayName: text(row.display_name).trim(),
        slug: text(row.slug),
        roleLabel: roleByPerson.get(text(row.id)) ?? '',
      }));
  } catch {
    return [];
  }
}
