import { NextResponse, type NextRequest } from 'next/server';
import { getEntitlement, minimumTierWith } from '@/lib/entitlements';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { PRICING_TIERS } from '@urganize/pricing';
import { profileRoles } from '@/lib/person-profile';
import type { DirectoryRole } from '@/lib/directory-roles';
import type { DirectoryEntry } from '@/lib/directory-search';
import {
  DELIVERY_RECORDS_TABLE,
  PERSON_PROFILES_TABLE,
  asRow,
  createAdminClient,
  directoryDisabledResponse,
  isDirectoryFeatureEnabled,
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
 * SEARCHING IS MANAGER AND UP; being listed is free on every tier. Supply free,
 * demand paid (founder call). Inert today, since no real team resolves to solo.
 */

const DIRECTORY_PAGE_SIZE = 200;

export async function GET(request: NextRequest) {
  if (!isDirectoryFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  // The acting user's own team. getTeamAccessForUser already carries the tier
  // and is 30s-cached, so this is the cheap answer as well as the right one;
  // getWorkspaceTier asks about a workspace and is for the invite-redemption
  // case, where the actor is not who is paying. Everything not confidently a
  // paying Solo resolves to an uncapped tier, so this gates nobody today.
  const access = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (!getEntitlement(access.tier, 'directory_search')) {
    // Named from the map rather than hardcoded, so a later re-cut of the tiers
    // cannot leave this sentence pointing at a plan that no longer exists.
    const minimumPlan = minimumTierWith('directory_search');
    const planLabel = minimumPlan ? PRICING_TIERS[minimumPlan].label : 'a higher plan';
    return NextResponse.json(
      {
        error: `Searching the directory is on ${planLabel} and up.`,
        reason: 'plan_required',
        minimumPlan: minimumPlan ?? undefined,
      },
      { status: 403 }
    );
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

  const entries: (DirectoryEntry & { slug: string | null; isPublic: boolean })[] = listed.map(
    (row) => {
      const userId = String(row.user_id || '');
      const claimed = Array.isArray(row.roles) ? (row.roles as DirectoryRole[]) : [];
      const visibility = String(row.visibility || 'private');

      return {
        userId,
        displayName: String(row.display_name || ''),
        city: row.city ? String(row.city) : null,
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
      };
    }
  );

  return NextResponse.json({ people: entries, truncated });
}
