import { createClient } from '@supabase/supabase-js';
import { profileRoles } from './person-profile';
import { isPubliclyReadable } from './person-public';
import type { DirectoryRole } from './directory-roles';
import { loadLeadStats } from './profile-lead-stats-server';
import {
  EMPTY_LEAD_STATS,
  effectiveProfileType,
  leadItems,
  type LeadItem,
  type ProfileType,
} from './directory-profile-type';
import type { PersonProfile, ProfileRole } from '@/types/directory';

/**
 * Resolving /p/{slug} for somebody with no account.
 *
 * Shaped after lib/press-kit-public-server.ts and obeying the same rule: it
 * NEVER throws, and every failure — flag off, bad slug, private profile, a
 * missing table, an infrastructure blip — collapses to the same null. The page
 * turns that into one 404, so a reader cannot tell whether a profile exists and
 * is private from one that never existed.
 *
 * Reads as service role because the caller has no session at all. The gate is
 * the visibility check below, not RLS.
 */

const PERSON_PROFILES_TABLE = 'person_profiles';
const DELIVERY_RECORDS_TABLE = 'delivery_records';

export type PublicPerson = {
  profile: PersonProfile;
  roles: ProfileRole[];
  /** What this person's page leads with. Null when nothing says (no roles, no override). */
  profileType: ProfileType | null;
  /** Their lead numbers, never containing a zero. Empty for a creative. */
  lead: LeadItem[];
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function loadPublicPerson(slug: string): Promise<PublicPerson | null> {
  if (process.env.NEXT_PUBLIC_FEATURE_DIRECTORY !== 'true') return null;

  const handle = slug.trim().toLowerCase();
  if (!handle) return null;

  try {
    const admin = adminClient();
    if (!admin) return null;

    const { data, error } = await admin
      .from(PERSON_PROFILES_TABLE)
      .select(
        'id, user_id, display_name, slug, roles, city, country, availability, bio, links, visibility, created_at, updated_at'
      )
      .eq('slug', handle)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as Record<string, unknown>;
    const visibility = String(row.visibility || 'private') as PersonProfile['visibility'];
    if (!isPubliclyReadable(visibility)) return null;

    const claimed = Array.isArray(row.roles) ? (row.roles as DirectoryRole[]) : [];

    const { data: records } = await admin
      .from(DELIVERY_RECORDS_TABLE)
      .select('role')
      .eq('user_id', String(row.user_id || ''));

    const links = Array.isArray(row.links)
      ? (row.links as Record<string, unknown>[])
          .filter((entry) => typeof entry?.label === 'string' && typeof entry?.url === 'string')
          .map((entry) => ({ label: String(entry.label), url: String(entry.url) }))
      : [];

    const profile: PersonProfile = {
      id: String(row.id || ''),
      userId: String(row.user_id || ''),
      displayName: String(row.display_name || ''),
      slug: row.slug ? String(row.slug) : null,
      roles: claimed,
      city: row.city ? String(row.city) : null,
      country: row.country ? String(row.country) : null,
      availability: (row.availability as PersonProfile['availability']) || 'selective',
      bio: row.bio ? String(row.bio) : null,
      links,
      avatarUrl: null,
      visibility,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };

    const roles = profileRoles(
      claimed,
      (records || []).map((entry) => ({
        role: String((entry as Record<string, unknown>).role || '') as DirectoryRole,
      }))
    );

    // The override is read on its own and tolerantly: the column arrives with
    // its own migration, and a failure here only means the type is worked out
    // from the roles instead.
    let override: unknown = null;
    try {
      const { data: typeRow, error: typeError } = await admin
        .from(PERSON_PROFILES_TABLE)
        .select('profile_type')
        .eq('id', profile.id)
        .maybeSingle();
      if (!typeError) override = (typeRow as Record<string, unknown> | null)?.profile_type ?? null;
    } catch {
      override = null;
    }

    const heldRoles = [...claimed, ...(records || []).map((entry) => String((entry as Record<string, unknown>).role || '') as DirectoryRole)];
    const profileType = effectiveProfileType(override, heldRoles);
    const stats = (await loadLeadStats(admin, [profile.userId])).get(profile.userId) ?? EMPTY_LEAD_STATS;

    return { profile, roles, profileType, lead: leadItems(profileType, stats) };
  } catch {
    return null;
  }
}
