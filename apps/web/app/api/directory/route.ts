import { NextResponse, type NextRequest } from 'next/server';
import { profileRoles } from '@/lib/person-profile';
import type { DirectoryRole } from '@/lib/directory-roles';
import type { DirectoryEntry } from '@/lib/directory-search';
import { loadKitCitiesForUsers } from '@/lib/profile-kit-server';
import {
  EMPTY_LEAD_STATS,
  effectiveProfileType,
  leadLine,
  viewerTypeFor,
  type ProfileType,
} from '@/lib/directory-profile-type';
import { loadLeadStats } from '@/lib/profile-lead-stats-server';
import { loadPersonPhotoUrls } from '@/lib/profile-photo-server';
import {
  DELIVERY_RECORDS_TABLE,
  PERSON_PROFILES_TABLE,
  asRow,
  createAdminClient,
  directoryDisabledResponse,
  isDirectoryFeatureEnabled,
  loadProfileTypeOverrides,
  requireActiveAuthenticatedUser,
} from './_shared';

/**
 * Everyone who has opted in, in one read.
 *
 * The page filters this set in the browser rather than querying per keystroke,
 * and lib/directory-search.ts carries the full reasoning. The short version:
 * the empty state has to say how many people exist NEARBY, which is free with
 * the set in hand and a round trip per suggestion without it.
 *
 * BOUNDED. The cap is real and the response says when it was hit, so the page
 * can be honest rather than silently partial. At current volume it is nowhere
 * near binding; the day it is, this is where paging or a real index goes.
 *
 * SEARCHING IS OPEN TO EVERY PLAN, Solo and trials included (strategy doc,
 * section 10, 2026-10-02). It was Manager and up from 2026-09-05; the doc
 * moved the money to the take rate on hires instead of charging to search.
 * tier-limits-guard.test.ts holds this route to reading no entitlement.
 * The paywall still applies: a team with no plan and no trial cannot search.
 */

const DIRECTORY_PAGE_SIZE = 200;


async function readViewerType(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string
): Promise<ProfileType> {
  let profileType: ProfileType | null = null;
  try {
    const [{ data: own }, overrides, { data: account }] = await Promise.all([
      admin.from(PERSON_PROFILES_TABLE).select('roles').eq('user_id', userId).maybeSingle(),
      loadProfileTypeOverrides(admin, [userId]),
      admin.from('profiles').select('role').eq('id', userId).maybeSingle(),
    ]);
    const roles = Array.isArray(asRow(own).roles) ? (asRow(own).roles as DirectoryRole[]) : [];
    profileType = own ? effectiveProfileType(overrides.get(userId), roles) : null;
    return viewerTypeFor({ profileType, accountRole: String(asRow(account).role || '') });
  } catch {
    return viewerTypeFor({ profileType, accountRole: null });
  }
}

export async function GET(request: NextRequest) {
  if (!isDirectoryFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data, error } = await adminClient
    .from(PERSON_PROFILES_TABLE)
    .select('user_id, display_name, slug, roles, city, country, availability, visibility')
    .neq('visibility', 'private')
    .order('updated_at', { ascending: false })
    .limit(DIRECTORY_PAGE_SIZE + 1);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not read the directory.' },
      { status: 500 }
    );
  }

  const rows = (data || []).map(asRow);
  const truncated = rows.length > DIRECTORY_PAGE_SIZE;
  const listed = truncated ? rows.slice(0, DIRECTORY_PAGE_SIZE) : rows;

  // One query for every record rather than one per person. The counts are the
  // whole point of a card, so N+1 here would be N+1 on the first paint.
  const userIds = listed.map((row) => String(row.user_id || '')).filter(Boolean);
  const recordsByUser = new Map<string, DirectoryRole[]>();

  if (userIds.length > 0) {
    const { data: records } = await adminClient
      .from(DELIVERY_RECORDS_TABLE)
      .select('user_id, role')
      .in('user_id', userIds);

    for (const raw of records || []) {
      const row = asRow(raw);
      const userId = String(row.user_id || '');
      if (!userId) continue;
      const held = recordsByUser.get(userId) ?? [];
      held.push(String(row.role || '') as DirectoryRole);
      recordsByUser.set(userId, held);
    }
  }

  // An artist's place comes from their PUBLISHED press kit when one stands
  // behind the profile (lib/profile-kit.ts), the profile's own city otherwise.
  // Three queries for the whole list, never one per card. NO BIO is selected or
  // returned here at all, which is also what keeps a bio off every unclaimed
  // profile: this read has never carried one.
  const kitCities = await loadKitCitiesForUsers(adminClient, userIds);


  // The type each card leads with, and the line it leads with. Both are read
  // tolerantly: no override column or an unreadable table just shortens a card.
  // Faces ride in the same parallel batch: one tolerant query plus cached
  // signatures, so a card with no photo shows initials and a failure shows
  // initials everywhere rather than an error page.
  const [overrides, leadStats, photoUrls] = await Promise.all([
    loadProfileTypeOverrides(adminClient, userIds),
    loadLeadStats(adminClient, userIds),
    loadPersonPhotoUrls(adminClient, userIds),
  ]);

  const entries: (DirectoryEntry & {
    slug: string | null;
    isPublic: boolean;
    lead: string;
  })[] = listed.map(
    (row) => {
      const userId = String(row.user_id || '');
      const claimed = Array.isArray(row.roles) ? (row.roles as DirectoryRole[]) : [];
      const visibility = String(row.visibility || 'private');
      const heldRoles = [
        ...claimed,
        ...(recordsByUser.get(userId) ?? []),
      ];
      const profileType = effectiveProfileType(overrides.get(userId), heldRoles);

      return {
        userId,
        displayName: String(row.display_name || ''),
        city: kitCities.get(userId) ?? (row.city ? String(row.city) : null),
        availability: (row.availability as DirectoryEntry['availability']) || 'selective',
        roles: profileRoles(
          claimed,
          (recordsByUser.get(userId) ?? []).map((role) => ({ role }))
        ),
        slug: row.slug ? String(row.slug) : null,
        // A card links to /p/{slug} only for a PUBLIC profile. A directory-only
        // person is findable here and their page is not open, so offering the
        // link would hand somebody a 404.
        isPublic: visibility === 'public',
        profileType,
        lead: leadLine(profileType, leadStats.get(userId) ?? EMPTY_LEAD_STATS),
        avatarUrl: photoUrls.get(userId) ?? null,
      };
    }
  );

  // What kind of reader this is, so the page can put the right people first and
  // decide who gets a Message button. Their own profile type wins; without a
  // profile their account role decides (lib/directory-profile-type.ts).
  const viewerType = await readViewerType(adminClient, auth.user.id);

  return NextResponse.json({ people: entries, truncated, viewerType });
}
