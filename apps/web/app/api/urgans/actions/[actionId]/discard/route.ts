import { NextRequest, NextResponse } from 'next/server';

import { requireUrgansAccess } from '@/app/api/_shared/urgans-access';
import { discardUrgansAction, isUrgansActionsEnabled } from '@/lib/urgans-actions/server';

/**
 * POST /api/urgans/actions/[actionId]/discard — throw away a drafted run
 * that was never applied. Idempotent: discarding an already-discarded row
 * succeeds silently.
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

  const result = await discardUrgansAction(auth.adminClient, { actionId, actor: auth.user });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
