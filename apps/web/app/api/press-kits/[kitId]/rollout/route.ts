import { NextResponse, type NextRequest } from 'next/server';
import { loadPressKitSources } from '@/lib/press-kit-autofill-server';
import { buildRolloutProposals } from '@/lib/press-kit-rollout';
import {
  PRESS_KIT_SECTIONS_TABLE,
  PRESS_KIT_SECTION_COLUMNS,
  asRow,
  createAdminClient,
  ensurePressKitAccess,
  isPressKitsFeatureEnabled,
  pressKitsDisabledResponse,
  requireActiveAuthenticatedUser,
  toPressKitSection,
} from '../../_shared';

/**
 * What a release that has landed since would change on this kit.
 *
 * READ ONLY, and that is the whole design rather than an omission. Autofill
 * runs once and refuses anything somebody has touched; this proposes, over
 * hand written sections included, and a person accepts each one. There is no
 * apply endpoint here because accepting a proposal IS an ordinary section
 * save: it goes through PATCH .../sections/{section}, which sets the source to
 * 'user' and writes a history row, so an accepted roll in can be undone from
 * the section's own version list like any other edit.
 *
 * Returning an empty list is the normal answer. A kit that is already current
 * proposes nothing and the banner stays away.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kitId: string }> }
) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { kitId } = await context.params;
  if (!kitId) {
    return NextResponse.json({ error: 'Press kit id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensurePressKitAccess(adminClient, kitId, auth.user, false);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient
    .from(PRESS_KIT_SECTIONS_TABLE)
    .select(PRESS_KIT_SECTION_COLUMNS)
    .eq('kit_id', kitId)
    .order('position', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not read the press kit.' },
      { status: 500 }
    );
  }

  const sections = (data || []).map((row) => toPressKitSection(asRow(row)));

  // Read against the KIT'S owner rather than whoever is signed in: a teammate
  // looking at somebody else's kit has to see the same releases and the same
  // team the owner would.
  //
  // Resolved by a direct lookup rather than through loadWorkspaceAccessContext,
  // which needs a signed-in user object and would answer for the CALLER.
  // workspaces.owner_id is unique, so owner and team are one to one here.
  const { data: workspaceRow } = await adminClient
    .from('workspaces')
    .select('id')
    .eq('owner_id', access.ownerUserId)
    .maybeSingle();

  const sources = await loadPressKitSources(adminClient, {
    artistId: access.artistId,
    workspaceId: String(asRow(workspaceRow).id || ''),
    ownerUserId: access.ownerUserId,
  });

  return NextResponse.json({ proposals: buildRolloutProposals(sources, sections) });
}
