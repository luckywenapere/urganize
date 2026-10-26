import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { makeCatalogueLink } from '@/lib/artist-import/links-server';

// Makes one Altlink link for one imported release. The person has already
// confirmed in the notice; the daily cap and the one-link-per-release rule are
// enforced here, never trusted from the page.
export async function POST(request: NextRequest, context: { params: Promise<{ artistId: string; releaseId: string }> }) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { releaseId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(releaseId)) return NextResponse.json({ error: 'Release not found.' }, { status: 404 });

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
  try {
    const outcome = await makeCatalogueLink(auth.adminClient, {
      releaseRowId: releaseId,
      workspaceIds: access.workspaceIds,
      userId: auth.user.id,
      userEmail: auth.user.email ?? null,
    });
    switch (outcome.kind) {
      case 'made':
        return NextResponse.json({ url: outcome.url, cap: outcome.cap });
      case 'exists':
        return NextResponse.json({ url: outcome.url, existing: true });
      case 'cap':
        return NextResponse.json(
          { error: 'That is all the links for today.', reason: 'cap', cap: outcome.cap },
          { status: 429 }
        );
      case 'no_code':
        return NextResponse.json({ error: 'This release has no UPC or ISRC yet.', reason: 'no_code' }, { status: 422 });
      case 'busy':
        return NextResponse.json({ error: 'A link is already being made for this release.', reason: 'busy' }, { status: 409 });
      case 'unavailable':
        return NextResponse.json({ error: 'Links are not available right now.', reason: 'unavailable' }, { status: 503 });
      case 'rate_limited':
        return NextResponse.json({ error: 'Altlink is busy. Try again in a minute.', reason: 'rate_limited' }, { status: 429 });
      case 'not_on_stores':
        return NextResponse.json(
          { error: 'Streaming services do not list this release yet. Try again later.', reason: 'not_on_stores' },
          { status: 409 }
        );
      case 'not_found':
        return NextResponse.json({ error: 'Release not found.' }, { status: 404 });
      default:
        return NextResponse.json({ error: 'Could not make the link. Try again.', reason: 'failed' }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not make the link.' },
      { status: 500 }
    );
  }
}
