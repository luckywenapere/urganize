import { NextResponse, type NextRequest } from 'next/server';
import {
  isPressKitsFeatureEnabled,
  recordPressKitEvent,
  resolvePublishedKitId,
} from '@/lib/press-kit-public-server';

/**
 * A press kit was opened.
 *
 * UNAUTHENTICATED BY DESIGN. The reader has no account, and the published slug
 * is the whole of the access control, exactly as it is for the page itself.
 *
 * Fired from the browser rather than counted during the server render, for two
 * reasons: a crawler that never runs scripts does not inflate the number, and a
 * tracking write has no business sitting in the path of the page appearing.
 *
 * What this can never answer is WHO opened it. One permanent link per artist
 * forecloses the per-recipient tokens that let a DJ pack name its reader, so
 * the honest scope is counts and timestamps.
 *
 * Always 204, even for a slug that resolves to nothing. A beacon that reported
 * whether a kit existed would be a way to enumerate unpublished artists.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  if (!isPressKitsFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { slug } = await context.params;
  const kitId = await resolvePublishedKitId(slug);
  if (kitId) {
    await recordPressKitEvent({ kitId, action: 'viewed' });
  }

  return new NextResponse(null, { status: 204 });
}
