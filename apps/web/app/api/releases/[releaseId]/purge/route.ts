import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '../../_shared';
import { purgeRelease } from '@/lib/rollout-trash-server';

// "Delete forever" from Trash. Only a rollout already in Trash can be purged,
// so this can never skip the first step.
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const { adminClient } = auth;
  const found = await adminClient
    .from('releases')
    .select('id')
    .eq('id', releaseId)
    .eq('owner_user_id', auth.user.id)
    .not('deleted_at', 'is', null)
    .maybeSingle();
  if (found.error) {
    return NextResponse.json({ error: found.error.message || 'Could not load rollout.' }, { status: 500 });
  }
  if (!found.data) return NextResponse.json({ error: 'Rollout not found in Trash.' }, { status: 404 });

  const result = await purgeRelease(adminClient, releaseId, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return new NextResponse(null, { status: 204 });
}
