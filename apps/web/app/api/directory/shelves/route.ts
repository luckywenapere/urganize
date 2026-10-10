import { NextResponse, type NextRequest } from 'next/server';
import { loadShelvesForViewer } from '@/lib/directory-featuring-server';
import {
  createAdminClient,
  directoryDisabledResponse,
  isDirectoryFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../_shared';

/**
 * The two shelves at the top of the directory: Featured and On the rise this
 * month (directory spec, section 6, "Featured, not ranked").
 *
 * Neither is a ranking. Featured is whoever Urganize has picked for a quarter,
 * On the rise is a monthly snapshot earned from delivered work, and both only
 * ever hold PUBLISHED profiles. The set of roles is returned in the order that
 * suits the person asking (an artist sees managers first, a manager sees the
 * creatives first), which is the one thing that is personal about it.
 *
 * Open to every plan, like the directory read it sits on top of. Fails to empty
 * shelves rather than an error: a directory without its shelves is still the
 * directory.
 */
export async function GET(request: NextRequest) {
  if (!isDirectoryFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const payload = await loadShelvesForViewer(adminClient, { userId: auth.user.id });
  return NextResponse.json(payload);
}
