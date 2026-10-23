import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '../../_shared';
import { restoreRelease } from '@/lib/rollout-trash-server';

// Undo a delete: clears deleted_at, and the rollout comes back with its
// activities, files and notes exactly as they were.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const result = await restoreRelease(auth.adminClient, releaseId, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ status: 'restored', releaseId });
}
