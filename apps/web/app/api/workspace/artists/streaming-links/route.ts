import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { listArtistsToLink } from '@/lib/artist-streaming/server';

// The team's artists the Home popup should ask to link (Nov 2026, #1088):
// unlinked, and not marked "Not on streaming yet" (unless a rollout of theirs
// has come out since).

export const dynamic = 'force-dynamic';

const isFlagOn = () => process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

export async function GET(request: NextRequest) {
  if (!isFlagOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  try {
    const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
    if (!access.primaryWorkspaceId) return NextResponse.json({ artists: [] });
    const artists = await listArtistsToLink(auth.adminClient, access.primaryWorkspaceId);
    return NextResponse.json({ artists });
  } catch (error) {
    console.error('[artist-streaming] list failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Could not load your artists.' }, { status: 500 });
  }
}
