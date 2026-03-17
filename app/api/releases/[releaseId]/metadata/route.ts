import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  loadReleaseCommandCenterData,
} from '../../_shared';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const commandCenter = await loadReleaseCommandCenterData(adminClient!, ownership.release);
  if ('error' in commandCenter) return commandCenter.error;

  return NextResponse.json({
    release: ownership.release,
    metadata: commandCenter.metadata,
    readiness: commandCenter.readiness,
  });
}
