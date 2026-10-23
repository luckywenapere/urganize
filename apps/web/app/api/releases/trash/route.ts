import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '../_shared';
import { listTrashedReleases } from '@/lib/rollout-trash-server';

// The caller's own rollouts in Trash. Owner-only, like deleting: a teammate
// never sees a Restore button the API would refuse.
export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    const items = await listTrashedReleases(auth.adminClient, auth.user.id);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load Trash.' },
      { status: 500 }
    );
  }
}
