import { NextResponse, type NextRequest } from 'next/server';
import { verifyAdmin } from '../_shared';
import { runDeliveryBackfill } from '@/lib/delivery-records-server';

/**
 * Compute what every person has delivered, and report it before writing it.
 *
 * GET is the DRY RUN and writes nothing. POST writes. That split is the point
 * of this route rather than a convenience: the one way the directory fails
 * badly is by crediting somebody with work they did not do, and the report's
 * SHAPE is what says whether it has. If one role holds every record, or one
 * person holds dozens, the not-the-owner filter in lib/delivery-records.ts has
 * regressed and this must not be allowed to write.
 *
 * So: run GET, read `byRole`, then POST.
 *
 * DELIBERATELY NOT FLAG GATED, the /api/admin/teams precedent. The founder has
 * to be able to see what the backfill would do before the directory is
 * switched on for anybody, and a console that only works once the feature is
 * live is a console that cannot answer the question it exists for.
 *
 * Writing is an upsert on the unique index, so running it twice changes
 * nothing and a re-run after a rule change corrects rows in place.
 */

export async function GET(request: NextRequest) {
  const auth = await verifyAdmin(request);
  if (!auth.ok) return auth.response;

  const ownerUserId = new URL(request.url).searchParams.get('owner') || undefined;

  try {
    const report = await runDeliveryBackfill(auth.supabaseAdmin, { ownerUserId, write: false });
    return NextResponse.json({ dryRun: true, report });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not run the dry run.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdmin(request);
  if (!auth.ok) return auth.response;

  const ownerUserId = new URL(request.url).searchParams.get('owner') || undefined;

  try {
    const report = await runDeliveryBackfill(auth.supabaseAdmin, { ownerUserId, write: true });
    return NextResponse.json({ dryRun: false, report });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not write delivery records.' },
      { status: 500 }
    );
  }
}
