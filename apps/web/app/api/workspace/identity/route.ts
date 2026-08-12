import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuthenticatedAdmin,
  loadWorkspaceAccessContext,
  loadWorkspaceMembers,
} from '@/lib/tasks-server';
import { getWorkspaceArtist } from '@/lib/artists-server';
import { buildWorkspaceLogoPayload } from '@/lib/workspace-logo';
import { parseAdminEmails } from '@/app/api/admin/_shared';

// Aggregate read for the workspace identity card (URG-214): name, artist,
// logo, and active-teammate count in one round trip, since the card mounts
// as persistent app chrome and would otherwise cost three separate requests
// (each re-running auth + workspace resolution) on every cold load. Gated by
// both feature flags — the identity panel only makes sense when the
// underlying workspace-consolidation flag is also on — mirroring
// /api/workspace/artist and /api/workspace/logo, which this route composes.
const isFlagOn = () =>
  process.env.NEXT_PUBLIC_FEATURE_IDENTITY_PANEL === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

export async function GET(request: NextRequest) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId || !access.primaryWorkspace) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    const workspaceId = access.primaryWorkspaceId;

    const [artist, logo, members] = await Promise.all([
      getWorkspaceArtist(adminClient, workspaceId),
      buildWorkspaceLogoPayload(adminClient, workspaceId),
      loadWorkspaceMembers(adminClient, workspaceId, auth.user.id),
    ]);

    const memberCount = members.filter((member) => member.status === 'active').length;

    // Whether to show the Admin link in the identity card's nav (URG-229).
    // Folded into this response rather than given its own request: the card
    // is chrome on every page, and /api/admin/me would add a round trip per
    // load for a link almost nobody sees. `parseAdminEmails` is a pure env
    // read and `auth.user` is already resolved, so this costs nothing extra.
    // It gates VISIBILITY only — every /admin page and route still runs its
    // own `verifyAdmin`, so a forged client can't reach admin data.
    const adminEmails = parseAdminEmails();
    const isAdmin = Boolean(
      auth.user.email && adminEmails.includes(auth.user.email.trim().toLowerCase())
    );

    return NextResponse.json({
      workspaceId,
      name: access.primaryWorkspace.name,
      artist: artist
        ? {
            id: artist.id,
            name: artist.name,
            slug: artist.slug,
          }
        : null,
      logo,
      memberCount,
      isAdmin,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load workspace identity.' },
      { status: 500 }
    );
  }
}
