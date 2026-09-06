import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { profileRoles } from '@/lib/person-profile';
import type { DirectoryRole } from '@/lib/directory-roles';
import type { PersonLink, PersonProfile, ProfileRole } from '@/types/directory';

// Shared helpers for the directory route group: table constants, the feature
// flag, and the row mapper.
//
// No schema-missing fallback here on purpose, and this module must never
// import app/api/releases/_shared.ts, which still carries those deprecated
// helpers — lib/schema-fallback-guard.test.ts fails the build for a new file
// that does. The press kit group's header says the same thing for the same
// reason.

export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  createAdminClient,
} from '@/app/api/_shared/auth';

export const PERSON_PROFILES_TABLE = 'person_profiles';
export const DELIVERY_RECORDS_TABLE = 'delivery_records';

export const PERSON_PROFILE_COLUMNS =
  'id, user_id, display_name, slug, roles, city, country, availability, bio, links, avatar_storage_path, avatar_file_name, visibility, created_at, updated_at';

/**
 * The directory stays dark until NEXT_PUBLIC_FEATURE_DIRECTORY is 'true'.
 * Checked FIRST in every handler, before auth, so a direct API call cannot
 * reach it either and the 404 cannot be told apart from a route that does not
 * exist.
 */
export const isDirectoryFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true';

export const directoryDisabledResponse = () =>
  NextResponse.json({ error: 'Not found.' }, { status: 404 });

export function asRow(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readLinks(value: unknown): PersonLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRow(entry))
    .filter((entry) => typeof entry.label === 'string' && typeof entry.url === 'string')
    .map((entry) => ({ label: String(entry.label), url: String(entry.url) }));
}

export function toPersonProfile(row: Record<string, unknown>): PersonProfile {
  return {
    id: String(row.id || ''),
    userId: String(row.user_id || ''),
    displayName: String(row.display_name || ''),
    slug: row.slug ? String(row.slug) : null,
    roles: Array.isArray(row.roles) ? (row.roles as DirectoryRole[]) : [],
    city: row.city ? String(row.city) : null,
    country: row.country ? String(row.country) : null,
    availability: (row.availability as PersonProfile['availability']) || 'selective',
    bio: row.bio ? String(row.bio) : null,
    links: readLinks(row.links),
    // Never persisted or returned as a stored url: the avatar lives behind a
    // signed url with a TTL, so it is minted per response by whoever needs it.
    avatarUrl: null,
    visibility: (row.visibility as PersonProfile['visibility']) || 'private',
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

/**
 * A person's own delivery record, folded into their claimed roles.
 *
 * Reads as service role, but only ever for the user id it is handed. RLS would
 * allow a user to read their own rows directly; this path exists because the
 * same helper serves the profile route today and the directory read tomorrow,
 * where the caller is somebody else.
 */
export async function loadProfileRoles(
  admin: SupabaseClient,
  userId: string,
  claimed: DirectoryRole[]
): Promise<ProfileRole[]> {
  const { data, error } = await admin
    .from(DELIVERY_RECORDS_TABLE)
    .select('role')
    .eq('user_id', userId);

  // Fails to the claimed roles with no counts rather than throwing. A profile
  // that renders without its numbers is worth more than an error page, and the
  // numbers are visibly absent rather than silently wrong.
  if (error || !data) return profileRoles(claimed, []);

  return profileRoles(
    claimed,
    data.map((row) => ({ role: String(asRow(row).role || '') as DirectoryRole }))
  );
}
