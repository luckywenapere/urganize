import { NextResponse, type NextRequest } from 'next/server';
import { loadShelves } from '@/lib/featured-shelves-server';
import {
  createAdminClient,
  directoryDisabledResponse,
  isDirectoryFeatureEnabled,
  loadProfileTypeOverrides,
  PERSON_PROFILES_TABLE,
  requireActiveAuthenticatedUser,
  asRow,
} from '../_shared';
import { effectiveProfileType } from '@/lib/directory-profile-type';
import type { DirectoryRole } from '@/lib/directory-roles';

/**
 * The two shelves above the directory: Featured and On the rise this month.
 *
 * Read only, and only for a signed-in person under the same rules as the
 * directory itself. A shelf that cannot be built answers with empty lists, not
 * an error: it sits on top of a page that works without it.
 *
 * Nothing here is ordered by money or by who searched what, and nothing is
 * sold: lib/featured-shelves-guard.test.ts holds that.
 */
export async function GET(request: NextRequest) {
  if (!isDirectoryFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  // The viewer's own profile type (the same one the directory orders by).
  let viewerProfileType: string | null = null;
  try {
    const [{ data: own }, overrides] = await Promise.all([
      adminClient.from(PERSON_PROFILES_TABLE).select('roles').eq('user_id', auth.user.id).maybeSingle(),
      loadProfileTypeOverrides(adminClient, [auth.user.id]),
    ]);
    const roles = Array.isArray(asRow(own).roles) ? (asRow(own).roles as DirectoryRole[]) : [];
    viewerProfileType = own ? effectiveProfileType(overrides.get(auth.user.id), roles) : null;
  } catch {
    viewerProfileType = null;
  }

  const shelves = await loadShelves(adminClient, auth.user.id, new Date(), viewerProfileType);
  return NextResponse.json(shelves, { headers: { 'Cache-Control': 'private, no-store' } });
}
