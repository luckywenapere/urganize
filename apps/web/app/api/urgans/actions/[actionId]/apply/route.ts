import { NextRequest, NextResponse } from 'next/server';

import { requireUrgansAccess } from '@/app/api/_shared/urgans-access';
import { applyUrgansAction, isUrgansActionsEnabled } from '@/lib/urgans-actions/server';

/**
 * POST /api/urgans/actions/[actionId]/apply — commit a drafted action's
 * output. Idempotent: applyUrgansAction's own claim (decideApplyClaim)
 * refuses to run the write twice for the same row, so a double-tap or two
 * open tabs both land on the same result.
 *
 * The body is deliberately ignored. release.draft_plan's own apply() reads
 * release_plan_drafts fresh rather than trusting anything carried through
 * this call — see that action's module header.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ actionId: string }> }
) {
  if (!isUrgansActionsEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireUrgansAccess(request);
  if ('error' in auth) return auth.error;

  const { actionId } = await context.params;
  if (!actionId) {
    return NextResponse.json({ error: 'actionId is required.' }, { status: 400 });
  }

  const result = await applyUrgansAction(auth.adminClient, { actionId, actor: auth.user });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ result: result.result });
}
